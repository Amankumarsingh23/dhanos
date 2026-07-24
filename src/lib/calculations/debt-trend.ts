/**
 * Household-wide debt time series and EMI calendar (PROMPT 22). Builds on
 * per-loan history already computed by
 * src/lib/calculations/loan-outstanding.ts's computeLoanBalanceHistory —
 * this module only merges multiple loans' histories onto a shared month
 * axis, the same "carry the last known value forward" pattern
 * src/features/staking/queries.ts's getDailyValueSeries uses for multiple
 * staking positions (there: daily; here: monthly, since loans are
 * monthly-cadence instruments).
 */

import type { LoanBalancePoint } from "./loan-outstanding";

/**
 * `YYYY-MM-DD` -> `YYYY-MM` by plain string slicing, never a Date
 * round-trip. Every date here (payment_date, disbursed_date,
 * repayment_start_date, maturity_date) is a plain calendar date with no
 * time-of-day component, per this app's own convention (see
 * src/lib/calculations/recurring-schedule.ts) — src/lib/dates' toMonthKey
 * is for turning a *Date instant* (e.g. "now") into a timezone-local month
 * key, and calling it on an already-plain date string round-trips through
 * `parseISO` (local-midnight) then reformats in a fixed timezone, which
 * silently shifts the date by a day in any positive-UTC-offset timezone
 * (including this app's own Asia/Kolkata default) — exactly the kind of
 * off-by-one-day bug PROMPT 14's schedule math was written to avoid.
 */
export function toMonthKeyFromDateString(dateString: string): string {
  return dateString.slice(0, 7);
}

/** Shifts a `YYYY-MM` key by `deltaMonths` (may be negative) using plain integer arithmetic — no Date object involved. */
function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yearPart, monthPart] = monthKey.split("-");
  const totalMonths =
    Number(yearPart) * 12 + (Number(monthPart) - 1) + deltaMonths;
  const year = Math.floor(totalMonths / 12);
  const month = (((totalMonths % 12) + 12) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export type LoanForDebtTrend = {
  disbursedAmountMinorUnits: number | null;
  disbursedDate: string | null;
  /** Effective (non-reversed) balance history, sorted by date ascending — see getLoanDetail. */
  balanceHistory: readonly LoanBalancePoint[];
};

export type DebtTrendPoint = {
  monthKey: string;
  outstandingMinorUnits: number;
  cumulativePrincipalPaidMinorUnits: number;
  cumulativeInterestPaidMinorUnits: number;
};

/** Builds `monthsBack` trailing month keys (oldest first) ending at the month containing asOfDate, inclusive. */
export function buildTrailingMonthKeys(
  asOfDate: string,
  monthsBack: number,
): string[] {
  return buildMonthKeyWindow(asOfDate, monthsBack - 1, 0);
}

/** Builds a month-key window (oldest first) spanning `monthsBack` months before and `monthsAhead` months after asOfDate's own month, inclusive of all three — the EMI calendar's "past/upcoming" window. */
export function buildMonthKeyWindow(
  asOfDate: string,
  monthsBack: number,
  monthsAhead: number,
): string[] {
  const asOfMonthKey = toMonthKeyFromDateString(asOfDate);
  const length = monthsBack + monthsAhead + 1;
  return Array.from({ length }, (_, index) =>
    shiftMonthKey(asOfMonthKey, index - monthsBack),
  );
}

/**
 * For each month in `monthKeys`, sums every loan's outstanding balance and
 * cumulative principal/interest paid as of that month-end — undisbursed
 * loans (or loans not yet disbursed by that month) contribute nothing;
 * disbursed loans with no payment yet that month carry their full
 * disbursed amount as outstanding, same "carry forward" convention as the
 * per-loan history itself. Feeds PROMPT 22's "outstanding balance curve,"
 * "principal versus interest," and "debt reduction" charts — all three
 * read this one series, just different fields.
 */
export function computeHouseholdDebtTrend(
  loans: readonly LoanForDebtTrend[],
  monthKeys: readonly string[],
): DebtTrendPoint[] {
  return monthKeys.map((monthKey) => {
    let outstandingMinorUnits = 0;
    let cumulativePrincipalPaidMinorUnits = 0;
    let cumulativeInterestPaidMinorUnits = 0;

    for (const loan of loans) {
      if (
        loan.disbursedAmountMinorUnits === null ||
        loan.disbursedDate === null
      ) {
        continue;
      }
      if (toMonthKeyFromDateString(loan.disbursedDate) > monthKey) {
        continue;
      }

      const pointsUpToMonth = loan.balanceHistory.filter(
        (point) => toMonthKeyFromDateString(point.date) <= monthKey,
      );
      const latest = pointsUpToMonth[pointsUpToMonth.length - 1];

      if (latest) {
        outstandingMinorUnits += latest.outstandingMinorUnits;
        cumulativePrincipalPaidMinorUnits +=
          latest.cumulativePrincipalPaidMinorUnits;
        cumulativeInterestPaidMinorUnits +=
          latest.cumulativeInterestPaidMinorUnits;
      } else {
        outstandingMinorUnits += loan.disbursedAmountMinorUnits;
      }
    }

    return {
      monthKey,
      outstandingMinorUnits,
      cumulativePrincipalPaidMinorUnits,
      cumulativeInterestPaidMinorUnits,
    };
  });
}

export type LoanForEmiCalendar = {
  id: string;
  name: string;
  status: string;
  repaymentStartDate: string;
  maturityDate: string | null;
  emiAmountMinorUnits: number | null;
};

export type EffectivePaymentForCalendar = {
  paymentDate: string;
  totalPaymentMinorUnits: number;
};

export type EmiCalendarStatus =
  "paid" | "partially_paid" | "upcoming" | "overdue" | "not_tracked";

export type EmiCalendarEntry = {
  monthKey: string;
  loanId: string;
  loanName: string;
  /** null when the loan has no EMI set — never a fabricated scheduled amount. */
  scheduledAmountMinorUnits: number | null;
  /** Always the sum of real effective payments for that loan in that month — distinct from scheduledAmountMinorUnits, never merged into one figure (PROMPT 22: "paid and scheduled values are distinct"). */
  actualAmountMinorUnits: number;
  status: EmiCalendarStatus;
};

/**
 * One row per (loan, month) within the window, for every loan whose
 * repayment has started (skips a loan still `pending_disbursement`, since
 * repaymentStartDate has no real meaning before disbursement). `status` is
 * always derived by comparing `actualAmountMinorUnits` (real payments)
 * against `scheduledAmountMinorUnits` (the EMI) — never a stored flag,
 * satisfying "overdue status is based on actual payment records" at the
 * calendar level too.
 */
export function generateEmiCalendar(
  loans: readonly LoanForEmiCalendar[],
  paymentsByLoan: ReadonlyMap<string, readonly EffectivePaymentForCalendar[]>,
  monthKeys: readonly string[],
  asOfMonthKey: string,
): EmiCalendarEntry[] {
  const entries: EmiCalendarEntry[] = [];

  for (const loan of loans) {
    if (loan.status === "pending_disbursement") {
      continue;
    }

    const payments = paymentsByLoan.get(loan.id) ?? [];
    const repaymentStartMonthKey = toMonthKeyFromDateString(
      loan.repaymentStartDate,
    );
    const maturityMonthKey = loan.maturityDate
      ? toMonthKeyFromDateString(loan.maturityDate)
      : null;

    for (const monthKey of monthKeys) {
      if (monthKey < repaymentStartMonthKey) {
        continue;
      }
      if (maturityMonthKey && monthKey > maturityMonthKey) {
        continue;
      }

      const actualAmountMinorUnits = payments
        .filter(
          (payment) =>
            toMonthKeyFromDateString(payment.paymentDate) === monthKey,
        )
        .reduce((sum, payment) => sum + payment.totalPaymentMinorUnits, 0);

      let status: EmiCalendarStatus;
      if (loan.emiAmountMinorUnits === null) {
        status = "not_tracked";
      } else if (actualAmountMinorUnits >= loan.emiAmountMinorUnits) {
        status = "paid";
      } else if (actualAmountMinorUnits > 0) {
        status = "partially_paid";
      } else if (monthKey > asOfMonthKey) {
        status = "upcoming";
      } else {
        status = "overdue";
      }

      entries.push({
        monthKey,
        loanId: loan.id,
        loanName: loan.name,
        scheduledAmountMinorUnits: loan.emiAmountMinorUnits,
        actualAmountMinorUnits,
        status,
      });
    }
  }

  return entries;
}
