import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import { getIncomeTrend } from "@/features/income/queries";
import {
  computeLoanBalanceHistory,
  selectEffectivePayments,
  type LoanBalancePoint,
} from "@/lib/calculations/loan-outstanding";
import {
  computeDebtToIncomeRatio,
  computeDebtTotals,
  computeOverdueAmount,
  computeRemainingTenureMonths,
  groupDebtByLender,
  groupDebtByType,
  type DebtGroupRow,
  type DebtTotals,
  type OverdueResult,
  type RemainingTenureResult,
} from "@/lib/calculations/debt-metrics";
import {
  buildMonthKeyWindow,
  buildTrailingMonthKeys,
  computeHouseholdDebtTrend,
  generateEmiCalendar,
  toMonthKeyFromDateString,
  type DebtTrendPoint,
  type EmiCalendarEntry,
} from "@/lib/calculations/debt-trend";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import { listLoans, type LoanPaymentRecord, type LoanRow } from "./queries";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** How many trailing months of income to average for the debt-to-income ratio — smooths out a single unusually high/low month. */
const DTI_INCOME_MONTHS = 3;
/** How far back/ahead the household debt trend and EMI calendar look. */
const TREND_MONTHS_BACK = 12;
const CALENDAR_MONTHS_BACK = 2;
const CALENDAR_MONTHS_AHEAD = 3;

/**
 * Every loan_payments row for a set of loans, in one query — same no-N+1
 * shape as src/features/loans/queries.ts's fetchPaymentsByLoan (kept as a
 * separate local copy here rather than imported, since this file needs
 * every payment across every loan regardless of pagination, while that one
 * is scoped to whatever page of loans is currently displayed).
 */
async function fetchAllPaymentsByLoan(
  supabase: SupabaseServerClient,
  householdId: string,
  loanIds: string[],
): Promise<Map<string, LoanPaymentRecord[]>> {
  if (loanIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("loan_payments")
      .select("*")
      .eq("household_id", householdId)
      .in("loan_id", loanIds)
      .order("payment_date", { ascending: true }),
  );

  const byLoan = new Map<string, LoanPaymentRecord[]>();
  for (const row of rows) {
    const list = byLoan.get(row.loan_id) ?? [];
    list.push(row);
    byLoan.set(row.loan_id, list);
  }
  return byLoan;
}

export type LoanWithAnalysis = LoanRow & {
  /** Non-reversed payments only, sorted by date ascending. */
  effectivePayments: LoanPaymentRecord[];
  balanceHistory: LoanBalancePoint[];
  overdue: OverdueResult;
  remainingTenure: RemainingTenureResult;
};

export type DebtDashboardData = {
  currencyCode: string;
  asOfDate: string;
  totals: DebtTotals;
  debtByType: DebtGroupRow[];
  debtByLender: DebtGroupRow[];
  /** Average of the trailing DTI_INCOME_MONTHS months' cleared income — null when there's no income to divide by. */
  debtToIncomeRatio: number | null;
  monthlyIncomeMinorUnits: number;
  householdTrend: DebtTrendPoint[];
  emiCalendar: EmiCalendarEntry[];
  loans: LoanWithAnalysis[];
};

/**
 * The single combined fetch behind the debt dashboard (PROMPT 22): every
 * loan plus every one of its payments, fetched once each (never one query
 * per loan), then run through the pure calculators in
 * src/lib/calculations/debt-metrics.ts and debt-trend.ts. `currencyCode`
 * scopes every total/grouping/trend — debt is never blended across
 * currencies, same rule as every other multi-entity total in this app.
 */
export async function getDebtDashboardData(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<DebtDashboardData> {
  const loansPage = await listLoans(
    supabase,
    householdId,
    {},
    { pageSize: MAX_PAGE_SIZE },
  );
  const loans = loansPage.rows;

  const paymentsByLoan = await fetchAllPaymentsByLoan(
    supabase,
    householdId,
    loans.map((loan) => loan.id),
  );

  const loansWithAnalysis: LoanWithAnalysis[] = loans.map((loan) => {
    const allPayments = paymentsByLoan.get(loan.id) ?? [];
    const effectivePayments = selectEffectivePayments(
      allPayments.map((payment) => ({
        id: payment.id,
        reversesPaymentId: payment.reverses_payment_id,
        principalComponentMinorUnits: payment.principal_component_minor_units,
        original: payment,
      })),
    )
      .map((payment) => payment.original)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

    const balanceHistory = computeLoanBalanceHistory(
      loan.disbursed_amount_minor_units,
      effectivePayments.map((payment) => ({
        paymentDate: payment.payment_date,
        principalComponentMinorUnits: payment.principal_component_minor_units,
        interestComponentMinorUnits: payment.interest_component_minor_units,
        feeComponentMinorUnits: payment.fee_component_minor_units,
        penaltyComponentMinorUnits: payment.penalty_component_minor_units,
      })),
    );

    const overdue = computeOverdueAmount(
      {
        status: loan.status,
        repaymentStartDate: loan.repayment_start_date,
        maturityDate: loan.maturity_date,
        emiAmountMinorUnits: loan.emi_amount_minor_units,
      },
      effectivePayments.map((payment) => ({
        paymentDate: payment.payment_date,
        totalPaymentMinorUnits: payment.total_payment_minor_units,
      })),
      asOfDate,
    );

    const remainingTenure = computeRemainingTenureMonths(
      loan.outstandingMinorUnits,
      loan.annual_interest_rate,
      loan.emi_amount_minor_units,
    );

    return {
      ...loan,
      effectivePayments,
      balanceHistory,
      overdue,
      remainingTenure,
    };
  });

  const inCurrency = loansWithAnalysis.filter(
    (loan) => loan.currency_code === currencyCode,
  );
  const totalsInput = inCurrency.map((loan) => {
    const latestBalancePoint =
      loan.balanceHistory[loan.balanceHistory.length - 1];
    return {
      currencyCode: loan.currency_code,
      status: loan.status,
      loanType: loan.loan_type,
      lenderName: loan.lenderName,
      originalPrincipalMinorUnits: loan.original_principal_minor_units,
      outstandingMinorUnits: loan.outstandingMinorUnits,
      emiAmountMinorUnits: loan.emi_amount_minor_units,
      interestPaidMinorUnits:
        latestBalancePoint?.cumulativeInterestPaidMinorUnits ?? 0,
      principalRepaidMinorUnits:
        latestBalancePoint?.cumulativePrincipalPaidMinorUnits ?? 0,
    };
  });

  const totals = computeDebtTotals(totalsInput, currencyCode);
  const debtByType = groupDebtByType(totalsInput, currencyCode);
  const debtByLender = groupDebtByLender(totalsInput, currencyCode);

  // Average of the trailing 3 months' cleared income smooths out a single
  // unusually high/low month — getIncomeTrend does not itself filter by
  // currency (it sums every kind='income' transaction regardless), so this
  // ratio is only meaningful when the household's income is predominantly
  // in currencyCode. Disclosed in the dashboard UI, not silently assumed.
  const incomeTrend = await getIncomeTrend(
    supabase,
    householdId,
    DTI_INCOME_MONTHS,
    asOfDate,
  );
  const monthlyIncomeMinorUnits =
    incomeTrend.reduce((sum, row) => sum + row.totalMinorUnits, 0) /
    Math.max(1, incomeTrend.length);
  const debtToIncomeRatio = computeDebtToIncomeRatio(
    totals.monthlyEmiBurdenMinorUnits,
    monthlyIncomeMinorUnits,
  );

  const householdTrend = computeHouseholdDebtTrend(
    inCurrency.map((loan) => ({
      disbursedAmountMinorUnits: loan.disbursed_amount_minor_units,
      disbursedDate: loan.disbursed_date,
      balanceHistory: loan.balanceHistory,
    })),
    buildTrailingMonthKeys(asOfDate, TREND_MONTHS_BACK),
  );

  const emiCalendar = generateEmiCalendar(
    inCurrency.map((loan) => ({
      id: loan.id,
      name: loan.name,
      status: loan.status,
      repaymentStartDate: loan.repayment_start_date,
      maturityDate: loan.maturity_date,
      emiAmountMinorUnits: loan.emi_amount_minor_units,
    })),
    new Map(
      inCurrency.map((loan) => [
        loan.id,
        loan.effectivePayments.map((payment) => ({
          paymentDate: payment.payment_date,
          totalPaymentMinorUnits: payment.total_payment_minor_units,
        })),
      ]),
    ),
    buildMonthKeyWindow(asOfDate, CALENDAR_MONTHS_BACK, CALENDAR_MONTHS_AHEAD),
    toMonthKeyFromDateString(asOfDate),
  );

  return {
    currencyCode,
    asOfDate,
    totals,
    debtByType,
    debtByLender,
    debtToIncomeRatio,
    monthlyIncomeMinorUnits,
    householdTrend,
    emiCalendar,
    loans: loansWithAnalysis,
  };
}
