/**
 * Pure aggregation and per-loan metrics behind the debt dashboard (PROMPT
 * 22). No database access — everything here takes already-fetched rows
 * (loans + their effective payments, see
 * src/lib/calculations/loan-outstanding.ts's selectEffectivePayments) so
 * every figure is independently unit-testable.
 *
 * Two acceptance criteria drive most of the shape here:
 *  - "Overdue status is based on actual payment records" — never a stored
 *    flag; computeOverdueAmount always sums real effective payments and
 *    compares them against a computed expectation.
 *  - "Missing interest details do not produce fake accuracy" — every
 *    function that needs an EMI or a rate to mean anything returns a
 *    typed `trackable: false` (with a reason) instead of a fabricated
 *    zero or a wrong number when that input is missing.
 */

import { differenceInCalendarMonths, parseISO } from "date-fns";
import { amortizeLoan } from "./amortization";

export type LoanForDebtTotals = {
  currencyCode: string;
  status: string;
  loanType: string;
  lenderName: string;
  originalPrincipalMinorUnits: number;
  outstandingMinorUnits: number;
  emiAmountMinorUnits: number | null;
  /** All-time cumulative interest paid on this loan (from its balance history's latest point), regardless of current status. */
  interestPaidMinorUnits: number;
  /** All-time cumulative principal repaid on this loan, regardless of current status. */
  principalRepaidMinorUnits: number;
};

export type DebtTotals = {
  currencyCode: string;
  /** Sum of outstanding across active loans in this currency — current burden, not history. */
  totalOutstandingMinorUnits: number;
  /** Sum of emi_amount_minor_units across active loans that have one set — current burden, not history. */
  monthlyEmiBurdenMinorUnits: number;
  activeLoanCount: number;
  /** Sum of original principal across every loan ever taken in this currency (any status) — a lifetime total, not scoped to what's still outstanding. */
  totalOriginalPrincipalMinorUnits: number;
  /** Lifetime interest paid across every loan in this currency (any status). */
  totalInterestPaidMinorUnits: number;
  /** Lifetime principal repaid across every loan in this currency (any status). */
  totalPrincipalRepaidMinorUnits: number;
};

/** Filters to `currencyCode` internally — debt is never blended across currencies, same convention as src/features/loans/queries.ts's getDebtSummary. */
export function computeDebtTotals(
  loans: readonly LoanForDebtTotals[],
  currencyCode: string,
): DebtTotals {
  const inCurrency = loans.filter((loan) => loan.currencyCode === currencyCode);
  const active = inCurrency.filter((loan) => loan.status === "active");

  return {
    currencyCode,
    totalOutstandingMinorUnits: active.reduce(
      (sum, loan) => sum + loan.outstandingMinorUnits,
      0,
    ),
    monthlyEmiBurdenMinorUnits: active.reduce(
      (sum, loan) => sum + (loan.emiAmountMinorUnits ?? 0),
      0,
    ),
    activeLoanCount: active.length,
    totalOriginalPrincipalMinorUnits: inCurrency.reduce(
      (sum, loan) => sum + loan.originalPrincipalMinorUnits,
      0,
    ),
    totalInterestPaidMinorUnits: inCurrency.reduce(
      (sum, loan) => sum + loan.interestPaidMinorUnits,
      0,
    ),
    totalPrincipalRepaidMinorUnits: inCurrency.reduce(
      (sum, loan) => sum + loan.principalRepaidMinorUnits,
      0,
    ),
  };
}

export type DebtGroupRow = {
  key: string;
  outstandingMinorUnits: number;
  loanCount: number;
};

function groupBy(
  loans: readonly LoanForDebtTotals[],
  currencyCode: string,
  keyOf: (loan: LoanForDebtTotals) => string,
): DebtGroupRow[] {
  const active = loans.filter(
    (loan) => loan.status === "active" && loan.currencyCode === currencyCode,
  );
  const rows = new Map<string, DebtGroupRow>();
  for (const loan of active) {
    const key = keyOf(loan);
    const existing = rows.get(key) ?? {
      key,
      outstandingMinorUnits: 0,
      loanCount: 0,
    };
    existing.outstandingMinorUnits += loan.outstandingMinorUnits;
    existing.loanCount += 1;
    rows.set(key, existing);
  }
  return [...rows.values()].sort(
    (a, b) => b.outstandingMinorUnits - a.outstandingMinorUnits,
  );
}

/** Outstanding debt grouped by loan_type, active loans in `currencyCode` only, highest first. */
export function groupDebtByType(
  loans: readonly LoanForDebtTotals[],
  currencyCode: string,
): DebtGroupRow[] {
  return groupBy(loans, currencyCode, (loan) => loan.loanType);
}

/** Outstanding debt grouped by lender (institution or person name), active loans in `currencyCode` only, highest first — PROMPT 22's "lender exposure." */
export function groupDebtByLender(
  loans: readonly LoanForDebtTotals[],
  currencyCode: string,
): DebtGroupRow[] {
  return groupBy(loans, currencyCode, (loan) => loan.lenderName);
}

/**
 * A debt-to-income ratio needs a real income figure to mean anything —
 * returns `null` (not 0) when there's no income to divide by, so the UI
 * can show "not available" instead of a misleadingly reassuring 0%.
 */
export function computeDebtToIncomeRatio(
  monthlyEmiBurdenMinorUnits: number,
  monthlyIncomeMinorUnits: number,
): number | null {
  if (monthlyIncomeMinorUnits <= 0) {
    return null;
  }
  return monthlyEmiBurdenMinorUnits / monthlyIncomeMinorUnits;
}

export type LoanForOverdue = {
  status: string;
  repaymentStartDate: string;
  maturityDate: string | null;
  emiAmountMinorUnits: number | null;
};

export type EffectivePaymentForOverdue = {
  paymentDate: string;
  totalPaymentMinorUnits: number;
};

export type OverdueReason = "not_active" | "emi_not_set" | "not_yet_due";

export type OverdueResult =
  | {
      trackable: true;
      expectedAmountMinorUnits: number;
      actualAmountMinorUnits: number;
      overdueAmountMinorUnits: number;
    }
  | { trackable: false; reason: OverdueReason };

/**
 * Expected-so-far EMIs (count of monthly due dates from repaymentStartDate
 * up to asOfDate, capped at maturityDate) times the EMI amount, compared
 * against the sum of *actual* effective payments recorded by asOfDate.
 * `actualAmountMinorUnits` is never a stored balance — it's summed fresh
 * from the payment records passed in, which is what makes overdue status
 * "based on actual payment records" rather than a flag someone could set
 * incorrectly.
 */
export function computeOverdueAmount(
  loan: LoanForOverdue,
  effectivePayments: readonly EffectivePaymentForOverdue[],
  asOfDate: string,
): OverdueResult {
  if (loan.status !== "active") {
    return { trackable: false, reason: "not_active" };
  }
  if (loan.emiAmountMinorUnits === null) {
    return { trackable: false, reason: "emi_not_set" };
  }
  if (loan.repaymentStartDate > asOfDate) {
    return { trackable: false, reason: "not_yet_due" };
  }

  const cappedAsOfDate =
    loan.maturityDate && loan.maturityDate < asOfDate
      ? loan.maturityDate
      : asOfDate;
  const expectedCount =
    differenceInCalendarMonths(
      parseISO(cappedAsOfDate),
      parseISO(loan.repaymentStartDate),
    ) + 1;
  const expectedAmountMinorUnits =
    Math.max(0, expectedCount) * loan.emiAmountMinorUnits;

  const actualAmountMinorUnits = effectivePayments
    .filter((payment) => payment.paymentDate <= asOfDate)
    .reduce((sum, payment) => sum + payment.totalPaymentMinorUnits, 0);

  return {
    trackable: true,
    expectedAmountMinorUnits,
    actualAmountMinorUnits,
    overdueAmountMinorUnits: Math.max(
      0,
      expectedAmountMinorUnits - actualAmountMinorUnits,
    ),
  };
}

export type RemainingTenureReason =
  "already_paid_off" | "emi_not_set" | "does_not_amortize";

export type RemainingTenureResult =
  | { trackable: true; tenureMonths: number }
  | { trackable: false; reason: RemainingTenureReason };

/**
 * How many more monthly EMIs at the loan's current rate/EMI would clear
 * the outstanding balance — reuses the same amortizeLoan engine as the
 * prepayment simulator (a "no prepayment" run), never a separate,
 * possibly-inconsistent formula.
 */
export function computeRemainingTenureMonths(
  outstandingMinorUnits: number,
  annualInterestRate: number,
  emiAmountMinorUnits: number | null,
): RemainingTenureResult {
  if (outstandingMinorUnits <= 0) {
    return { trackable: false, reason: "already_paid_off" };
  }
  if (emiAmountMinorUnits === null || emiAmountMinorUnits <= 0) {
    return { trackable: false, reason: "emi_not_set" };
  }

  const monthlyRate = annualInterestRate / 12;
  if (emiAmountMinorUnits <= outstandingMinorUnits * monthlyRate) {
    return { trackable: false, reason: "does_not_amortize" };
  }

  const run = amortizeLoan(
    outstandingMinorUnits,
    monthlyRate,
    emiAmountMinorUnits,
  );
  if (!run) {
    return { trackable: false, reason: "does_not_amortize" };
  }

  return { trackable: true, tenureMonths: run.schedule.length };
}
