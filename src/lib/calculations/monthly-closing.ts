/**
 * Pure arithmetic behind the monthly financial closing workflow (PROMPT
 * 33). No database access, so every function here is fully unit-testable
 * in isolation.
 *
 * Deliberately thin: almost every figure a closing needs already has a
 * correct, tested source elsewhere in the app (cash-flow-summary.ts for
 * income/expense/investment/debt-payment/free-cash-flow, net-worth.ts for
 * the net-worth side) — this module only adds what's genuinely new for a
 * *closing record*: resolving a period's calendar date range, reconciling
 * the review checklist into a stored status, and deciding — factually,
 * never vaguely — whether a report should say its data is incomplete.
 */

import { endOfMonth, parseISO, startOfMonth } from "date-fns";
import { toIsoDateString } from "@/lib/dates";

/** "YYYY-MM" -> the first and last calendar day of that month, as plain date strings — the date range every closing figure (cash-flow summary, largest expenses, etc.) is computed over. */
export function computePeriodDateRange(period: string): {
  dateFrom: string;
  dateTo: string;
} {
  const anchor = parseISO(`${period}-01`);
  return {
    dateFrom: toIsoDateString(startOfMonth(anchor)),
    dateTo: toIsoDateString(endOfMonth(anchor)),
  };
}

export type ReconciliationStatus = "clean" | "has_unresolved_items";

/** 'clean' only once every review item has been marked reviewed — a single unresolved item is enough to mark the whole closing has_unresolved_items, never rounded away. */
export function computeReconciliationStatus(
  unresolvedItemsCount: number,
): ReconciliationStatus {
  return unresolvedItemsCount > 0 ? "has_unresolved_items" : "clean";
}

export type ClosingCompletenessInput = {
  unresolvedItemsCount: number;
  totalReviewItemsCount: number;
  /** The linked net-worth snapshot's own completeness_percentage (PROMPT 32) — a closing can be "reconciled" (every checklist item reviewed) while still resting on incomplete valuation data underneath, and both facts must be visible independently. */
  netWorthCompletenessPercentage: number;
};

export type ClosingCompleteness = {
  isComplete: boolean;
  /** Plain-language, specific reasons the report is incomplete — never a bare boolean with no explanation. Empty when isComplete is true. */
  reasons: string[];
};

/**
 * "Reports state when data is incomplete" (PROMPT 33 acceptance
 * criterion) — every reason here is traceable to a real, countable fact
 * (N of M review items unresolved; a net-worth completeness percentage
 * below 100), never an opaque "incomplete" flag with nothing behind it.
 */
export function computeClosingCompleteness(
  input: ClosingCompletenessInput,
): ClosingCompleteness {
  const reasons: string[] = [];

  if (input.unresolvedItemsCount > 0) {
    reasons.push(
      `${input.unresolvedItemsCount} of ${input.totalReviewItemsCount} review item(s) were not marked reviewed.`,
    );
  }
  if (input.netWorthCompletenessPercentage < 100) {
    reasons.push(
      `The linked net-worth snapshot is only ${input.netWorthCompletenessPercentage.toFixed(0)}% complete — some investments/assets had no valuation.`,
    );
  }

  return {
    isComplete: reasons.length === 0,
    reasons,
  };
}

export type ClosingChainRecord = {
  id: string;
  createdAt: string;
};

/** The current (most recent) closing in a period's correction chain — later corrections always have a later created_at, so this never needs to walk supersedes_closing_id links. */
export function resolveCurrentClosing<T extends ClosingChainRecord>(
  closings: readonly T[],
): T | null {
  if (closings.length === 0) {
    return null;
  }
  return closings.reduce((latest, closing) =>
    closing.createdAt > latest.createdAt ? closing : latest,
  );
}
