import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  computeAccountBalance,
  type BalanceAffectingTransaction,
  type BalanceSnapshotBaseline,
} from "@/lib/calculations/account-balance";
import type { Money } from "@/lib/money";
import {
  applyArchivedFilter,
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { AccountFilters } from "@/lib/validation/accounts";
import type { Tables } from "@/types/database";

export type FinancialAccount = Tables<"financial_accounts">;
export type AccountBalanceSnapshot = Tables<"account_balance_snapshots">;
export type AccountTransaction = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type AccountRow = FinancialAccount & {
  institutionName: string | null;
  ownerName: string | null;
  currentBalance: Money;
  /** Which baseline the calculated balance was built from — see src/lib/calculations/account-balance.ts. */
  balanceBaseline: { kind: "snapshot"; asOfDate: string } | { kind: "opening" };
  lastTransactionDate: string | null;
  lastBalanceConfirmationDate: string | null;
};

type RawAccountRow = FinancialAccount & {
  institutions: { name: string } | null;
  people: { display_name: string } | null;
};

/**
 * Fetches, for a set of accounts, the single latest account_balance_snapshots
 * row per account (the balance baseline — see
 * src/lib/calculations/account-balance.ts). One query for the whole page,
 * not one per account: rows come back ordered by (account_id, as_of_date
 * desc), and the first row seen per account_id is kept.
 */
async function fetchLatestSnapshots(
  supabase: SupabaseServerClient,
  householdId: string,
  accountIds: string[],
): Promise<Map<string, BalanceSnapshotBaseline>> {
  if (accountIds.length === 0) {
    return new Map();
  }

  const rows = unwrapList(
    await supabase
      .from("account_balance_snapshots")
      .select("account_id, as_of_date, balance_minor_units")
      .eq("household_id", householdId)
      .in("account_id", accountIds)
      .order("account_id", { ascending: true })
      .order("as_of_date", { ascending: false }),
  );

  const latest = new Map<string, BalanceSnapshotBaseline>();
  for (const row of rows) {
    if (!latest.has(row.account_id)) {
      latest.set(row.account_id, {
        asOfDate: row.as_of_date,
        balanceMinorUnits: row.balance_minor_units,
      });
    }
  }
  return latest;
}

/**
 * Fetches every transaction that could affect one of `accountIds`'
 * balances from `sinceDate` onward (source account or transfer
 * destination) — the eligible-transaction half of the balance strategy in
 * src/lib/calculations/account-balance.ts. `sinceDate` should be the
 * earliest baseline date among the accounts being computed, so this stays
 * one bounded query per page rather than one per account.
 */
async function fetchBalanceTransactions(
  supabase: SupabaseServerClient,
  householdId: string,
  accountIds: string[],
  sinceDate: string | null,
): Promise<AccountTransaction[]> {
  if (accountIds.length === 0) {
    return [];
  }

  let query = supabase
    .from("transactions")
    .select(
      "id, kind, amount_minor_units, account_id, transfer_account_id, transaction_date",
    )
    .eq("household_id", householdId)
    // 'planned' hasn't occurred yet and 'cancelled' never did — neither
    // belongs in a calculated balance. 'pending' and 'reconciled' both
    // represent money that has actually moved, same as 'cleared'.
    .in("status", ["pending", "cleared", "reconciled"])
    .or(
      `account_id.in.(${accountIds.join(",")}),transfer_account_id.in.(${accountIds.join(",")})`,
    );

  if (sinceDate) {
    query = query.gt("transaction_date", sinceDate);
  }

  return unwrapList(await query) as unknown as AccountTransaction[];
}

function toBalanceTransaction(
  row: AccountTransaction,
): BalanceAffectingTransaction {
  return {
    kind: row.kind as BalanceAffectingTransaction["kind"],
    amountMinorUnits: row.amount_minor_units,
    accountId: row.account_id,
    transferAccountId: row.transfer_account_id,
    transactionDate: row.transaction_date,
  };
}

/**
 * Lists a household's accounts, following the standard query contract (see
 * docs/data-access-patterns.md §2): household-scoped, paginated,
 * deterministically ordered (name, then id as a tiebreaker), explicit
 * about closed (`is_active = false`) accounts, and searchable by name.
 * Each row's current balance, last-transaction date, and last-confirmation
 * date are computed from a small, fixed number of extra queries for the
 * whole page — never one query per row.
 */
export async function listAccounts(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: AccountFilters = {},
  paginationInput: unknown = {},
): Promise<Page<AccountRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase
    .from("financial_accounts")
    .select("*, institutions(name), people(display_name)");

  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "is_active",
    true,
    Boolean(filters.includeClosed),
  );

  if (filters.accountType) {
    query = query.eq("account_type", filters.accountType);
  }
  if (filters.institutionId) {
    query = query.eq("institution_id", filters.institutionId);
  }
  if (filters.ownerPersonId) {
    query = query.eq("owner_person_id", filters.ownerPersonId);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawAccountRow[];
  const page = toPage(rawRows, pagination);

  const accountIds = page.rows.map((row) => row.id);
  const latestSnapshots = await fetchLatestSnapshots(
    supabase,
    householdId,
    accountIds,
  );

  // The earliest baseline date among this page's accounts, so
  // fetchBalanceTransactions can use one bounded query for the whole page.
  // If any account has neither a snapshot nor an opened_date, its baseline
  // is "everything," so the whole fetch must be unbounded (sinceDate = null).
  let earliestBaselineDate: string | null = null;
  let hasUnboundedAccount = false;
  for (const row of page.rows) {
    const baselineDate =
      latestSnapshots.get(row.id)?.asOfDate ?? row.opened_date;
    if (!baselineDate) {
      hasUnboundedAccount = true;
      continue;
    }
    if (earliestBaselineDate === null || baselineDate < earliestBaselineDate) {
      earliestBaselineDate = baselineDate;
    }
  }
  const earliestBaseline = hasUnboundedAccount ? null : earliestBaselineDate;

  const transactions = await fetchBalanceTransactions(
    supabase,
    householdId,
    accountIds,
    earliestBaseline,
  );

  const rows: AccountRow[] = page.rows.map((row) => {
    const { institutions, people, ...account } = row;
    const snapshot = latestSnapshots.get(row.id) ?? null;
    const relevant = transactions
      .filter(
        (t) => t.account_id === row.id || t.transfer_account_id === row.id,
      )
      .map(toBalanceTransaction);

    const { balance, baseline } = computeAccountBalance({
      accountId: row.id,
      currencyCode: row.currency_code,
      openingBalanceMinorUnits: row.opening_balance_minor_units,
      openedDate: row.opened_date,
      latestSnapshot: snapshot,
      transactions: relevant,
    });

    const lastTransactionDate = relevant.reduce<string | null>(
      (latest, t) =>
        !latest || t.transactionDate > latest ? t.transactionDate : latest,
      null,
    );

    return {
      ...account,
      institutionName: institutions?.name ?? null,
      ownerName: people?.display_name ?? null,
      currentBalance: balance,
      balanceBaseline: baseline,
      lastTransactionDate,
      lastBalanceConfirmationDate: snapshot?.asOfDate ?? null,
    };
  });

  return { ...page, rows };
}

export type AccountDetail = AccountRow & {
  recentTransactions: AccountTransaction[];
  monthlyInflow: Money;
  monthlyOutflow: Money;
  balanceHistory: AccountBalanceSnapshot[];
};

/**
 * Fetches one account's detail view: the calculated current balance (same
 * strategy as listAccounts), recent transactions, this calendar month's
 * inflow/outflow (cash_flow_transactions only — income/expense, never
 * transfers, per docs/money-calculation-rules.md §2), and the full balance
 * snapshot history.
 */
export async function getAccountDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  accountId: string,
): Promise<AccountDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("financial_accounts")
      .select("*, institutions(name), people(display_name)")
      .eq("household_id", householdId)
      .eq("id", accountId)
      .maybeSingle(),
  ) as unknown as RawAccountRow;

  const { institutions, people, ...account } = raw;

  const [snapshotsResult, recentTransactionsResult] = await Promise.all([
    supabase
      .from("account_balance_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .eq("account_id", accountId)
      .order("as_of_date", { ascending: false })
      .limit(24),
    supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId}`)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(20),
  ]);

  const balanceHistory = unwrapList(snapshotsResult);
  const recentTransactions = unwrapList(recentTransactionsResult);
  const latestSnapshot = balanceHistory[0] ?? null;

  const baselineDate = latestSnapshot?.as_of_date ?? account.opened_date;
  const balanceTransactionsResult = await supabase
    .from("transactions")
    .select(
      "id, kind, amount_minor_units, account_id, transfer_account_id, transaction_date",
    )
    .eq("household_id", householdId)
    .in("status", ["pending", "cleared", "reconciled"])
    .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId}`)
    .gt("transaction_date", baselineDate ?? "0001-01-01");

  const balanceTransactions = (
    unwrapList(balanceTransactionsResult) as unknown as AccountTransaction[]
  ).map(toBalanceTransaction);

  const { balance, baseline } = computeAccountBalance({
    accountId,
    currencyCode: account.currency_code,
    openingBalanceMinorUnits: account.opening_balance_minor_units,
    openedDate: account.opened_date,
    latestSnapshot: latestSnapshot
      ? {
          asOfDate: latestSnapshot.as_of_date,
          balanceMinorUnits: latestSnapshot.balance_minor_units,
        }
      : null,
    transactions: balanceTransactions,
  });

  const lastTransactionDate = recentTransactions[0]?.transaction_date ?? null;

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  // status = 'cleared' only — per PROMPT 10 acceptance criterion "Reports
  // use cleared transactions by default": a planned/pending/reconciled
  // entry hasn't settled the way a cleared one has, and shouldn't inflate
  // this month's actual inflow/outflow figures.
  const cashFlowThisMonthResult = await supabase
    .from("cash_flow_transactions")
    .select("kind, amount_minor_units")
    .eq("household_id", householdId)
    .eq("account_id", accountId)
    .eq("status", "cleared")
    .gte("transaction_date", monthStart);
  const cashFlowThisMonth = unwrapList(cashFlowThisMonthResult);

  const monthlyInflowMinorUnits = cashFlowThisMonth
    .filter((t) => t.kind === "income")
    .reduce((sum, t) => sum + (t.amount_minor_units ?? 0), 0);
  const monthlyOutflowMinorUnits = cashFlowThisMonth
    .filter((t) => t.kind === "expense")
    .reduce((sum, t) => sum + (t.amount_minor_units ?? 0), 0);

  return {
    ...account,
    institutionName: institutions?.name ?? null,
    ownerName: people?.display_name ?? null,
    currentBalance: balance,
    balanceBaseline: baseline,
    lastTransactionDate,
    lastBalanceConfirmationDate: latestSnapshot?.as_of_date ?? null,
    recentTransactions,
    monthlyInflow: {
      amountMinorUnits: monthlyInflowMinorUnits,
      currencyCode: account.currency_code,
    },
    monthlyOutflow: {
      amountMinorUnits: monthlyOutflowMinorUnits,
      currencyCode: account.currency_code,
    },
    balanceHistory,
  };
}

/**
 * The calculated-balance half of getAccountDetail, extracted for callers
 * that need just the figure — namely recordBalanceCorrectionAction (see
 * src/features/accounts/actions.ts), which needs "what does the ledger
 * currently imply this account's balance is" to compute the adjustment
 * transaction's amount.
 */
export async function getCalculatedAccountBalance(
  supabase: SupabaseServerClient,
  householdId: string,
  accountId: string,
): Promise<Money> {
  const account = unwrapSingle(
    await supabase
      .from("financial_accounts")
      .select("currency_code, opening_balance_minor_units, opened_date")
      .eq("household_id", householdId)
      .eq("id", accountId)
      .maybeSingle(),
  ) as {
    currency_code: string;
    opening_balance_minor_units: number;
    opened_date: string | null;
  };

  const latestSnapshot =
    (await fetchLatestSnapshots(supabase, householdId, [accountId])).get(
      accountId,
    ) ?? null;

  const baselineDate = latestSnapshot?.asOfDate ?? account.opened_date;
  const transactions = await fetchBalanceTransactions(
    supabase,
    householdId,
    [accountId],
    baselineDate,
  );

  const { balance } = computeAccountBalance({
    accountId,
    currencyCode: account.currency_code,
    openingBalanceMinorUnits: account.opening_balance_minor_units,
    openedDate: account.opened_date,
    latestSnapshot,
    transactions: transactions.map(toBalanceTransaction),
  });

  return balance;
}
