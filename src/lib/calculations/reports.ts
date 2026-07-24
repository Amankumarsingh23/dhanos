import {
  enumerateOccurrencesInWindow,
  type ReminderWindow,
} from "./reminders";
import type { RecurringScheduleSource } from "./recurring-schedule";

/**
 * Pure aggregation for the reporting centre (PROMPT 36) that doesn't
 * already exist as an established metric elsewhere — every other report
 * reuses a calculator that already exists for its own feature (see
 * src/features/reports/queries.ts for the full map). "SIP consistency" is
 * the one genuinely new figure: there's no stored history of every past
 * SIP due date and whether it was met, only investment_sips' current
 * next_due_date/status pointer plus the investment_transactions rows any
 * actual contribution wrote — so "consistency" has to be computed by
 * re-deriving how many occurrences a SIP's own schedule implies within a
 * date range (reusing enumerateOccurrencesInWindow, the exact same
 * schedule-stepping primitive reminders.ts's sip_due/emi_due/etc.
 * generators already use) and comparing that to how many contributions
 * actually landed.
 */

export type SipScheduleSource = {
  id: string;
  name: string;
  currencyCode: string;
  schedule: RecurringScheduleSource;
};

export type SipContribution = { sipId: string };

export type SipConsistencyRow = {
  sipId: string;
  sipName: string;
  currencyCode: string;
  expectedCount: number;
  completedCount: number;
  /** completedCount / expectedCount × 100, capped at 100 — a household that contributes early/extra never reads as "over 100% consistent." Null when expectedCount is 0 (nothing was due in this window at all — not the same as 0%, which would mean something was due and missed). */
  consistencyPercentage: number | null;
};

export function computeSipConsistency(
  sips: readonly SipScheduleSource[],
  contributions: readonly SipContribution[],
  window: ReminderWindow,
): SipConsistencyRow[] {
  const completedBySip = new Map<string, number>();
  for (const contribution of contributions) {
    completedBySip.set(
      contribution.sipId,
      (completedBySip.get(contribution.sipId) ?? 0) + 1,
    );
  }

  return sips.map((sip) => {
    const expectedCount = enumerateOccurrencesInWindow(
      sip.schedule,
      window,
    ).length;
    const completedCount = completedBySip.get(sip.id) ?? 0;
    const consistencyPercentage =
      expectedCount === 0
        ? null
        : Math.min(100, Math.round((completedCount / expectedCount) * 100));

    return {
      sipId: sip.id,
      sipName: sip.name,
      currencyCode: sip.currencyCode,
      expectedCount,
      completedCount,
      consistencyPercentage,
    };
  });
}

/** Household-wide consistency across every SIP's own expected/completed counts, weighted by occurrence count (not a plain average of per-SIP percentages, which would let a SIP with one occurrence skew the total as much as one with twelve). Null when nothing was expected from any SIP in the window. */
export function computeOverallSipConsistency(
  rows: readonly SipConsistencyRow[],
): number | null {
  const totalExpected = rows.reduce((sum, row) => sum + row.expectedCount, 0);
  if (totalExpected === 0) {
    return null;
  }
  const totalCompleted = rows.reduce(
    (sum, row) => sum + Math.min(row.completedCount, row.expectedCount),
    0,
  );
  return Math.round((totalCompleted / totalExpected) * 100);
}
