import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  computeIncomeSchedule,
  isIncomeMissed,
  type IncomeScheduleSource,
} from "@/lib/calculations/income-schedule";
import { toIsoDateString } from "@/lib/dates";
import {
  applyArchivedFilter,
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type {
  IncomeFrequency,
  IncomeSourceFilters,
} from "@/lib/validation/income-sources";
import type { Tables } from "@/types/database";

export type IncomeSourceRecord = Tables<"income_sources">;
export type IncomeTransactionRecord = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type IncomeSourceRow = IncomeSourceRecord & {
  institutionName: string | null;
  personName: string | null;
  accountName: string | null;
  categoryName: string | null;
  lastReceivedDate: string | null;
  mostRecentDueDate: string | null;
  nextExpectedDate: string | null;
  isMissed: boolean;
};

type RawIncomeSourceRow = IncomeSourceRecord & {
  institutions: { name: string } | null;
  people: { display_name: string } | null;
  financial_accounts: { name: string } | null;
  transaction_categories: { name: string } | null;
};

function toScheduleSource(row: IncomeSourceRecord): IncomeScheduleSource {
  return {
    frequency: row.frequency as IncomeFrequency,
    expectedDayOfMonth: row.expected_day_of_month,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active,
  };
}

/**
 * Batched last-received-date lookup for a page of income sources — one
 * query for the whole page, mirroring the no-N+1 pattern in
 * src/features/accounts/queries.ts.
 */
async function fetchLastReceivedDates(
  supabase: SupabaseServerClient,
  householdId: string,
  incomeSourceIds: string[],
): Promise<Map<string, string>> {
  if (incomeSourceIds.length === 0) {
    return new Map();
  }

  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("income_source_id, transaction_date")
      .eq("household_id", householdId)
      .in("income_source_id", incomeSourceIds)
      .neq("status", "cancelled")
      .order("income_source_id", { ascending: true })
      .order("transaction_date", { ascending: false }),
  );

  const latest = new Map<string, string>();
  for (const row of rows) {
    if (row.income_source_id && !latest.has(row.income_source_id)) {
      latest.set(row.income_source_id, row.transaction_date);
    }
  }
  return latest;
}

/**
 * Lists a household's income sources, following the standard query
 * contract (see docs/data-access-patterns.md §2): household-scoped,
 * paginated, deterministically ordered (name, then id as a tiebreaker),
 * explicit about inactive sources, and searchable by name. Each row's
 * last-received date, most-recently-due date, next-expected date, and
 * missed-income flag are computed for the whole page in one extra query
 * plus pure date arithmetic — never one query per row.
 */
export async function listIncomeSources(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: IncomeSourceFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
): Promise<Page<IncomeSourceRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase
    .from("income_sources")
    .select(
      "*, institutions(name), people(display_name), financial_accounts(name), transaction_categories(name)",
    );

  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "is_active",
    true,
    Boolean(filters.includeInactive),
  );

  if (filters.sourceType) {
    query = query.eq("source_type", filters.sourceType);
  }
  if (filters.personId) {
    query = query.eq("person_id", filters.personId);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawIncomeSourceRow[];
  const page = toPage(rawRows, pagination);

  const lastReceivedDates = await fetchLastReceivedDates(
    supabase,
    householdId,
    page.rows.map((row) => row.id),
  );

  const rows: IncomeSourceRow[] = page.rows.map((row) => {
    const {
      institutions,
      people,
      financial_accounts,
      transaction_categories,
      ...source
    } = row;
    const lastReceivedDate = lastReceivedDates.get(row.id) ?? null;
    const { mostRecentDueDate, nextExpectedDate } = computeIncomeSchedule(
      toScheduleSource(row),
      asOfDate,
    );
    const missed = isIncomeMissed({
      mostRecentDueDate,
      lastReceivedDate,
      asOfDate,
    });

    return {
      ...source,
      institutionName: institutions?.name ?? null,
      personName: people?.display_name ?? null,
      accountName: financial_accounts?.name ?? null,
      categoryName: transaction_categories?.name ?? null,
      lastReceivedDate,
      mostRecentDueDate,
      nextExpectedDate,
      isMissed: missed,
    };
  });

  return { ...page, rows };
}

export type IncomeSourceDetail = IncomeSourceRow & {
  recentReceipts: IncomeTransactionRecord[];
};

export async function getIncomeSourceDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  incomeSourceId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<IncomeSourceDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("income_sources")
      .select(
        "*, institutions(name), people(display_name), financial_accounts(name), transaction_categories(name)",
      )
      .eq("household_id", householdId)
      .eq("id", incomeSourceId)
      .maybeSingle(),
  ) as unknown as RawIncomeSourceRow;

  const {
    institutions,
    people,
    financial_accounts,
    transaction_categories,
    ...source
  } = raw;

  const recentReceiptsResult = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("income_source_id", incomeSourceId)
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(20);
  const recentReceipts = unwrapList(recentReceiptsResult);

  const lastReceivedDate =
    recentReceipts.find((t) => t.status !== "cancelled")?.transaction_date ??
    null;
  const { mostRecentDueDate, nextExpectedDate } = computeIncomeSchedule(
    toScheduleSource(raw),
    asOfDate,
  );
  const missed = isIncomeMissed({
    mostRecentDueDate,
    lastReceivedDate,
    asOfDate,
  });

  return {
    ...source,
    institutionName: institutions?.name ?? null,
    personName: people?.display_name ?? null,
    accountName: financial_accounts?.name ?? null,
    categoryName: transaction_categories?.name ?? null,
    lastReceivedDate,
    mostRecentDueDate,
    nextExpectedDate,
    isMissed: missed,
    recentReceipts,
  };
}

/**
 * Checks for a likely-duplicate receipt already recorded against a source
 * — same income_source_id, a transaction_date within `windowDays` of the
 * candidate, not cancelled. PROMPT 11 acceptance criterion: "Duplicate
 * recurring receipts can be detected or warned about."
 */
export async function findNearbyIncomeReceipts(
  supabase: SupabaseServerClient,
  householdId: string,
  incomeSourceId: string,
  transactionDate: string,
  windowDays = 10,
): Promise<IncomeTransactionRecord[]> {
  const center = new Date(transactionDate);
  const windowStart = toIsoDateString(
    new Date(center.getTime() - windowDays * 24 * 60 * 60 * 1000),
  );
  const windowEnd = toIsoDateString(
    new Date(center.getTime() + windowDays * 24 * 60 * 60 * 1000),
  );

  return unwrapList(
    await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .eq("income_source_id", incomeSourceId)
      .neq("status", "cancelled")
      .gte("transaction_date", windowStart)
      .lte("transaction_date", windowEnd),
  );
}

export type IncomeBySourceRow = {
  incomeSourceId: string | null;
  sourceName: string;
  totalMinorUnits: number;
};

export type IncomeByPersonRow = {
  personId: string | null;
  personName: string;
  totalMinorUnits: number;
};

export type IncomeTrendRow = {
  monthKey: string;
  totalMinorUnits: number;
};

/**
 * Every income aggregation below reads `status = 'cleared'` only — see
 * docs/money-calculation-rules.md and PROMPT 10's "reports use cleared
 * transactions by default" — and `kind = 'income'` (never 'refund', which
 * is its own thing even though it also increases a balance).
 */
async function fetchClearedIncomeRows(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<
  {
    income_source_id: string | null;
    related_person_id: string | null;
    transaction_date: string;
    amount_minor_units: number;
  }[]
> {
  return unwrapList(
    await supabase
      .from("transactions")
      .select(
        "income_source_id, related_person_id, transaction_date, amount_minor_units",
      )
      .eq("household_id", householdId)
      .eq("kind", "income")
      .eq("status", "cleared")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo),
  );
}

export async function getIncomeBySource(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<IncomeBySourceRow[]> {
  const [rows, sources] = await Promise.all([
    fetchClearedIncomeRows(supabase, householdId, dateFrom, dateTo),
    unwrapList(
      await supabase
        .from("income_sources")
        .select("id, name")
        .eq("household_id", householdId),
    ),
  ]);

  const sourceNames = new Map(sources.map((s) => [s.id, s.name]));
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.income_source_id ?? "__none__";
    totals.set(key, (totals.get(key) ?? 0) + row.amount_minor_units);
  }

  return Array.from(totals.entries())
    .map(([key, totalMinorUnits]) => ({
      incomeSourceId: key === "__none__" ? null : key,
      sourceName:
        key === "__none__"
          ? "No source"
          : (sourceNames.get(key) ?? "Unknown source"),
      totalMinorUnits,
    }))
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

export async function getIncomeByPerson(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<IncomeByPersonRow[]> {
  const [rows, people] = await Promise.all([
    fetchClearedIncomeRows(supabase, householdId, dateFrom, dateTo),
    unwrapList(
      await supabase
        .from("people")
        .select("id, display_name")
        .eq("household_id", householdId),
    ),
  ]);

  const personNames = new Map(people.map((p) => [p.id, p.display_name]));
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.related_person_id ?? "__none__";
    totals.set(key, (totals.get(key) ?? 0) + row.amount_minor_units);
  }

  return Array.from(totals.entries())
    .map(([key, totalMinorUnits]) => ({
      personId: key === "__none__" ? null : key,
      personName:
        key === "__none__"
          ? "Unassigned"
          : (personNames.get(key) ?? "Unknown person"),
      totalMinorUnits,
    }))
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

/** Monthly income totals for the trailing `monthsBack` months (including the current month), oldest first. */
export async function getIncomeTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<IncomeTrendRow[]> {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  const dateFrom = toIsoDateString(rangeStart);
  const dateTo = asOfDate;

  const rows = await fetchClearedIncomeRows(
    supabase,
    householdId,
    dateFrom,
    dateTo,
  );

  const totals = new Map<string, number>();
  for (let i = 0; i < monthsBack; i++) {
    const monthDate = new Date(
      Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + i, 1),
    );
    const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    totals.set(key, 0);
  }

  for (const row of rows) {
    const key = row.transaction_date.slice(0, 7);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.amount_minor_units);
    }
  }

  return Array.from(totals.entries()).map(([monthKey, totalMinorUnits]) => ({
    monthKey,
    totalMinorUnits,
  }));
}
