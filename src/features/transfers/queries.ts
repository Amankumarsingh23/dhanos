import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { TransferFilters } from "@/lib/validation/transfers";
import type { Tables } from "@/types/database";

export type TransferTransactionRecord = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TransferRow = TransferTransactionRecord & {
  accountName: string | null;
  transferAccountName: string | null;
  /** True when reverses_transaction_id references another transfer — this row is a reversal. */
  isReversal: boolean;
  /** True when some other transfer's reverses_transaction_id points at this row — already reversed, offer no second reversal. */
  isReversed: boolean;
};

type RawTransferRow = TransferTransactionRecord & {
  account: { name: string } | null;
  transfer_account: { name: string } | null;
};

const TRANSFER_SELECT =
  "*, account:financial_accounts!transactions_account_id_fkey(name), transfer_account:financial_accounts!transactions_transfer_account_id_fkey(name)";

/** Which transfers in this page have already been reversed — one query for the whole page, never one per row. */
async function fetchReversedIds(
  supabase: SupabaseServerClient,
  householdId: string,
  transferIds: string[],
): Promise<Set<string>> {
  if (transferIds.length === 0) {
    return new Set();
  }
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("reverses_transaction_id")
      .eq("household_id", householdId)
      .eq("kind", "transfer")
      .in("reverses_transaction_id", transferIds)
      .neq("status", "cancelled"),
  );
  return new Set(
    rows
      .map((row) => row.reverses_transaction_id)
      .filter((id): id is string => id !== null),
  );
}

function mapRow(row: RawTransferRow, isReversed: boolean): TransferRow {
  const { account, transfer_account, ...rest } = row;
  return {
    ...rest,
    accountName: account?.name ?? null,
    transferAccountName: transfer_account?.name ?? null,
    isReversal: rest.reverses_transaction_id !== null,
    isReversed,
  };
}

/**
 * Lists a household's transfers (kind = 'transfer'), following the
 * standard query contract (see docs/data-access-patterns.md §2):
 * household-scoped, paginated, deterministically ordered, explicit about
 * cancelled rows, and searchable by description. One dedicated list for
 * the one user-facing transfer form — see PROMPT 13.
 */
export async function listTransfers(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: TransferFilters = {},
  paginationInput: unknown = {},
): Promise<Page<TransferRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("transactions").select(TRANSFER_SELECT);
  query = scopeToHousehold(query, householdId);
  query = query.eq("kind", "transfer");

  if (filters.includeCancelled) {
    // no-op: all statuses included
  } else {
    query = query.neq("status", "cancelled");
  }

  if (filters.accountId) {
    query = query.or(
      `account_id.eq.${filters.accountId},transfer_account_id.eq.${filters.accountId}`,
    );
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("transaction_date", filters.dateTo);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("description", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "transaction_date", "desc");

  const rows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawTransferRow[];

  const reversedIds = await fetchReversedIds(
    supabase,
    householdId,
    rows.map((row) => row.id),
  );

  const mapped = rows.map((row) => mapRow(row, reversedIds.has(row.id)));

  return toPage(mapped, pagination);
}
