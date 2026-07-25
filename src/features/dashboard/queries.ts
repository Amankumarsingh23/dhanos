import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import { addMoney, createMoney, type Money } from "@/lib/money";
import {
  computeAccountBalance,
  type BalanceAffectingTransaction,
  type TransactionKind,
} from "@/lib/calculations/account-balance";
import {
  computeFreeCashFlow,
  computeInvestmentRate,
  computeSavingsRate,
} from "@/lib/calculations/cash-flow-summary";
import {
  getExpenseByCategory,
  getExpenseSummary,
  getExpenseTrend,
} from "@/features/expenses/queries";
import { getIncomeTrend } from "@/features/income/queries";
import { listAccounts } from "@/features/accounts/queries";
import { fetchAllRows } from "@/lib/queries/pagination";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Sums `amount_minor_units` for cleared transactions of one `kind` within
 * [dateFrom, dateTo] — the same bounded-date-range, reduce-in-JS pattern
 * used by fetchClearedIncomeRows (src/features/income/queries.ts) and
 * fetchNetExpenseRows (src/features/expenses/queries.ts). Never an
 * unbounded query: always scoped to a household and a finite date window.
 */
async function sumClearedByKind(
  supabase: SupabaseServerClient,
  householdId: string,
  kind: TransactionKind,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("amount_minor_units")
      .eq("household_id", householdId)
      .eq("kind", kind)
      .eq("status", "cleared")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo),
  );
  return rows.reduce((sum, row) => sum + row.amount_minor_units, 0);
}

export type CashFlowSummary = {
  currencyCode: string;
  income: Money;
  expense: Money;
  investment: Money;
  debtPayment: Money;
  insurancePremium: Money;
  freeCashFlow: Money;
  savingsRate: number;
  investmentRate: number;
};

/**
 * The core cash-flow dashboard figures for one period (PROMPT 15) — see
 * src/lib/calculations/cash-flow-summary.ts for exactly which transaction
 * kinds feed each figure and the free-cash-flow/savings-rate/
 * investment-rate formulas. Expenses (and, as its subset, insurance
 * premiums) are read net of refunds via getExpenseSummary/getExpenseByCategory
 * — the same functions the Expenses feature itself uses — rather than
 * duplicating that refund-netting logic here.
 */
export async function getCashFlowSummary(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
  currencyCode: string,
): Promise<CashFlowSummary> {
  const [
    incomeTotal,
    expenseSummary,
    investmentTotal,
    debtPaymentTotal,
    categoryBreakdown,
  ] = await Promise.all([
    sumClearedByKind(supabase, householdId, "income", dateFrom, dateTo),
    getExpenseSummary(supabase, householdId, dateFrom, dateTo),
    sumClearedByKind(
      supabase,
      householdId,
      "investment_contribution",
      dateFrom,
      dateTo,
    ),
    sumClearedByKind(supabase, householdId, "loan_payment", dateFrom, dateTo),
    getExpenseByCategory(supabase, householdId, dateFrom, dateTo),
  ]);

  // Informational subset of the expense total already computed above —
  // never added a second time to any sum.
  const insurancePremiumTotal = categoryBreakdown
    .filter((row) => row.classification === "protection")
    .reduce((sum, row) => sum + row.totalMinorUnits, 0);

  const totals = {
    incomeMinorUnits: incomeTotal,
    expenseMinorUnits: expenseSummary.totalMinorUnits,
    investmentMinorUnits: investmentTotal,
    debtPaymentMinorUnits: debtPaymentTotal,
  };
  const freeCashFlowMinorUnits = computeFreeCashFlow(totals);
  const savingsRate = computeSavingsRate(
    freeCashFlowMinorUnits,
    totals.incomeMinorUnits,
  );
  const investmentRate = computeInvestmentRate(
    totals.investmentMinorUnits,
    totals.incomeMinorUnits,
  );

  const money = (amountMinorUnits: number) =>
    createMoney(amountMinorUnits, currencyCode);

  return {
    currencyCode,
    income: money(totals.incomeMinorUnits),
    expense: money(totals.expenseMinorUnits),
    investment: money(totals.investmentMinorUnits),
    debtPayment: money(totals.debtPaymentMinorUnits),
    insurancePremium: money(insurancePremiumTotal),
    freeCashFlow: money(freeCashFlowMinorUnits),
    savingsRate,
    investmentRate,
  };
}

export type AvailableBalance = {
  total: Money;
  /** Active accounts included in the total (same currency as the household base currency). */
  accountCount: number;
  /**
   * Active accounts excluded because their currency differs from the
   * household base currency — this app has no live FX conversion engine
   * (see docs/product-scope.md §4), so a different-currency balance is
   * never summed into this total by an invented rate.
   */
  excludedAccountCount: number;
};

/**
 * Total current balance across the household's open accounts, in its base
 * currency only. Reuses listAccounts' calculated-balance strategy (see
 * src/lib/calculations/account-balance.ts) rather than re-deriving it.
 */
export async function getAvailableBalance(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
): Promise<AvailableBalance> {
  // Fetches every active account, not just the first 100 — see
  // docs/performance-audit.md's "Net-worth calculation" finding: a single
  // { pageSize: 100 } page silently truncates a household with more
  // accounts than that, understating this total with no visible sign
  // anything was dropped.
  const { rows: accounts } = await fetchAllRows((pagination) =>
    listAccounts(supabase, householdId, {}, pagination),
  );

  let total = createMoney(0, baseCurrencyCode);
  let accountCount = 0;
  let excludedAccountCount = 0;

  for (const account of accounts) {
    if (account.currency_code !== baseCurrencyCode) {
      excludedAccountCount += 1;
      continue;
    }
    total = addMoney(total, account.currentBalance);
    accountCount += 1;
  }

  return { total, accountCount, excludedAccountCount };
}

/** Builds the trailing `monthsBack` UTC month keys (oldest first) ending in the month containing `asOfDate`. */
function buildTrailingMonthKeys(
  asOfDate: string,
  monthsBack: number,
): string[] {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  return Array.from({ length: monthsBack }, (_, i) => {
    const monthDate = new Date(
      Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + i, 1),
    );
    return `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Monthly totals for one transaction kind over the trailing `monthsBack`
 * months — the same bounded month-bucketing pattern as getIncomeTrend/
 * getExpenseTrend, kept local since neither of those is generic over kind.
 */
async function getKindTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  kind: TransactionKind,
  monthsBack: number,
  asOfDate: string,
): Promise<Map<string, number>> {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  const dateFrom = toIsoDateString(rangeStart);

  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("transaction_date, amount_minor_units")
      .eq("household_id", householdId)
      .eq("kind", kind)
      .eq("status", "cleared")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", asOfDate),
  );

  const totals = new Map<string, number>();
  for (const key of buildTrailingMonthKeys(asOfDate, monthsBack)) {
    totals.set(key, 0);
  }
  for (const row of rows) {
    const key = row.transaction_date.slice(0, 7);
    if (totals.has(key)) {
      totals.set(key, (totals.get(key) ?? 0) + row.amount_minor_units);
    }
  }
  return totals;
}

export type CashFlowTrendRow = {
  monthKey: string;
  incomeMinorUnits: number;
  expenseMinorUnits: number;
  investmentMinorUnits: number;
  debtPaymentMinorUnits: number;
  freeCashFlowMinorUnits: number;
};

/**
 * Monthly income/expense/investment/debt-payment totals (and the
 * free-cash-flow derived from them) for the trailing `monthsBack` months —
 * the data behind the income-vs-expense trend and monthly-savings-trend
 * charts. Reuses getIncomeTrend/getExpenseTrend directly (both already
 * unit-tested, already net-of-refunds for expenses) rather than
 * re-implementing that bucketing.
 */
export async function getCashFlowTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<CashFlowTrendRow[]> {
  const [incomeTrend, expenseTrend, investmentTotals, debtTotals] =
    await Promise.all([
      getIncomeTrend(supabase, householdId, monthsBack, asOfDate),
      getExpenseTrend(supabase, householdId, monthsBack, asOfDate),
      getKindTrend(
        supabase,
        householdId,
        "investment_contribution",
        monthsBack,
        asOfDate,
      ),
      getKindTrend(supabase, householdId, "loan_payment", monthsBack, asOfDate),
    ]);

  const incomeByMonth = new Map(
    incomeTrend.map((row) => [row.monthKey, row.totalMinorUnits]),
  );
  const expenseByMonth = new Map(
    expenseTrend.map((row) => [row.monthKey, row.totalMinorUnits]),
  );

  return buildTrailingMonthKeys(asOfDate, monthsBack).map((monthKey) => {
    const incomeMinorUnits = incomeByMonth.get(monthKey) ?? 0;
    const expenseMinorUnits = expenseByMonth.get(monthKey) ?? 0;
    const investmentMinorUnits = investmentTotals.get(monthKey) ?? 0;
    const debtPaymentMinorUnits = debtTotals.get(monthKey) ?? 0;

    return {
      monthKey,
      incomeMinorUnits,
      expenseMinorUnits,
      investmentMinorUnits,
      debtPaymentMinorUnits,
      freeCashFlowMinorUnits: computeFreeCashFlow({
        incomeMinorUnits,
        expenseMinorUnits,
        investmentMinorUnits,
        debtPaymentMinorUnits,
      }),
    };
  });
}

type BalanceTrendAccount = {
  id: string;
  currency_code: string;
  opening_balance_minor_units: number;
  opened_date: string | null;
};

type BalanceTrendSnapshot = { asOfDate: string; balanceMinorUnits: number };

function toBalanceTransaction(row: {
  kind: string;
  amount_minor_units: number;
  account_id: string;
  transfer_account_id: string | null;
  transaction_date: string;
  transfer_fee_minor_units: number | null;
  transfer_destination_amount_minor_units: number | null;
}): BalanceAffectingTransaction {
  return {
    kind: row.kind as BalanceAffectingTransaction["kind"],
    amountMinorUnits: row.amount_minor_units,
    accountId: row.account_id,
    transferAccountId: row.transfer_account_id,
    transactionDate: row.transaction_date,
    transferFeeMinorUnits: row.transfer_fee_minor_units,
    transferDestinationAmountMinorUnits:
      row.transfer_destination_amount_minor_units,
  };
}

/** The latest snapshot at or before `cutoffDate`, or null if none exists yet. */
function latestSnapshotAtOrBefore(
  snapshots: readonly BalanceTrendSnapshot[],
  cutoffDate: string,
): BalanceTrendSnapshot | null {
  let latest: BalanceTrendSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.asOfDate > cutoffDate) {
      continue;
    }
    if (!latest || snapshot.asOfDate > latest.asOfDate) {
      latest = snapshot;
    }
  }
  return latest;
}

export type AccountBalanceTrendRow = {
  monthKey: string;
  totalMinorUnits: number;
};

/**
 * Total calculated balance across the household's open, base-currency
 * accounts at the end of each of the trailing `monthsBack` months (the
 * current month is clamped to `asOfDate`, i.e. "month to date"). Reuses
 * computeAccountBalance (src/lib/calculations/account-balance.ts) per
 * account per month-end cutoff — the same balance strategy every other
 * account balance in this app uses, just evaluated at several past dates
 * instead of only "now". The one transaction fetch is bounded to each
 * account's applicable snapshot baseline (or opened_date) through
 * asOfDate, never an unbounded full-history scan, mirroring
 * src/features/accounts/queries.ts's listAccounts.
 */
export async function getAccountBalanceTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<AccountBalanceTrendRow[]> {
  const monthKeys = buildTrailingMonthKeys(asOfDate, monthsBack);
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );

  const monthEndCutoffs = monthKeys.map((monthKey, index) => {
    const monthDate = new Date(
      Date.UTC(
        rangeStart.getUTCFullYear(),
        rangeStart.getUTCMonth() + index,
        1,
      ),
    );
    const monthEnd = toIsoDateString(
      new Date(
        Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
      ),
    );
    return { monthKey, cutoff: monthEnd > asOfDate ? asOfDate : monthEnd };
  });

  const accounts = unwrapList(
    await supabase
      .from("financial_accounts")
      .select("id, currency_code, opening_balance_minor_units, opened_date")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .eq("currency_code", baseCurrencyCode),
  ) as BalanceTrendAccount[];

  if (accounts.length === 0) {
    return monthEndCutoffs.map(({ monthKey }) => ({
      monthKey,
      totalMinorUnits: 0,
    }));
  }

  const accountIds = accounts.map((account) => account.id);
  const firstCutoff = monthEndCutoffs[0]?.cutoff ?? asOfDate;

  const snapshotRows = unwrapList(
    await supabase
      .from("account_balance_snapshots")
      .select("account_id, as_of_date, balance_minor_units")
      .eq("household_id", householdId)
      .in("account_id", accountIds)
      .order("as_of_date", { ascending: true }),
  );

  const snapshotsByAccount = new Map<string, BalanceTrendSnapshot[]>();
  for (const row of snapshotRows) {
    const list = snapshotsByAccount.get(row.account_id) ?? [];
    list.push({
      asOfDate: row.as_of_date,
      balanceMinorUnits: row.balance_minor_units,
    });
    snapshotsByAccount.set(row.account_id, list);
  }

  // Bound the transaction fetch to the earliest baseline any account could
  // need for the *first* month-end in range (its latest snapshot at or
  // before that date, or its opened_date) — never an unbounded scan.
  let earliestFetchFrom: string | null = null;
  let anyAccountUnbounded = false;
  for (const account of accounts) {
    const baseline =
      latestSnapshotAtOrBefore(
        snapshotsByAccount.get(account.id) ?? [],
        firstCutoff,
      )?.asOfDate ?? account.opened_date;
    if (!baseline) {
      anyAccountUnbounded = true;
      continue;
    }
    if (earliestFetchFrom === null || baseline < earliestFetchFrom) {
      earliestFetchFrom = baseline;
    }
  }

  let transactionsQuery = supabase
    .from("transactions")
    .select(
      "kind, amount_minor_units, account_id, transfer_account_id, transaction_date, status, transfer_fee_minor_units, transfer_destination_amount_minor_units",
    )
    .eq("household_id", householdId)
    .in("status", ["pending", "cleared", "reconciled"])
    .or(
      `account_id.in.(${accountIds.join(",")}),transfer_account_id.in.(${accountIds.join(",")})`,
    )
    .lte("transaction_date", asOfDate);

  if (!anyAccountUnbounded && earliestFetchFrom) {
    transactionsQuery = transactionsQuery.gt(
      "transaction_date",
      earliestFetchFrom,
    );
  }

  const transactions = unwrapList(await transactionsQuery);

  return monthEndCutoffs.map(({ monthKey, cutoff }) => {
    let totalMinorUnits = 0;
    for (const account of accounts) {
      const snapshot = latestSnapshotAtOrBefore(
        snapshotsByAccount.get(account.id) ?? [],
        cutoff,
      );
      const relevant = transactions
        .filter(
          (t) =>
            (t.account_id === account.id ||
              t.transfer_account_id === account.id) &&
            t.transaction_date <= cutoff,
        )
        .map(toBalanceTransaction);

      const { balance } = computeAccountBalance({
        accountId: account.id,
        currencyCode: account.currency_code,
        openingBalanceMinorUnits: account.opening_balance_minor_units,
        openedDate: account.opened_date,
        latestSnapshot: snapshot,
        transactions: relevant,
      });
      totalMinorUnits += balance.amountMinorUnits;
    }
    return { monthKey, totalMinorUnits };
  });
}
