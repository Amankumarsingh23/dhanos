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
import type { TransactionFilters } from "@/lib/validation/transactions";
import type { Tables } from "@/types/database";

export type TransactionRecord = Tables<"transactions">;
export type TransactionSplitRecord = Tables<"transaction_splits">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TransactionRow = TransactionRecord & {
  accountName: string | null;
  transferAccountName: string | null;
  categoryName: string | null;
  personName: string | null;
  splitCount: number;
  /** Sum of non-cancelled refunds against this row, when it's an expense — 0 otherwise. See getRefundedAmount. */
  refundedAmountMinorUnits: number;
};

type RawTransactionRow = TransactionRecord & {
  account: { name: string } | null;
  transfer_account: { name: string } | null;
  category: { name: string } | null;
  person: { display_name: string } | null;
  splits: { count: number }[] | null;
};

const TRANSACTION_SELECT =
  "*, account:financial_accounts!transactions_account_id_fkey(name), transfer_account:financial_accounts!transactions_transfer_account_id_fkey(name), category:transaction_categories(name), person:people(display_name), splits:transaction_splits(count)";

function mapRow(
  row: RawTransactionRow,
  refundedAmountMinorUnits = 0,
): TransactionRow {
  const { account, transfer_account, category, person, splits, ...rest } = row;
  return {
    ...rest,
    accountName: account?.name ?? null,
    transferAccountName: transfer_account?.name ?? null,
    categoryName: category?.name ?? null,
    personName: person?.display_name ?? null,
    splitCount: splits?.[0]?.count ?? 0,
    refundedAmountMinorUnits,
  };
}

/**
 * Batched refunded-amount lookup for a page of expense transactions — one
 * query for the whole page (never one per row), mirroring the pattern in
 * src/features/accounts/queries.ts.
 */
async function fetchRefundedAmounts(
  supabase: SupabaseServerClient,
  householdId: string,
  expenseTransactionIds: string[],
): Promise<Map<string, number>> {
  if (expenseTransactionIds.length === 0) {
    return new Map();
  }

  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("reverses_transaction_id, amount_minor_units")
      .eq("household_id", householdId)
      .in("reverses_transaction_id", expenseTransactionIds)
      .neq("status", "cancelled"),
  );

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.reverses_transaction_id) {
      continue;
    }
    totals.set(
      row.reverses_transaction_id,
      (totals.get(row.reverses_transaction_id) ?? 0) + row.amount_minor_units,
    );
  }
  return totals;
}

/**
 * Lists a household's transactions, following the standard query contract
 * (see docs/data-access-patterns.md §2): household-scoped, paginated,
 * deterministically ordered (transaction_date desc, then id as a
 * tiebreaker), explicit about cancelled ("archived") rows, and searchable
 * by counterparty/description. 'cancelled' rows are excluded by default —
 * same convention as every other list in this app, extended to this
 * module's own lifecycle status rather than a separate is_archived column.
 */
export async function listTransactions(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: TransactionFilters = {},
  paginationInput: unknown = {},
): Promise<Page<TransactionRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("transactions").select(TRANSACTION_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.includeCancelled) {
    // no-op: all statuses included
  } else {
    query = query.neq("status", "cancelled");
  }

  if (filters.kind) {
    query = query.eq("kind", filters.kind);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.accountId) {
    query = query.or(
      `account_id.eq.${filters.accountId},transfer_account_id.eq.${filters.accountId}`,
    );
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.relatedPersonId) {
    query = query.eq("related_person_id", filters.relatedPersonId);
  }
  if (filters.dateFrom) {
    query = query.gte("transaction_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("transaction_date", filters.dateTo);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.or(
      `counterparty.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }

  query = applyDeterministicOrder(query, "transaction_date", "desc");

  const rows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawTransactionRow[];

  const expenseIds = rows
    .filter((row) => row.kind === "expense")
    .map((row) => row.id);
  const refundedAmounts = await fetchRefundedAmounts(
    supabase,
    householdId,
    expenseIds,
  );

  const mapped = rows.map((row) =>
    mapRow(row, refundedAmounts.get(row.id) ?? 0),
  );

  return toPage(mapped, pagination);
}

/** Fetches the splits for one transaction, for the edit dialog to prefill. */
export async function listTransactionSplits(
  supabase: SupabaseServerClient,
  householdId: string,
  transactionId: string,
): Promise<TransactionSplitRecord[]> {
  return unwrapList(
    await supabase
      .from("transaction_splits")
      .select("*")
      .eq("household_id", householdId)
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true }),
  );
}

/**
 * The total already refunded against one expense transaction — refunds
 * reference it via reverses_transaction_id (see PROMPT 10 acceptance
 * criterion "Refund handling is traceable"). Used to show "Refunded ₹X of
 * ₹Y" on an expense row and to cap a new refund at the remaining amount.
 */
export async function getRefundedAmount(
  supabase: SupabaseServerClient,
  householdId: string,
  originalTransactionId: string,
): Promise<number> {
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("amount_minor_units, status")
      .eq("household_id", householdId)
      .eq("reverses_transaction_id", originalTransactionId)
      .neq("status", "cancelled"),
  );
  return rows.reduce((sum, row) => sum + row.amount_minor_units, 0);
}
