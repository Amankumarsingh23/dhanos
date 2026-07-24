import type { createClient } from "@/lib/supabase/server";
import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { toIsoDateString } from "@/lib/dates";
import { minorUnitExponent } from "@/lib/money/currency";
import type { CsvColumn, CsvRow } from "@/lib/reports/csv";
import type { ReportFilters } from "@/lib/validation/reports";
import { INVESTMENT_ASSET_CLASS_LABELS } from "@/lib/validation/investments";
import { POLICY_TYPE_LABELS, type PolicyType } from "@/lib/validation/insurance";
import {
  moneyCell,
  numberCell,
  textCell,
  type ReportMeta,
  type ReportTableColumn,
  type ReportTableData,
  type ReportTableRow,
} from "./types";

import { getCashFlowSummary } from "@/features/dashboard/queries";
import {
  getExpenseByCategory,
  getExpenseSummary,
} from "@/features/expenses/queries";
import { getIncomeBySource } from "@/features/income/queries";
import {
  getAssetAllocation,
  getContributionHistory,
  getPortfolioValueTrend,
} from "@/features/investments/queries";
import {
  getCompletedSipContributions,
  listSips,
} from "@/features/investment-sips/queries";
import { getDailyValueSeries } from "@/features/staking/queries";
import { getDebtDashboardData } from "@/features/loans/debt-dashboard-queries";
import { listPolicies } from "@/features/insurance/queries";
import { getCurrentNetWorthBreakdown, getNetWorthChartsData } from "@/features/net-worth/queries";
import { listLendings } from "@/features/lending/queries";
import { listGoals } from "@/features/goals/queries";
import { getEmergencyFundPlanDetail } from "@/features/emergency-fund/queries";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import {
  groupDebtByType,
  type DebtGroupRow,
} from "@/lib/calculations/debt-metrics";
import {
  buildTrailingMonthKeys,
  computeHouseholdDebtTrend,
  type DebtTrendPoint,
} from "@/lib/calculations/debt-trend";
import {
  computeLendingTotals,
  groupLendingByBorrower,
  type BorrowerExposureRow,
  type LendingForTotals,
} from "@/lib/calculations/lending-metrics";
import type { GoalOnTrackStatus } from "@/lib/calculations/goals";
import {
  computeOverallSipConsistency,
  computeSipConsistency,
  type SipConsistencyRow,
} from "@/lib/calculations/reports";
import type { RecurringScheduleSource } from "@/lib/calculations/recurring-schedule";
import type { InsuranceCoverageRow } from "./charts/insurance-coverage-chart";
import type { AssetOrLiabilityRow } from "./charts/assets-liabilities-chart";
import type { GoalReadinessRow } from "./charts/goal-readiness-chart";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type Household = { id: string; base_currency_code: string; timezone: string };

function majorUnits(amountMinorUnits: number, currencyCode: string): number {
  const exponent = minorUnitExponent(currencyCode);
  return amountMinorUnits / 10 ** exponent;
}

/** "Jan 2026 – Jul 2026" or the same-month short form. */
function formatRangeLabel(dateFrom: string, dateTo: string): string {
  return `${dateFrom} – ${dateTo}`;
}

function todayCutoffLabel(asOfDate: string): string {
  return `Data as of ${asOfDate}`;
}

/** Resolves an explicit [dateFrom, dateTo] from filters, defaulting to the trailing `defaultMonthsBack` months ending today — every period-based report goes through this so "no filter set" always means the same thing. */
function resolveDateRange(
  filters: ReportFilters,
  asOfDate: string,
  defaultMonthsBack: number,
): { dateFrom: string; dateTo: string } {
  const dateTo = filters.dateTo ?? asOfDate;
  const dateFrom =
    filters.dateFrom ??
    toIsoDateString(addMonths(parseISO(asOfDate), -defaultMonthsBack));
  return { dateFrom, dateTo };
}

function monthsBetween(dateFrom: string, dateTo: string): number {
  const months =
    (parseISO(dateTo).getFullYear() - parseISO(dateFrom).getFullYear()) * 12 +
    (parseISO(dateTo).getMonth() - parseISO(dateFrom).getMonth());
  return Math.max(1, Math.min(24, months + 1));
}

function daysBetween(dateFrom: string, dateTo: string): number {
  return Math.max(
    1,
    Math.min(366, differenceInCalendarDays(parseISO(dateTo), parseISO(dateFrom))),
  );
}

// ---------------------------------------------------------------------
// 1. Monthly cash flow
// ---------------------------------------------------------------------

export type MonthlyCashFlowReport = ReportMeta &
  ReportTableData & {
    incomeMinorUnits: number;
    expenseMinorUnits: number;
    investmentMinorUnits: number;
    debtPaymentMinorUnits: number;
    freeCashFlowMinorUnits: number;
  };

export async function getMonthlyCashFlowReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<MonthlyCashFlowReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 1);
  const currencyCode = household.base_currency_code;
  const summary = await getCashFlowSummary(
    supabase,
    household.id,
    dateFrom,
    dateTo,
    currencyCode,
  );

  const rows: { label: string; amountMinorUnits: number }[] = [
    { label: "Income", amountMinorUnits: summary.income.amountMinorUnits },
    { label: "Expenses", amountMinorUnits: summary.expense.amountMinorUnits },
    { label: "Investments", amountMinorUnits: summary.investment.amountMinorUnits },
    { label: "Debt payments", amountMinorUnits: summary.debtPayment.amountMinorUnits },
    { label: "Free cash flow", amountMinorUnits: summary.freeCashFlow.amountMinorUnits },
  ];

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    incomeMinorUnits: summary.income.amountMinorUnits,
    expenseMinorUnits: summary.expense.amountMinorUnits,
    investmentMinorUnits: summary.investment.amountMinorUnits,
    debtPaymentMinorUnits: summary.debtPayment.amountMinorUnits,
    freeCashFlowMinorUnits: summary.freeCashFlow.amountMinorUnits,
    ...toMoneyTable(rows, currencyCode, "label", "Line item"),
  };
}

// ---------------------------------------------------------------------
// 2. Income by source
// ---------------------------------------------------------------------

export type IncomeBySourceReport = ReportMeta &
  ReportTableData & {
    rows: Awaited<ReturnType<typeof getIncomeBySource>>;
  };

export async function getIncomeBySourceReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<IncomeBySourceReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 1);
  const currencyCode = household.base_currency_code;
  const rows = await getIncomeBySource(supabase, household.id, dateFrom, dateTo);

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    ...toMoneyTable(
      rows.map((row) => ({
        label: row.sourceName,
        amountMinorUnits: row.totalMinorUnits,
      })),
      currencyCode,
      "label",
      "Source",
    ),
  };
}

// ---------------------------------------------------------------------
// 3. Expense by category
// ---------------------------------------------------------------------

export type ExpenseByCategoryReport = ReportMeta &
  ReportTableData & {
    rows: Awaited<ReturnType<typeof getExpenseByCategory>>;
  };

export async function getExpenseByCategoryReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<ExpenseByCategoryReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 1);
  const currencyCode = household.base_currency_code;
  let rows = await getExpenseByCategory(supabase, household.id, dateFrom, dateTo);
  if (filters.categoryId) {
    rows = rows.filter((row) => row.categoryId === filters.categoryId);
  }

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    ...toMoneyTable(
      rows.map((row) => ({
        label: row.categoryName,
        amountMinorUnits: row.totalMinorUnits,
      })),
      currencyCode,
      "label",
      "Category",
    ),
  };
}

// ---------------------------------------------------------------------
// 4. Essential vs. discretionary
// ---------------------------------------------------------------------

export type EssentialVsDiscretionaryReport = ReportMeta &
  ReportTableData & {
    essentialMinorUnits: number;
    discretionaryMinorUnits: number;
    unclassifiedMinorUnits: number;
  };

export async function getEssentialVsDiscretionaryReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<EssentialVsDiscretionaryReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 1);
  const currencyCode = household.base_currency_code;
  const summary = await getExpenseSummary(supabase, household.id, dateFrom, dateTo);

  const rows = [
    { label: "Essential", amountMinorUnits: summary.essentialMinorUnits },
    { label: "Discretionary", amountMinorUnits: summary.discretionaryMinorUnits },
    { label: "Unclassified", amountMinorUnits: summary.unclassifiedMinorUnits },
  ];

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    essentialMinorUnits: summary.essentialMinorUnits,
    discretionaryMinorUnits: summary.discretionaryMinorUnits,
    unclassifiedMinorUnits: summary.unclassifiedMinorUnits,
    ...toMoneyTable(rows, currencyCode, "label", "Bucket"),
  };
}

// ---------------------------------------------------------------------
// 5. Investment contributions
// ---------------------------------------------------------------------

export type InvestmentContributionsReport = ReportMeta &
  ReportTableData & {
    data: Awaited<ReturnType<typeof getContributionHistory>>;
  };

export async function getInvestmentContributionsReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<InvestmentContributionsReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 6);
  const currencyCode = household.base_currency_code;
  const monthsBack = monthsBetween(dateFrom, dateTo);
  const data = await getContributionHistory(
    supabase,
    household.id,
    currencyCode,
    monthsBack,
    asOfDate,
  );

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    data,
    ...toMoneyTable(
      data.map((point) => ({
        label: point.monthKey,
        amountMinorUnits: point.amountMinorUnits,
      })),
      currencyCode,
      "label",
      "Month",
    ),
  };
}

// ---------------------------------------------------------------------
// 6. Portfolio allocation
// ---------------------------------------------------------------------

export type PortfolioAllocationReport = ReportMeta &
  ReportTableData & {
    rows: Awaited<ReturnType<typeof getAssetAllocation>>;
  };

export async function getPortfolioAllocationReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<PortfolioAllocationReport> {
  const currencyCode = household.base_currency_code;
  let rows = await getAssetAllocation(supabase, household.id, asOfDate);
  rows = rows.filter((row) => row.currencyCode === currencyCode);
  if (filters.assetClass) {
    const label =
      INVESTMENT_ASSET_CLASS_LABELS[
        filters.assetClass as keyof typeof INVESTMENT_ASSET_CLASS_LABELS
      ];
    rows = rows.filter((row) => row.label === label);
  }

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    ...toMoneyTable(
      rows.map((row) => ({
        label: row.label,
        amountMinorUnits: row.currentValueMinorUnits,
      })),
      currencyCode,
      "label",
      "Asset class",
    ),
  };
}

// ---------------------------------------------------------------------
// 7. Portfolio growth
// ---------------------------------------------------------------------

export type PortfolioGrowthReport = ReportMeta &
  ReportTableData & {
    data: Awaited<ReturnType<typeof getPortfolioValueTrend>>;
  };

export async function getPortfolioGrowthReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<PortfolioGrowthReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 6);
  const currencyCode = household.base_currency_code;
  const monthsBack = monthsBetween(dateFrom, dateTo);
  const data = await getPortfolioValueTrend(
    supabase,
    household.id,
    currencyCode,
    monthsBack,
    asOfDate,
  );

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    data,
    tableColumns: [
      { key: "month", label: "Month" },
      { key: "principal", label: "Principal", align: "right" },
      { key: "growth", label: "Growth", align: "right" },
      { key: "total", label: "Total value", align: "right" },
    ],
    tableRows: data.map((point) =>
      buildRow({
        month: textCell(point.monthKey),
        principal: moneyCell(point.principalMinorUnits, currencyCode),
        growth: moneyCell(
          point.currentValueMinorUnits - point.principalMinorUnits,
          currencyCode,
        ),
        total: moneyCell(point.currentValueMinorUnits, currencyCode),
      }),
    ),
    csvColumns: [
      { key: "month", label: "Month" },
      { key: "principal", label: `Principal (${currencyCode})` },
      { key: "growth", label: `Growth (${currencyCode})` },
      { key: "total", label: `Total value (${currencyCode})` },
    ],
    csvRows: data.map((point) => ({
      month: point.monthKey,
      principal: majorUnits(point.principalMinorUnits, currencyCode),
      growth: majorUnits(
        point.currentValueMinorUnits - point.principalMinorUnits,
        currencyCode,
      ),
      total: majorUnits(point.currentValueMinorUnits, currencyCode),
    })),
  };
}

// ---------------------------------------------------------------------
// 8. SIP consistency
// ---------------------------------------------------------------------

export type SipConsistencyReport = ReportMeta &
  ReportTableData & {
    rows: SipConsistencyRow[];
    overallConsistencyPercentage: number | null;
  };

export async function getSipConsistencyReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<SipConsistencyReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 6);
  const currencyCode = household.base_currency_code;

  const [sipsPage, contributions] = await Promise.all([
    listSips(supabase, household.id, { status: "active" }, { pageSize: MAX_PAGE_SIZE }, asOfDate),
    getCompletedSipContributions(supabase, household.id, dateFrom, dateTo),
  ]);

  const sips = sipsPage.rows
    .filter((sip) => sip.currency_code === currencyCode)
    .map((sip) => ({
      id: sip.id,
      name: sip.name,
      currencyCode: sip.currency_code,
      schedule: {
        frequency: sip.frequency as RecurringScheduleSource["frequency"],
        intervalCount: sip.interval_count,
        startDate: sip.start_date,
        endDate: sip.end_date,
      },
    }));

  const rows = computeSipConsistency(
    sips,
    contributions.map((c) => ({ sipId: c.investmentSipId })),
    { windowStart: dateFrom, windowEnd: dateTo },
  );
  const overallConsistencyPercentage = computeOverallSipConsistency(rows);

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    overallConsistencyPercentage,
    tableColumns: [
      { key: "sip", label: "SIP" },
      { key: "expected", label: "Expected", align: "right" },
      { key: "completed", label: "Completed", align: "right" },
      { key: "consistency", label: "Consistency", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        sip: textCell(row.sipName),
        expected: numberCell(row.expectedCount),
        completed: numberCell(row.completedCount),
        consistency:
          row.consistencyPercentage === null
            ? textCell("—")
            : numberCell(row.consistencyPercentage, "%"),
      }),
    ),
    csvColumns: [
      { key: "sip", label: "SIP" },
      { key: "expected", label: "Expected" },
      { key: "completed", label: "Completed" },
      { key: "consistencyPercentage", label: "Consistency %" },
    ],
    csvRows: rows.map((row) => ({
      sip: row.sipName,
      expected: row.expectedCount,
      completed: row.completedCount,
      consistencyPercentage: row.consistencyPercentage ?? "",
    })),
  };
}

// ---------------------------------------------------------------------
// 9. Staking performance
// ---------------------------------------------------------------------

export type StakingPerformanceReport = ReportMeta &
  ReportTableData & {
    data: Awaited<ReturnType<typeof getDailyValueSeries>>;
  };

export async function getStakingPerformanceReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<StakingPerformanceReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 3);
  const currencyCode = household.base_currency_code;
  const daysBack = daysBetween(dateFrom, dateTo);
  const data = await getDailyValueSeries(
    supabase,
    household.id,
    currencyCode,
    daysBack,
    asOfDate,
  );

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    data,
    tableColumns: [
      { key: "date", label: "Date" },
      { key: "actual", label: "Actual value", align: "right" },
      { key: "expected", label: "Expected value", align: "right" },
    ],
    tableRows: data.map((point) =>
      buildRow({
        date: textCell(point.date),
        actual: moneyCell(point.closingValueMinorUnits, currencyCode),
        expected:
          point.expectedValueMinorUnits === null
            ? textCell("—")
            : moneyCell(point.expectedValueMinorUnits, currencyCode),
      }),
    ),
    csvColumns: [
      { key: "date", label: "Date" },
      { key: "actual", label: `Actual value (${currencyCode})` },
      { key: "expected", label: `Expected value (${currencyCode})` },
    ],
    csvRows: data.map((point) => ({
      date: point.date,
      actual: majorUnits(point.closingValueMinorUnits, currencyCode),
      expected:
        point.expectedValueMinorUnits === null
          ? ""
          : majorUnits(point.expectedValueMinorUnits, currencyCode),
    })),
  };
}

// ---------------------------------------------------------------------
// 10 & 11. Debt position, debt reduction (one combined fetch, two reports)
// ---------------------------------------------------------------------

export type DebtPositionReport = ReportMeta &
  ReportTableData & {
    rows: DebtGroupRow[];
    totalOutstandingMinorUnits: number;
  };

export async function getDebtPositionReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<DebtPositionReport> {
  const currencyCode = household.base_currency_code;
  const data = await getDebtDashboardData(supabase, household.id, currencyCode, asOfDate);

  let rows = data.debtByType;
  if (filters.institutionId) {
    const filteredLoans = data.loans.filter(
      (loan) =>
        loan.currency_code === currencyCode &&
        loan.lender_institution_id === filters.institutionId,
    );
    rows = groupDebtByType(
      filteredLoans.map((loan) => {
        const latestBalancePoint = loan.balanceHistory[loan.balanceHistory.length - 1];
        return {
          currencyCode: loan.currency_code,
          status: loan.status,
          loanType: loan.loan_type,
          lenderName: loan.lenderName,
          originalPrincipalMinorUnits: loan.original_principal_minor_units,
          outstandingMinorUnits: loan.outstandingMinorUnits,
          emiAmountMinorUnits: loan.emi_amount_minor_units,
          interestPaidMinorUnits: latestBalancePoint?.cumulativeInterestPaidMinorUnits ?? 0,
          principalRepaidMinorUnits: latestBalancePoint?.cumulativePrincipalPaidMinorUnits ?? 0,
        };
      }),
      currencyCode,
    );
  }
  const totalOutstandingMinorUnits = rows.reduce(
    (sum, row) => sum + row.outstandingMinorUnits,
    0,
  );

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    totalOutstandingMinorUnits,
    tableColumns: [
      { key: "type", label: "Loan type" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "count", label: "Loans", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        type: textCell(row.key),
        outstanding: moneyCell(row.outstandingMinorUnits, currencyCode),
        count: numberCell(row.loanCount),
      }),
    ),
    csvColumns: [
      { key: "type", label: "Loan type" },
      { key: "outstanding", label: `Outstanding (${currencyCode})` },
      { key: "count", label: "Loans" },
    ],
    csvRows: rows.map((row) => ({
      type: row.key,
      outstanding: majorUnits(row.outstandingMinorUnits, currencyCode),
      count: row.loanCount,
    })),
  };
}

export type DebtReductionReport = ReportMeta &
  ReportTableData & {
    data: DebtTrendPoint[];
  };

export async function getDebtReductionReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<DebtReductionReport> {
  const { dateFrom, dateTo } = resolveDateRange(filters, asOfDate, 6);
  const currencyCode = household.base_currency_code;
  const monthsBack = monthsBetween(dateFrom, dateTo);

  const dashboardData = await getDebtDashboardData(
    supabase,
    household.id,
    currencyCode,
    asOfDate,
  );
  const inCurrency = dashboardData.loans.filter(
    (loan) => loan.currency_code === currencyCode,
  );
  const data = computeHouseholdDebtTrend(
    inCurrency.map((loan) => ({
      disbursedAmountMinorUnits: loan.disbursed_amount_minor_units,
      disbursedDate: loan.disbursed_date,
      balanceHistory: loan.balanceHistory,
    })),
    buildTrailingMonthKeys(asOfDate, monthsBack),
  );

  return {
    dateRangeLabel: formatRangeLabel(dateFrom, dateTo),
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    data,
    tableColumns: [
      { key: "month", label: "Month" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "principalPaid", label: "Cumulative principal paid", align: "right" },
      { key: "interestPaid", label: "Cumulative interest paid", align: "right" },
    ],
    tableRows: data.map((point) =>
      buildRow({
        month: textCell(point.monthKey),
        outstanding: moneyCell(point.outstandingMinorUnits, currencyCode),
        principalPaid: moneyCell(
          point.cumulativePrincipalPaidMinorUnits,
          currencyCode,
        ),
        interestPaid: moneyCell(
          point.cumulativeInterestPaidMinorUnits,
          currencyCode,
        ),
      }),
    ),
    csvColumns: [
      { key: "month", label: "Month" },
      { key: "outstanding", label: `Outstanding (${currencyCode})` },
      { key: "principalPaid", label: `Cumulative principal paid (${currencyCode})` },
      { key: "interestPaid", label: `Cumulative interest paid (${currencyCode})` },
    ],
    csvRows: data.map((point) => ({
      month: point.monthKey,
      outstanding: majorUnits(point.outstandingMinorUnits, currencyCode),
      principalPaid: majorUnits(
        point.cumulativePrincipalPaidMinorUnits,
        currencyCode,
      ),
      interestPaid: majorUnits(
        point.cumulativeInterestPaidMinorUnits,
        currencyCode,
      ),
    })),
  };
}

// ---------------------------------------------------------------------
// 12. Insurance coverage
// ---------------------------------------------------------------------

export type InsuranceCoverageReport = ReportMeta &
  ReportTableData & {
    rows: InsuranceCoverageRow[];
  };

export async function getInsuranceCoverageReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<InsuranceCoverageReport> {
  const currencyCode = household.base_currency_code;
  const page = await listPolicies(
    supabase,
    household.id,
    { status: "active" },
    { pageSize: MAX_PAGE_SIZE },
  );
  let policies = page.rows.filter((policy) => policy.currency_code === currencyCode);
  if (filters.institutionId) {
    policies = policies.filter(
      (policy) => policy.insurer_institution_id === filters.institutionId,
    );
  }
  if (filters.categoryId) {
    policies = policies.filter((policy) => policy.policy_type === filters.categoryId);
  }

  const byType = new Map<string, { coverage: number; count: number }>();
  for (const policy of policies) {
    const existing = byType.get(policy.policy_type) ?? { coverage: 0, count: 0 };
    existing.coverage += policy.coverage_amount_minor_units;
    existing.count += 1;
    byType.set(policy.policy_type, existing);
  }

  const rows: InsuranceCoverageRow[] = Array.from(byType.entries())
    .map(([policyType, { coverage, count }]) => ({
      policyTypeLabel: POLICY_TYPE_LABELS[policyType as PolicyType] ?? policyType,
      coverageAmountMinorUnits: coverage,
      policyCount: count,
    }))
    .sort((a, b) => b.coverageAmountMinorUnits - a.coverageAmountMinorUnits);

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    tableColumns: [
      { key: "type", label: "Policy type" },
      { key: "coverage", label: "Coverage", align: "right" },
      { key: "count", label: "Policies", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        type: textCell(row.policyTypeLabel),
        coverage: moneyCell(row.coverageAmountMinorUnits, currencyCode),
        count: numberCell(row.policyCount),
      }),
    ),
    csvColumns: [
      { key: "type", label: "Policy type" },
      { key: "coverage", label: `Coverage (${currencyCode})` },
      { key: "count", label: "Policies" },
    ],
    csvRows: rows.map((row) => ({
      type: row.policyTypeLabel,
      coverage: majorUnits(row.coverageAmountMinorUnits, currencyCode),
      count: row.policyCount,
    })),
  };
}

// ---------------------------------------------------------------------
// 13. Assets and liabilities
// ---------------------------------------------------------------------

export type AssetsAndLiabilitiesReport = ReportMeta &
  ReportTableData & {
    rows: AssetOrLiabilityRow[];
    totalAssetsMinorUnits: number;
    totalLiabilitiesMinorUnits: number;
    netWorthMinorUnits: number;
  };

export async function getAssetsAndLiabilitiesReport(
  supabase: SupabaseServerClient,
  household: Household,
  _filters: ReportFilters,
  asOfDate: string,
): Promise<AssetsAndLiabilitiesReport> {
  const currencyCode = household.base_currency_code;
  const breakdown = await getCurrentNetWorthBreakdown(supabase, household.id, currencyCode);

  const assetEntries: { label: string; amountMinorUnits: number }[] = [
    { label: "Cash and accounts", amountMinorUnits: breakdown.cashAndAccountsMinorUnits },
    { label: "Investments", amountMinorUnits: breakdown.investmentsMinorUnits },
    { label: "Movable assets", amountMinorUnits: breakdown.movableAssetsMinorUnits },
    { label: "Property", amountMinorUnits: breakdown.propertyMinorUnits },
    { label: "Receivables", amountMinorUnits: breakdown.receivablesMinorUnits },
  ];
  const liabilityEntries: { label: string; amountMinorUnits: number }[] = [
    { label: "Loans", amountMinorUnits: breakdown.loansMinorUnits },
    { label: "Other liabilities", amountMinorUnits: breakdown.otherLiabilitiesMinorUnits },
  ];

  const rows: AssetOrLiabilityRow[] = [
    ...assetEntries.map((entry) => ({
      label: entry.label,
      signedAmountMinorUnits: entry.amountMinorUnits,
      kind: "asset" as const,
    })),
    ...liabilityEntries.map((entry) => ({
      label: entry.label,
      signedAmountMinorUnits: -entry.amountMinorUnits,
      kind: "liability" as const,
    })),
  ];

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    totalAssetsMinorUnits: breakdown.totalAssetsMinorUnits,
    totalLiabilitiesMinorUnits: breakdown.totalLiabilitiesMinorUnits,
    netWorthMinorUnits: breakdown.netWorthMinorUnits,
    tableColumns: [
      { key: "label", label: "Category" },
      { key: "kind", label: "Type" },
      { key: "amount", label: "Amount", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        label: textCell(row.label),
        kind: textCell(row.kind === "asset" ? "Asset" : "Liability"),
        amount: moneyCell(Math.abs(row.signedAmountMinorUnits), currencyCode),
      }),
    ),
    csvColumns: [
      { key: "label", label: "Category" },
      { key: "kind", label: "Type" },
      { key: "amount", label: `Amount (${currencyCode})` },
    ],
    csvRows: rows.map((row) => ({
      label: row.label,
      kind: row.kind,
      amount: majorUnits(Math.abs(row.signedAmountMinorUnits), currencyCode),
    })),
  };
}

// ---------------------------------------------------------------------
// 14. Lending exposure
// ---------------------------------------------------------------------

export type LendingExposureReport = ReportMeta &
  ReportTableData & {
    rows: BorrowerExposureRow[];
  };

export async function getLendingExposureReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<LendingExposureReport> {
  const currencyCode = household.base_currency_code;
  const page = await listLendings(
    supabase,
    household.id,
    {},
    { pageSize: MAX_PAGE_SIZE },
  );
  let lendings = page.rows;
  if (filters.personId) {
    lendings = lendings.filter((lending) => lending.borrower_person_id === filters.personId);
  }
  if (filters.institutionId) {
    lendings = lendings.filter(
      (lending) => lending.borrower_institution_id === filters.institutionId,
    );
  }

  const totalsInput: LendingForTotals[] = lendings.map((lending) => ({
    currencyCode: lending.currency_code,
    status: lending.status,
    borrowerKey: lending.borrowerName,
    amountLentMinorUnits: lending.amount_lent_minor_units,
    outstandingMinorUnits: lending.outstandingMinorUnits,
    principalRecoveredMinorUnits: lending.totalPrincipalRecoveredMinorUnits,
    interestReceivedMinorUnits: lending.totalInterestReceivedMinorUnits,
  }));
  computeLendingTotals(totalsInput, currencyCode); // validated shape reused below; totals themselves shown via SummaryCards elsewhere
  const rows = groupLendingByBorrower(totalsInput, currencyCode);

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    tableColumns: [
      { key: "borrower", label: "Borrower" },
      { key: "outstanding", label: "Outstanding", align: "right" },
      { key: "count", label: "Lendings", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        borrower: textCell(row.key),
        outstanding: moneyCell(row.outstandingMinorUnits, currencyCode),
        count: numberCell(row.lendingCount),
      }),
    ),
    csvColumns: [
      { key: "borrower", label: "Borrower" },
      { key: "outstanding", label: `Outstanding (${currencyCode})` },
      { key: "count", label: "Lendings" },
    ],
    csvRows: rows.map((row) => ({
      borrower: row.key,
      outstanding: majorUnits(row.outstandingMinorUnits, currencyCode),
      count: row.lendingCount,
    })),
  };
}

// ---------------------------------------------------------------------
// 15. Goal readiness
// ---------------------------------------------------------------------

const GOAL_STATUS_LABELS: Record<GoalOnTrackStatus, string> = {
  funded: "Funded",
  on_track: "On track",
  needs_contribution: "Needs contribution",
  overdue: "Overdue",
};
const GOAL_STATUSES: GoalOnTrackStatus[] = [
  "funded",
  "on_track",
  "needs_contribution",
  "overdue",
];

export type GoalReadinessReport = ReportMeta &
  ReportTableData & {
    rows: GoalReadinessRow[];
  };

export async function getGoalReadinessReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<GoalReadinessReport> {
  const currencyCode = household.base_currency_code;
  const page = await listGoals(
    supabase,
    household.id,
    { status: "active" },
    { pageSize: MAX_PAGE_SIZE },
    asOfDate,
  );
  let goals = page.rows.filter((goal) => goal.currency_code === currencyCode);
  if (filters.personId) {
    goals = goals.filter((goal) =>
      goal.responsiblePeople.some((person) => person.personId === filters.personId),
    );
  }

  const byStatus = new Map<GoalOnTrackStatus, number>();
  for (const status of GOAL_STATUSES) byStatus.set(status, 0);
  for (const goal of goals) {
    byStatus.set(
      goal.onTrackStatus as GoalOnTrackStatus,
      (byStatus.get(goal.onTrackStatus as GoalOnTrackStatus) ?? 0) + 1,
    );
  }

  const rows: GoalReadinessRow[] = GOAL_STATUSES.map((status) => ({
    status,
    statusLabel: GOAL_STATUS_LABELS[status],
    goalCount: byStatus.get(status) ?? 0,
  }));

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    rows,
    tableColumns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Goals", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        status: textCell(row.statusLabel),
        count: numberCell(row.goalCount),
      }),
    ),
    csvColumns: [
      { key: "status", label: "Status" },
      { key: "count", label: "Goals" },
    ],
    csvRows: rows.map((row) => ({ status: row.statusLabel, count: row.goalCount })),
  };
}

// ---------------------------------------------------------------------
// 16. Emergency-fund coverage
// ---------------------------------------------------------------------

export type EmergencyFundCoverageReport = ReportMeta &
  ReportTableData & {
    hasPlan: boolean;
    liquidEmergencyMoneyMinorUnits: number;
    targetAmountMinorUnits: number;
    monthsOfCoverage: number | null;
    shortfallMinorUnits: number;
  };

export async function getEmergencyFundCoverageReport(
  supabase: SupabaseServerClient,
  household: Household,
  _filters: ReportFilters,
  asOfDate: string,
): Promise<EmergencyFundCoverageReport> {
  const currencyCode = household.base_currency_code;
  const detail = await getEmergencyFundPlanDetail(supabase, household.id, currencyCode, asOfDate);
  const result = detail.result;

  const rows = [
    { label: "Monthly burn rate", amountMinorUnits: result?.monthlyBurnRateMinorUnits ?? 0 },
    { label: "Target amount", amountMinorUnits: result?.targetAmountMinorUnits ?? 0 },
    {
      label: "Liquid emergency money",
      amountMinorUnits: result?.liquidEmergencyMoneyMinorUnits ?? 0,
    },
    { label: "Shortfall", amountMinorUnits: result?.shortfallMinorUnits ?? 0 },
  ];

  return {
    dateRangeLabel: `As of ${asOfDate}`,
    dataCutoffLabel: todayCutoffLabel(asOfDate),
    currencyCode,
    hasPlan: detail.plan !== null,
    liquidEmergencyMoneyMinorUnits: result?.liquidEmergencyMoneyMinorUnits ?? 0,
    targetAmountMinorUnits: result?.targetAmountMinorUnits ?? 0,
    monthsOfCoverage: result?.monthsOfCoverage ?? null,
    shortfallMinorUnits: result?.shortfallMinorUnits ?? 0,
    ...toMoneyTable(rows, currencyCode, "label", "Metric"),
  };
}

// ---------------------------------------------------------------------
// 17. Net-worth history
// ---------------------------------------------------------------------

export type NetWorthHistoryReport = ReportMeta &
  ReportTableData & {
    data: Awaited<ReturnType<typeof getNetWorthChartsData>>["netWorthCurve"];
  };

export async function getNetWorthHistoryReport(
  supabase: SupabaseServerClient,
  household: Household,
  filters: ReportFilters,
  asOfDate: string,
): Promise<NetWorthHistoryReport> {
  const currencyCode = household.base_currency_code;
  const chartsData = await getNetWorthChartsData(supabase, household.id, currencyCode);
  let data = chartsData.netWorthCurve;
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo ?? asOfDate;
  if (dateFrom) {
    data = data.filter((point) => point.asOfDate >= dateFrom && point.asOfDate <= dateTo);
  }

  const rangeLabel =
    data.length === 0
      ? "No snapshots recorded"
      : formatRangeLabel(
          dateFrom ?? data[0]!.asOfDate,
          dateTo,
        );

  return {
    dateRangeLabel: rangeLabel,
    dataCutoffLabel: "From recorded snapshots only",
    currencyCode,
    data,
    tableColumns: [
      { key: "date", label: "Date" },
      { key: "netWorth", label: "Net worth", align: "right" },
    ],
    tableRows: data.map((point) =>
      buildRow({
        date: textCell(point.asOfDate),
        netWorth: moneyCell(point.netWorthMinorUnits, currencyCode),
      }),
    ),
    csvColumns: [
      { key: "date", label: "Date" },
      { key: "netWorth", label: `Net worth (${currencyCode})` },
    ],
    csvRows: data.map((point) => ({
      date: point.asOfDate,
      netWorth: majorUnits(point.netWorthMinorUnits, currencyCode),
    })),
  };
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

function buildRow(cells: ReportTableRow): ReportTableRow {
  return cells;
}

/** The common "label + money amount" table/CSV shape most reports share. */
function toMoneyTable<T extends { amountMinorUnits: number }>(
  rows: readonly (T & { label: string })[],
  currencyCode: string,
  _labelKey: "label",
  labelColumnLabel: string,
): { tableColumns: ReportTableColumn[]; tableRows: ReportTableRow[]; csvColumns: CsvColumn[]; csvRows: CsvRow[] } {
  return {
    tableColumns: [
      { key: "label", label: labelColumnLabel },
      { key: "amount", label: "Amount", align: "right" },
    ],
    tableRows: rows.map((row) =>
      buildRow({
        label: textCell(row.label),
        amount: moneyCell(row.amountMinorUnits, currencyCode),
      }),
    ),
    csvColumns: [
      { key: "label", label: labelColumnLabel },
      { key: "amount", label: `Amount (${currencyCode})` },
    ],
    csvRows: rows.map((row) => ({
      label: row.label,
      amount: majorUnits(row.amountMinorUnits, currencyCode),
    })),
  };
}
