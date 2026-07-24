/**
 * Pure arithmetic behind the SIP "total monthly commitment" / "daily
 * commitment" views (PROMPT 17). No database access. Schedule math itself
 * (next due date, missed/upcoming detection) is not duplicated here — a
 * SIP's cadence is the exact same shape recurring_rules already uses
 * (frequency/intervalCount/startDate/endDate), so
 * src/lib/calculations/recurring-schedule.ts's computeInitialNextDueDate/
 * computeNextOccurrenceAfter/isRecurringMissed/isRecurringUpcoming are
 * reused directly for SIPs, not reimplemented.
 *
 * What's genuinely new here is normalizing a contribution amount at *any*
 * cadence into an equivalent monthly or daily figure, so a ₹20/day SIP and
 * a ₹100/month SIP can be combined into one meaningful "total monthly
 * commitment" (PROMPT 17's example scenarios). This is necessarily an
 * approximation for any cadence other than the one being asked for
 * (converting a daily amount to "per month" has no single exact answer,
 * since months vary in length) — treated as a projection/estimate, not an
 * authoritative ledger figure (see docs/money-calculation-rules.md §4):
 * callers should label it as approximate. The one exception is a
 * cadence's *own* unit — a daily SIP's daily-equivalent figure, or a
 * monthly SIP's monthly-equivalent figure, is always its exact
 * contribution amount, never an approximation of itself.
 */

const DAYS_PER_YEAR = 365.25;
const MONTHS_PER_YEAR = 12;

const MONTHLY_CADENCE_STEP: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/**
 * How many times per year a SIP at this frequency/intervalCount
 * contributes — the shared basis both the monthly and daily equivalents
 * are derived from, so the two figures are always mutually consistent.
 */
export function occurrencesPerYear(
  frequency: string,
  intervalCount: number,
): number {
  switch (frequency) {
    case "daily":
    case "custom":
      return DAYS_PER_YEAR / intervalCount;
    case "weekly":
      return DAYS_PER_YEAR / 7 / intervalCount;
    case "biweekly":
      return DAYS_PER_YEAR / 14 / intervalCount;
    default: {
      const monthsStep = MONTHLY_CADENCE_STEP[frequency];
      if (monthsStep === undefined) {
        return 0;
      }
      return MONTHS_PER_YEAR / monthsStep / intervalCount;
    }
  }
}

/** The monthly-equivalent minor-unit amount for one SIP's contribution — exact for a monthly SIP, an estimate otherwise. Rounds to the nearest minor unit. */
export function computeMonthlyEquivalent(
  amountMinorUnits: number,
  frequency: string,
  intervalCount: number,
): number {
  return Math.round(
    (amountMinorUnits * occurrencesPerYear(frequency, intervalCount)) /
      MONTHS_PER_YEAR,
  );
}

/** The daily-equivalent minor-unit amount for one SIP's contribution — exact for a daily SIP, an estimate otherwise. Rounds to the nearest minor unit. */
export function computeDailyEquivalent(
  amountMinorUnits: number,
  frequency: string,
  intervalCount: number,
): number {
  return Math.round(
    (amountMinorUnits * occurrencesPerYear(frequency, intervalCount)) /
      DAYS_PER_YEAR,
  );
}
