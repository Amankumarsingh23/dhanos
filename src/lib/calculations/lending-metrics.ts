/**
 * Pure aggregation and per-lending metrics behind the lending dashboard
 * views (PROMPT 23: total lent, total outstanding, overdue, upcoming,
 * borrower exposure, recovery history). No database access — everything
 * here takes already-fetched rows (lendings + their effective repayments,
 * see src/lib/calculations/lending-outstanding.ts) so every figure is
 * independently unit-testable. Mirrors src/lib/calculations/debt-metrics.ts's
 * shape, from the lender's side.
 *
 * **A written-off lending is never excluded from totals silently** — it is
 * simply not counted toward "current outstanding" (the same way a repaid
 * loan isn't "active debt" anymore), but its own record and outstanding
 * figure remain fully visible wherever a single lending is shown (PROMPT 23
 * acceptance criterion "written-off amount remains historically visible").
 */

import { differenceInCalendarDays, parseISO } from "date-fns";

/** Exported so other modules (e.g. reminders' lending-repayment generator) share this one definition of "still owed" rather than each keeping their own copy. */
export const CURRENTLY_OWED_STATUSES = [
  "active",
  "partially_repaid",
  "delayed",
  "disputed",
] as const;

export type LendingForTotals = {
  currencyCode: string;
  status: string;
  borrowerKey: string;
  amountLentMinorUnits: number;
  outstandingMinorUnits: number;
  principalRecoveredMinorUnits: number;
  interestReceivedMinorUnits: number;
};

export type LendingTotals = {
  currencyCode: string;
  /** Lifetime total ever lent, every status, in this currency. */
  totalLentMinorUnits: number;
  /** Sum of outstanding across lendings still currently owed (active/partially_repaid/delayed/disputed) — current exposure, not history. */
  totalOutstandingMinorUnits: number;
  /** Lifetime principal recovered across every lending in this currency (any status). */
  totalPrincipalRecoveredMinorUnits: number;
  /** Lifetime interest received across every lending in this currency (any status) — tracked separately from principal, never folded into it. */
  totalInterestReceivedMinorUnits: number;
  /** Sum of outstanding across lendings marked written_off — a loss figure, kept separate from totalOutstandingMinorUnits, never deleted or hidden. */
  totalWrittenOffMinorUnits: number;
  currentlyOwedCount: number;
};

/** Filters to `currencyCode` internally — lending is never blended across currencies, same convention as debt-metrics.ts's computeDebtTotals. */
export function computeLendingTotals(
  lendings: readonly LendingForTotals[],
  currencyCode: string,
): LendingTotals {
  const inCurrency = lendings.filter(
    (lending) => lending.currencyCode === currencyCode,
  );
  const currentlyOwed = inCurrency.filter((lending) =>
    (CURRENTLY_OWED_STATUSES as readonly string[]).includes(lending.status),
  );
  const writtenOff = inCurrency.filter(
    (lending) => lending.status === "written_off",
  );

  return {
    currencyCode,
    totalLentMinorUnits: inCurrency.reduce(
      (sum, lending) => sum + lending.amountLentMinorUnits,
      0,
    ),
    totalOutstandingMinorUnits: currentlyOwed.reduce(
      (sum, lending) => sum + lending.outstandingMinorUnits,
      0,
    ),
    totalPrincipalRecoveredMinorUnits: inCurrency.reduce(
      (sum, lending) => sum + lending.principalRecoveredMinorUnits,
      0,
    ),
    totalInterestReceivedMinorUnits: inCurrency.reduce(
      (sum, lending) => sum + lending.interestReceivedMinorUnits,
      0,
    ),
    totalWrittenOffMinorUnits: writtenOff.reduce(
      (sum, lending) => sum + lending.outstandingMinorUnits,
      0,
    ),
    currentlyOwedCount: currentlyOwed.length,
  };
}

export type BorrowerExposureRow = {
  key: string;
  outstandingMinorUnits: number;
  lendingCount: number;
};

/** Outstanding receivables grouped by borrower (person or company name), currently-owed lendings in `currencyCode` only, highest first — PROMPT 23's "borrower exposure." */
export function groupLendingByBorrower(
  lendings: readonly LendingForTotals[],
  currencyCode: string,
): BorrowerExposureRow[] {
  const currentlyOwed = lendings.filter(
    (lending) =>
      lending.currencyCode === currencyCode &&
      (CURRENTLY_OWED_STATUSES as readonly string[]).includes(lending.status),
  );
  const rows = new Map<string, BorrowerExposureRow>();
  for (const lending of currentlyOwed) {
    const existing = rows.get(lending.borrowerKey) ?? {
      key: lending.borrowerKey,
      outstandingMinorUnits: 0,
      lendingCount: 0,
    };
    existing.outstandingMinorUnits += lending.outstandingMinorUnits;
    existing.lendingCount += 1;
    rows.set(lending.borrowerKey, existing);
  }
  return [...rows.values()].sort(
    (a, b) => b.outstandingMinorUnits - a.outstandingMinorUnits,
  );
}

export type LendingOverdueReason =
  "not_currently_owed" | "no_expected_date" | "not_yet_due";

export type LendingOverdueResult =
  | { trackable: true; daysOverdue: number; outstandingMinorUnits: number }
  | { trackable: false; reason: LendingOverdueReason };

export type LendingForSchedule = {
  status: string;
  expectedRepaymentDate: string | null;
};

/**
 * A lending is "overdue" only when it's still owed, has a stated expected
 * repayment date, that date has passed, and there's still something
 * outstanding — never a stored flag, always recomputed from the real
 * expected date and the real (derived) outstanding figure, same
 * "computed, never stored" rule as PROMPT 22's computeOverdueAmount.
 */
export function computeLendingOverdue(
  lending: LendingForSchedule,
  outstandingMinorUnits: number,
  asOfDate: string,
): LendingOverdueResult {
  if (
    !(CURRENTLY_OWED_STATUSES as readonly string[]).includes(lending.status)
  ) {
    return { trackable: false, reason: "not_currently_owed" };
  }
  if (lending.expectedRepaymentDate === null) {
    return { trackable: false, reason: "no_expected_date" };
  }
  if (outstandingMinorUnits <= 0 || lending.expectedRepaymentDate >= asOfDate) {
    return { trackable: false, reason: "not_yet_due" };
  }

  const daysOverdue = differenceInCalendarDays(
    parseISO(asOfDate),
    parseISO(lending.expectedRepaymentDate),
  );
  return { trackable: true, daysOverdue, outstandingMinorUnits };
}

/**
 * A lending is "upcoming" when its expected repayment date falls within
 * the next `withinDays` (default 30) and it isn't already overdue or fully
 * recovered.
 */
export function isLendingUpcoming(
  lending: LendingForSchedule,
  outstandingMinorUnits: number,
  asOfDate: string,
  withinDays = 30,
): boolean {
  if (
    !(CURRENTLY_OWED_STATUSES as readonly string[]).includes(lending.status)
  ) {
    return false;
  }
  if (lending.expectedRepaymentDate === null || outstandingMinorUnits <= 0) {
    return false;
  }
  if (lending.expectedRepaymentDate < asOfDate) {
    return false;
  }
  const daysUntil = differenceInCalendarDays(
    parseISO(lending.expectedRepaymentDate),
    parseISO(asOfDate),
  );
  return daysUntil <= withinDays;
}
