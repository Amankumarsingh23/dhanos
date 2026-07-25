import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  applyDeterministicOrder,
  parsePagination,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type {
  TransactionDuplicateCandidate,
  SnapshotDuplicateCandidate,
} from "@/lib/calculations/import-duplicate-matching";
import type { ImportLookups } from "./resolve";
import type { Tables } from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ImportBatchRecord = Tables<"import_batches">;
export type ImportRowRecord = Tables<"import_rows">;

/**
 * Data access for the CSV import foundation (PROMPT 41). Lookups are
 * built fresh from the household's own real accounts/categories/holdings
 * every time a batch is validated *and* again at commit time — never
 * cached across the two, so a rename/archive in between is always
 * reflected (see resolve.ts's module comment).
 */
export async function getImportLookups(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<ImportLookups> {
  const [accountsResponse, categoriesResponse, holdingsResponse] =
    await Promise.all([
      supabase
        .from("financial_accounts")
        .select("id, name, currency_code")
        .eq("household_id", householdId),
      supabase
        .from("transaction_categories")
        .select("id, name")
        .eq("household_id", householdId)
        .eq("is_archived", false),
      supabase
        .from("investment_holdings")
        .select(
          "id, investment_assets(name, currency_code), investment_accounts(name)",
        )
        .eq("household_id", householdId)
        .eq("is_active", true),
    ]);

  const accountsByName = new Map(
    unwrapList(accountsResponse).map((account) => [
      account.name.trim().toLowerCase(),
      { id: account.id, currencyCode: account.currency_code },
    ]),
  );

  const categoriesByName = new Map(
    unwrapList(categoriesResponse).map((category) => [
      category.name.trim().toLowerCase(),
      { id: category.id },
    ]),
  );

  const holdingRows = unwrapList(holdingsResponse) as unknown as {
    id: string;
    investment_assets: { name: string; currency_code: string } | null;
    investment_accounts: { name: string } | null;
  }[];
  const holdingsByLabel = new Map(
    holdingRows.map((holding) => {
      const assetName = holding.investment_assets?.name ?? "Unknown asset";
      const platformName = holding.investment_accounts?.name ?? "Unknown platform";
      const label = `${assetName} (${platformName})`.trim().toLowerCase();
      return [
        label,
        {
          id: holding.id,
          currencyCode: holding.investment_assets?.currency_code ?? "INR",
        },
      ];
    }),
  );

  return { accountsByName, categoriesByName, holdingsByLabel };
}

/**
 * Existing (non-cancelled) transactions for the given accounts — the
 * "does this look like something already recorded" half of duplicate
 * detection (the other half, same-file self-duplicates, is computed
 * in-memory from the batch's own rows, see actions.ts).
 */
export async function getTransactionDuplicateCandidates(
  supabase: SupabaseServerClient,
  householdId: string,
  accountIds: readonly string[],
): Promise<TransactionDuplicateCandidate[]> {
  if (accountIds.length === 0) {
    return [];
  }
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("account_id, transaction_date, amount_minor_units, description, counterparty")
      .eq("household_id", householdId)
      .neq("status", "cancelled")
      .in("account_id", accountIds),
  );
  return rows.map((row) => ({
    label: `an existing transaction on ${row.transaction_date}`,
    accountId: row.account_id,
    transactionDate: row.transaction_date,
    amountMinorUnits: row.amount_minor_units,
    description: row.description ?? row.counterparty,
    externalReference: null,
  }));
}

export async function getAccountBalanceDuplicateCandidates(
  supabase: SupabaseServerClient,
  householdId: string,
  accountIds: readonly string[],
): Promise<Map<string, SnapshotDuplicateCandidate[]>> {
  const byAccount = new Map<string, SnapshotDuplicateCandidate[]>();
  if (accountIds.length === 0) {
    return byAccount;
  }
  const rows = unwrapList(
    await supabase
      .from("account_balance_snapshots")
      .select("account_id, as_of_date")
      .eq("household_id", householdId)
      .in("account_id", accountIds),
  );
  for (const row of rows) {
    const list = byAccount.get(row.account_id) ?? [];
    list.push({ label: "an existing balance snapshot", asOfDate: row.as_of_date });
    byAccount.set(row.account_id, list);
  }
  return byAccount;
}

export async function getInvestmentValuationDuplicateCandidates(
  supabase: SupabaseServerClient,
  householdId: string,
  investmentHoldingIds: readonly string[],
): Promise<Map<string, SnapshotDuplicateCandidate[]>> {
  const byHolding = new Map<string, SnapshotDuplicateCandidate[]>();
  if (investmentHoldingIds.length === 0) {
    return byHolding;
  }
  const rows = unwrapList(
    await supabase
      .from("investment_valuation_snapshots")
      .select("investment_holding_id, as_of_date")
      .eq("household_id", householdId)
      .in("investment_holding_id", investmentHoldingIds),
  );
  for (const row of rows) {
    const list = byHolding.get(row.investment_holding_id) ?? [];
    list.push({ label: "an existing valuation snapshot", asOfDate: row.as_of_date });
    byHolding.set(row.investment_holding_id, list);
  }
  return byHolding;
}

export async function listImportBatches(
  supabase: SupabaseServerClient,
  householdId: string,
  paginationInput: unknown = {},
): Promise<Page<ImportBatchRecord>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase
    .from("import_batches")
    .select("*")
    .eq("household_id", householdId);
  query = applyDeterministicOrder(query, "created_at", "desc");

  const rows = unwrapList(await query.range(from, to));
  return toPage(rows, pagination);
}

export type ImportBatchDetail = {
  batch: ImportBatchRecord;
  rows: Page<ImportRowRecord>;
};

export async function getImportBatchDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  importBatchId: string,
  statusFilter: string | undefined,
  paginationInput: unknown = {},
): Promise<ImportBatchDetail> {
  const batch = unwrapSingle(
    await supabase
      .from("import_batches")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", importBatchId)
      .single(),
  );

  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);
  let rowsQuery = supabase
    .from("import_rows")
    .select("*")
    .eq("household_id", householdId)
    .eq("import_batch_id", importBatchId);
  if (statusFilter) {
    rowsQuery = rowsQuery.eq("status", statusFilter);
  }
  rowsQuery = applyDeterministicOrder(rowsQuery, "row_number", "asc");

  const rowRecords = unwrapList(await rowsQuery.range(from, to));
  const rows = toPage(rowRecords, pagination);

  return { batch, rows };
}
