/**
 * Pure arithmetic behind the insurance module (PROMPT 25). No database
 * access, so every function here is fully unit-testable in isolation.
 *
 * Unlike loans/lending/liabilities, a policy has no "outstanding balance"
 * to derive — a premium payment doesn't pay down a principal, it's a
 * plain recurring expense. What this module computes instead:
 *
 *  - **Annualized premium commitment** — normalizes any premium_frequency
 *    into a yearly figure, the same "put every cadence on one axis" need
 *    `src/lib/calculations/sip-commitment.ts` solved for SIP contributions.
 *  - **Renewal timing** — purely advisory (`isRenewalDueSoon`/
 *    `isPolicyPastRenewalDate`), computed fresh from the stored
 *    renewal/expiry date, never overriding the household's own manually-set
 *    `status` column — this app never claims to know a policy's true legal
 *    state, only to flag "you told us this date, and it has passed" (see
 *    PROMPT 25: "do not represent entered policy data as a complete legal
 *    interpretation").
 */

import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";
import { toIsoDateString } from "@/lib/dates";

export type PremiumFrequency =
  "monthly" | "quarterly" | "half_yearly" | "yearly" | "one_time";

/** How many premium payments a household would make in one year at this cadence — 0 for one_time, since it never recurs. */
export function premiumOccurrencesPerYear(frequency: PremiumFrequency): number {
  switch (frequency) {
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "half_yearly":
      return 2;
    case "yearly":
      return 1;
    case "one_time":
      return 0;
  }
}

/** Normalizes one premium amount + cadence into an annualized figure, for a combined "total yearly premium commitment" view across every active policy. */
export function annualizePremiumMinorUnits(
  premiumAmountMinorUnits: number,
  frequency: PremiumFrequency,
): number {
  return premiumAmountMinorUnits * premiumOccurrencesPerYear(frequency);
}

export type PolicyRenewalSchedule = {
  /** The date a household should renew by — renewal_date if set, otherwise expiry_date, otherwise not trackable. */
  renewalOrExpiryDate: string | null;
};

/**
 * A policy is "due soon" when its renewal/expiry date falls within the
 * next `withinDays` (default 30) and hasn't already passed. Purely
 * advisory — never changes the policy's own `status`.
 */
export function isRenewalDueSoon(
  schedule: PolicyRenewalSchedule,
  asOfDate: string,
  withinDays = 30,
): boolean {
  if (schedule.renewalOrExpiryDate === null) {
    return false;
  }
  if (schedule.renewalOrExpiryDate < asOfDate) {
    return false;
  }
  const daysUntil = differenceInCalendarDays(
    parseISO(schedule.renewalOrExpiryDate),
    parseISO(asOfDate),
  );
  return daysUntil <= withinDays;
}

/** A policy's stated renewal/expiry date has already passed as of `asOfDate` — advisory only, never overrides the stored `status`. */
export function isPolicyPastRenewalDate(
  schedule: PolicyRenewalSchedule,
  asOfDate: string,
): boolean {
  if (schedule.renewalOrExpiryDate === null) {
    return false;
  }
  return schedule.renewalOrExpiryDate < asOfDate;
}

/**
 * A waiting period's milestone date — always computed from
 * `starts_from + duration_months`, never stored (PROMPT 26's
 * `insurance_policy_waiting_periods` keeps only the two inputs). Whole
 * months only, same reasoning `addMonths` gets used for everywhere else in
 * this codebase that models a cadence (see recurring-schedule.ts) rather
 * than an approximate day count.
 */
export function computeWaitingPeriodMilestoneDate(
  startsFrom: string,
  durationMonths: number,
): string {
  return toIsoDateString(addMonths(parseISO(startsFrom), durationMonths));
}

/** A waiting period whose milestone date has already passed as of `asOfDate` — the condition/treatment it gates is no longer excluded on that basis alone. */
export function isWaitingPeriodPassed(
  milestoneDate: string,
  asOfDate: string,
): boolean {
  return milestoneDate <= asOfDate;
}

/** A waiting period whose milestone falls within the next `withinDays` (default 90) and hasn't already passed — purely advisory, for surfacing "coming up" on the dashboard. */
export function isWaitingPeriodMilestoneUpcoming(
  milestoneDate: string,
  asOfDate: string,
  withinDays = 90,
): boolean {
  if (milestoneDate < asOfDate) {
    return false;
  }
  const daysUntil = differenceInCalendarDays(
    parseISO(milestoneDate),
    parseISO(asOfDate),
  );
  return daysUntil <= withinDays;
}
