import { ValidationError } from "@/lib/errors/app-error";
import {
  MAX_PAGE_SIZE,
  paginationInputSchema,
  type PaginationParams,
} from "@/lib/validation/primitives";

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/validation/primitives";
export type {
  PaginationInput,
  PaginationParams,
} from "@/lib/validation/primitives";

/**
 * Parses raw pagination input (e.g. from URL searchParams), throwing a
 * ValidationError rather than silently clamping — a caller that passes a
 * bad page/pageSize should see a clear error, not an unbounded or
 * unexpectedly-defaulted query.
 */
export function parsePagination(input: unknown): PaginationParams {
  const parsed = paginationInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues[0]?.message ?? "Invalid pagination parameters.",
    );
  }
  return parsed.data;
}

/**
 * The inclusive [from, to] range to pass to Supabase's `.range()`,
 * deliberately fetching one row *past* the requested page — toPage() below
 * uses that extra row to report `hasMore` without a separate COUNT query.
 * Every list query must go through this rather than an unbounded
 * `.select()` with no range at all (see docs/database-plan.md's query
 * rules, "no unbounded transaction loads").
 */
export function toOverfetchRange(params: PaginationParams): [number, number] {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize; // +pageSize (not -1): one extra row past the page
  return [from, to];
}

export type Page<T> = {
  readonly rows: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
};

/** Trims the overfetched extra row (if present, from toOverfetchRange) and reports whether another page exists. */
export function toPage<T>(
  rows: readonly T[],
  params: PaginationParams,
): Page<T> {
  const hasMore = rows.length > params.pageSize;
  return {
    rows: hasMore ? rows.slice(0, params.pageSize) : rows,
    page: params.page,
    pageSize: params.pageSize,
    hasMore,
  };
}

/**
 * A single `{ pageSize: MAX_PAGE_SIZE }` call reads as "fetch everything"
 * but silently truncates once a household has more than 100 of that
 * entity (see PROMPT 47's performance audit, docs/performance-audit.md
 * §"Net-worth calculation" — confirmed live with 150 seeded accounts: a
 * net-worth total computed this way undercounts by the 50 accounts past
 * the cut, with no visible indication anything was dropped). An
 * aggregate/total computation that needs "every row for this household"
 * must page through with this helper instead of a single bounded call.
 *
 * Still bounded, not truly unbounded: `FETCH_ALL_ROWS_PAGE_CAP` (50 pages
 * = 5,000 rows) is far beyond any realistic per-household entity count
 * named in this app's own product scope (hundreds, not thousands, of
 * accounts/assets/lendings/liabilities) — hitting it indicates a runaway
 * or corrupt dataset, not normal usage, so callers get `truncated: true`
 * back rather than an ever-growing query.
 */
export const FETCH_ALL_ROWS_PAGE_CAP = 50;

/**
 * Pages through every row for a household-scoped list query via repeated
 * calls to `fetchPage` (typically a partially-applied `listX(supabase,
 * householdId, filters, pagination)`), stopping at `hasMore: false` or the
 * safety cap above. Only appropriate for aggregate/total computations
 * (net worth, dashboard summaries, report roll-ups) — a paginated list
 * *display* should keep using its own page directly, never this.
 */
export async function fetchAllRows<T>(
  fetchPage: (pagination: {
    page: number;
    pageSize: number;
  }) => Promise<Page<T>>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let page = 1;
  while (page <= FETCH_ALL_ROWS_PAGE_CAP) {
    const result = await fetchPage({ page, pageSize: MAX_PAGE_SIZE });
    rows.push(...result.rows);
    if (!result.hasMore) {
      return { rows, truncated: false };
    }
    page += 1;
  }
  return { rows, truncated: true };
}

export type SortDirection = "asc" | "desc";

type Orderable<Q> = {
  order: (column: string, options?: { ascending?: boolean }) => Q;
};

/**
 * Applies a deterministic sort: the caller's chosen column, plus a stable
 * tiebreaker (`id` by default). Without a tiebreaker, rows with an equal
 * primary sort value (two transactions on the same date, say) can come
 * back in a different relative order across pages — silently duplicating
 * or skipping a row at the page boundary. Every paginated list query must
 * order this way, never by a single non-unique column alone (see
 * docs/database-plan.md's query rules, "deterministic ordering").
 */
export function applyDeterministicOrder<Q extends Orderable<Q>>(
  query: Q,
  primaryColumn: string,
  direction: SortDirection = "desc",
  tiebreakerColumn = "id",
): Q {
  return query
    .order(primaryColumn, { ascending: direction === "asc" })
    .order(tiebreakerColumn, { ascending: true });
}

type Equalable<Q> = {
  // `value: any` (not `unknown`) deliberately: a real Supabase
  // PostgrestFilterBuilder's `.eq()` accepts a narrower value type per
  // column (via its generated Database types), which isn't assignable to
  // a wider `unknown`-accepting signature (contravariance) — `any` is the
  // pragmatic escape hatch for a purely structural chaining helper like
  // this one, which never inspects `value` itself.
  eq: (column: string, value: any) => Q; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/**
 * Scopes a query to one household. Every list query must call this (or the
 * equivalent inline `.eq("household_id", ...)`) before anything else —
 * Row Level Security is the actual enforcement point (see
 * docs/security-model.md §3), this is the redundant application-layer
 * scoping that fails fast with a sensible query rather than relying on RLS
 * alone to narrow an accidentally-unscoped query down to nothing.
 */
export function scopeToHousehold<Q extends Equalable<Q>>(
  query: Q,
  householdId: string,
): Q {
  return query.eq("household_id", householdId);
}

/**
 * Applies (or explicitly skips) an archived/inactive-record filter. Every
 * list query on a table with an archival flag (`is_archived`, `is_active`,
 * a `closed_date`/`status` column, ...) must call this rather than leaving
 * the decision implicit — a query that silently includes archived rows,
 * or silently excludes them with no way to opt in, is a bug either way
 * (see docs/database-plan.md's query rules, "explicit archived-record
 * handling").
 */
export function applyArchivedFilter<Q extends Equalable<Q>>(
  query: Q,
  column: string,
  activeValue: unknown,
  includeArchived: boolean,
): Q {
  return includeArchived ? query : query.eq(column, activeValue);
}
