/**
 * Pure, dependency-free arithmetic backing the Expense feature's
 * deterministic analysis outputs (PROMPT 12: "category totals, essential
 * amount, discretionary amount, largest expenses, unplanned amount,
 * average daily spend, month-over-month comparison"). No database access,
 * no formatting — every function here takes already-fetched minor-unit
 * amounts and returns plain numbers, so the same inputs always produce the
 * same outputs and the logic is fully unit-testable in isolation from
 * Supabase.
 */

/** A category's spending-discipline tag — see transaction_categories.classification. */
export type CategoryClassification =
  "need" | "want" | "obligation" | "protection" | "investment" | null;

export type ExpenseBucket = "essential" | "discretionary" | "unclassified";

/**
 * Maps a category's classification to the essential/discretionary bucket
 * PROMPT 12 asks for. 'need', 'obligation', and 'protection' are all
 * non-discretionary necessities (rent, debt payments, insurance premiums);
 * 'want' is discretionary; a category with no classification set (or an
 * 'investment' classification, which shouldn't appear on an expense-kind
 * transaction but isn't excluded defensively) falls into 'unclassified'
 * rather than being silently dropped from either bucket.
 */
export function bucketClassification(
  classification: CategoryClassification,
): ExpenseBucket {
  if (
    classification === "need" ||
    classification === "obligation" ||
    classification === "protection"
  ) {
    return "essential";
  }
  if (classification === "want") {
    return "discretionary";
  }
  return "unclassified";
}

/**
 * The net cost of an expense after refunds — never negative, since a
 * refund can never legally exceed the expense it reverses (enforced in
 * recordRefundAction). Every expense total in this module is computed net
 * of refunds (PROMPT 12 acceptance criterion "Refunds reduce the
 * appropriate totals"), attributed back to the original expense's own
 * category/date/person rather than to whatever period the refund itself
 * landed in.
 */
export function netExpenseAmount(
  grossAmountMinorUnits: number,
  refundedAmountMinorUnits: number,
): number {
  return Math.max(0, grossAmountMinorUnits - refundedAmountMinorUnits);
}

/**
 * The number of whole days in an inclusive [dateFrom, dateTo] range — the
 * denominator for average daily spend. Never less than 1, so a same-day
 * range (or a caller passing dateTo < dateFrom by mistake) can't divide by
 * zero or invert the average.
 */
export function daysInRange(dateFrom: string, dateTo: string): number {
  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  const diffDays = Math.round(
    (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(1, diffDays + 1);
}

/** Average net spend per day over an inclusive date range — rounds down to a whole minor unit. */
export function computeAverageDailySpend(
  totalNetMinorUnits: number,
  dateFrom: string,
  dateTo: string,
): number {
  return Math.floor(totalNetMinorUnits / daysInRange(dateFrom, dateTo));
}

export type MonthOverMonthComparison = {
  currentMonthMinorUnits: number;
  previousMonthMinorUnits: number;
  changeMinorUnits: number;
  /** Signed ratio, e.g. 0.1 = 10% more than last month, -0.2 = 20% less. Null when the previous month had no spend (percentage change is undefined, not infinite or zero). */
  changeRatio: number | null;
};

/** Compares two months' net expense totals — deterministic, no hidden "vs last N months" averaging. */
export function computeMonthOverMonth(
  currentMonthMinorUnits: number,
  previousMonthMinorUnits: number,
): MonthOverMonthComparison {
  const changeMinorUnits = currentMonthMinorUnits - previousMonthMinorUnits;
  const changeRatio =
    previousMonthMinorUnits === 0
      ? null
      : changeMinorUnits / previousMonthMinorUnits;
  return {
    currentMonthMinorUnits,
    previousMonthMinorUnits,
    changeMinorUnits,
    changeRatio,
  };
}
