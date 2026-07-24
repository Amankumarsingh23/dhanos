import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import {
  computeClosingCompleteness,
  computePeriodDateRange,
  resolveCurrentClosing,
  type ClosingCompleteness,
} from "@/lib/calculations/monthly-closing";
import {
  getCashFlowSummary,
  type CashFlowSummary,
} from "@/features/dashboard/queries";
import { listNetWorthSnapshots } from "@/features/net-worth/queries";
import {
  getLargestExpenses,
  type LargestExpenseRow,
} from "@/features/expenses/queries";
import {
  getMissedRecurringRules,
  getUpcomingRecurringRules,
  type RecurringRuleRow,
} from "@/features/recurring/queries";
import {
  getGoalsOverview,
  listGoals,
  type GoalRow,
  type GoalsOverview,
} from "@/features/goals/queries";
import {
  getInsuranceOverview,
  type InsurancePolicyRow,
} from "@/features/insurance/queries";
import {
  getMoneyDrainsOverview,
  type MoneyDrainRow,
} from "@/features/money-drains/queries";
import type { Tables } from "@/types/database";

/**
 * Data access for the monthly financial closing workflow (PROMPT 33).
 * Deliberately built almost entirely on top of every other module's own
 * already-correct query, never re-deriving a figure: cash flow
 * (income/expense/investment/debt-payment/free-cash-flow) reuses the
 * dashboard's getCashFlowSummary; net-worth change reuses PROMPT 32's
 * recorded snapshots directly; missed/upcoming commitments reuse the
 * Recurring module; goal progress reuses the Goals module; upcoming
 * obligations additionally pull insurance renewals and money-drain
 * renewals due soon.
 */

export type MonthlyClosingRecord = Tables<"monthly_closings">;
export type MonthlyClosingReviewItemRecord =
  Tables<"monthly_closing_review_items">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MonthlyClosingWithItems = MonthlyClosingRecord & {
  reviewItems: MonthlyClosingReviewItemRecord[];
};

/** Every closing ever recorded for one period, oldest first — the full correction chain, always viewable (PROMPT 33: "closed month remains viewable"). */
export async function listMonthlyClosingsForPeriod(
  supabase: SupabaseServerClient,
  householdId: string,
  period: string,
): Promise<MonthlyClosingRecord[]> {
  return unwrapList(
    await supabase
      .from("monthly_closings")
      .select("*")
      .eq("household_id", householdId)
      .eq("period", period)
      .order("created_at", { ascending: true }),
  );
}

export type MonthlyClosingPeriodSummary = {
  period: string;
  currentClosing: MonthlyClosingRecord;
  closingCount: number;
};

/** Every period that has at least one closing, most recent period first — each resolved to its current (most recently created) closing in the correction chain. */
export async function listMonthlyClosingPeriods(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<MonthlyClosingPeriodSummary[]> {
  const rows = unwrapList(
    await supabase
      .from("monthly_closings")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: true }),
  );

  const byPeriod = new Map<string, MonthlyClosingRecord[]>();
  for (const row of rows) {
    const list = byPeriod.get(row.period) ?? [];
    list.push(row);
    byPeriod.set(row.period, list);
  }

  const summaries: MonthlyClosingPeriodSummary[] = [];
  for (const [period, closings] of byPeriod.entries()) {
    const current = resolveCurrentClosing(
      closings.map((closing) => ({
        id: closing.id,
        createdAt: closing.created_at,
      })),
    );
    const currentClosing = closings.find(
      (closing) => closing.id === current?.id,
    );
    if (currentClosing) {
      summaries.push({ period, currentClosing, closingCount: closings.length });
    }
  }

  return summaries.sort((a, b) => b.period.localeCompare(a.period));
}

export async function getMonthlyClosingWithItems(
  supabase: SupabaseServerClient,
  householdId: string,
  monthlyClosingId: string,
): Promise<MonthlyClosingWithItems> {
  const closing = unwrapSingle(
    await supabase
      .from("monthly_closings")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", monthlyClosingId)
      .maybeSingle(),
  ) as MonthlyClosingRecord;

  const reviewItems = unwrapList(
    await supabase
      .from("monthly_closing_review_items")
      .select("*")
      .eq("household_id", householdId)
      .eq("monthly_closing_id", monthlyClosingId)
      .order("created_at", { ascending: true }),
  );

  return { ...closing, reviewItems };
}

export type NetWorthChangeSummary = {
  currentMinorUnits: number | null;
  previousMinorUnits: number | null;
  changeMinorUnits: number | null;
  /** Reduction in total liabilities since the prior snapshot — positive means debt went down. Null when there's no prior snapshot to compare against. */
  debtReductionMinorUnits: number | null;
  completenessPercentage: number | null;
};

export type MonthlyClosingReport = {
  closing: MonthlyClosingWithItems;
  completeness: ClosingCompleteness;
  cashFlow: CashFlowSummary;
  netWorth: NetWorthChangeSummary;
  majorUnusualExpenses: readonly LargestExpenseRow[];
  missedCommitments: readonly RecurringRuleRow[];
  upcomingRecurring: readonly RecurringRuleRow[];
  upcomingInsuranceRenewals: readonly InsurancePolicyRow[];
  upcomingMoneyDrainRenewals: readonly MoneyDrainRow[];
  goalsOverview: GoalsOverview;
  goals: readonly GoalRow[];
};

/**
 * The full monthly report (PROMPT 33) for one closing — every figure
 * either reused directly from another module's own query or a plain
 * derived fact (period date range, net-worth delta) computed here from
 * already-correct data. "Reports state when data is incomplete": the
 * `completeness` field is always present and always explains itself (see
 * src/lib/calculations/monthly-closing.ts's computeClosingCompleteness).
 */
export async function getMonthlyClosingReport(
  supabase: SupabaseServerClient,
  householdId: string,
  monthlyClosingId: string,
): Promise<MonthlyClosingReport> {
  const closing = await getMonthlyClosingWithItems(
    supabase,
    householdId,
    monthlyClosingId,
  );
  const { dateFrom, dateTo } = computePeriodDateRange(closing.period);
  const asOfDate = closing.completed_at
    ? toIsoDateString(new Date(closing.completed_at))
    : toIsoDateString(new Date());

  const [
    cashFlow,
    netWorthSnapshots,
    largestExpenses,
    missedCommitments,
    upcomingRecurring,
    insuranceOverview,
    moneyDrainsOverview,
    goalsOverview,
    goalsPage,
  ] = await Promise.all([
    getCashFlowSummary(
      supabase,
      householdId,
      dateFrom,
      dateTo,
      closing.currency_code,
    ),
    listNetWorthSnapshots(supabase, householdId, closing.currency_code),
    getLargestExpenses(supabase, householdId, dateFrom, dateTo, 5),
    getMissedRecurringRules(supabase, householdId, asOfDate),
    getUpcomingRecurringRules(supabase, householdId, 14, asOfDate),
    getInsuranceOverview(
      supabase,
      householdId,
      closing.currency_code,
      asOfDate,
    ),
    getMoneyDrainsOverview(
      supabase,
      householdId,
      closing.currency_code,
      asOfDate,
    ),
    getGoalsOverview(supabase, householdId, closing.currency_code, asOfDate),
    listGoals(
      supabase,
      householdId,
      { status: "active" },
      { pageSize: 100 },
      asOfDate,
    ),
  ]);

  const currentSnapshot =
    netWorthSnapshots.find(
      (snapshot) => snapshot.id === closing.net_worth_snapshot_id,
    ) ?? null;
  const previousSnapshot = currentSnapshot
    ? ([...netWorthSnapshots]
        .filter((snapshot) => snapshot.as_of_date < currentSnapshot.as_of_date)
        .sort((a, b) => b.as_of_date.localeCompare(a.as_of_date))[0] ?? null)
    : null;

  const netWorth: NetWorthChangeSummary = {
    currentMinorUnits: currentSnapshot?.net_worth_minor_units ?? null,
    previousMinorUnits: previousSnapshot?.net_worth_minor_units ?? null,
    changeMinorUnits:
      currentSnapshot && previousSnapshot
        ? currentSnapshot.net_worth_minor_units -
          previousSnapshot.net_worth_minor_units
        : null,
    debtReductionMinorUnits:
      currentSnapshot && previousSnapshot
        ? previousSnapshot.total_liabilities_minor_units -
          currentSnapshot.total_liabilities_minor_units
        : null,
    completenessPercentage: currentSnapshot?.completeness_percentage ?? null,
  };

  const unresolvedItemsCount = closing.reviewItems.filter(
    (item) => !item.is_reviewed,
  ).length;
  const completeness = computeClosingCompleteness({
    unresolvedItemsCount,
    totalReviewItemsCount: closing.reviewItems.length,
    netWorthCompletenessPercentage:
      currentSnapshot?.completeness_percentage ?? 100,
  });

  return {
    closing,
    completeness,
    cashFlow,
    netWorth,
    majorUnusualExpenses: largestExpenses,
    missedCommitments,
    upcomingRecurring,
    upcomingInsuranceRenewals: insuranceOverview.dueSoon,
    upcomingMoneyDrainRenewals: moneyDrainsOverview.upcomingRenewals,
    goalsOverview,
    goals: goalsPage.rows,
  };
}
