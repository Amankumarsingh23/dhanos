/**
 * Pure arithmetic behind the money drains module (PROMPT 29). No database
 * access, so every function here is fully unit-testable in isolation.
 *
 * A drain's cost is entered at whatever cadence actually matches how it's
 * billed (`cost_frequency`), so "total monthly drain"/"total annual drain"
 * views need the same "normalize any cadence onto one axis" treatment
 * `sip-commitment.ts` and `insurance.ts`'s `annualizePremiumMinorUnits`
 * already established — `irregular` is the one cadence that genuinely
 * cannot be annualized (unlike `one_time`, which annualizes to a real,
 * meaningful 0 since it never recurs): `annualizeDrainCostMinorUnits`
 * returns `null` rather than inventing a number, and callers must keep an
 * irregular-cost item in its own bucket, never silently folded into an
 * annualized total (see computeDrainTotals below — this is what "analysis
 * is factual and explainable" (PROMPT 29 acceptance criterion) means in
 * practice: no total exists that can't be traced back to an explicit,
 * entered cadence).
 *
 * "Unused"/"high-cost low-use"/"upcoming renewal"/"maintenance burden" are
 * all descriptive predicates only — none of them ever changes a drain's
 * own `status`, matching PROMPT 29's "do not automatically order the user
 * to cancel anything."
 */

import { differenceInCalendarDays, parseISO } from "date-fns";
import type {
  DrainCostFrequency,
  DrainType,
  DrainUsageFrequency,
} from "@/lib/validation/money-drains";

const DRAIN_COST_OCCURRENCES_PER_YEAR: Record<
  Exclude<DrainCostFrequency, "irregular">,
  number
> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
  one_time: 0,
};

/** How many times per year this cadence bills — null for `irregular`, which has no fixed cadence to annualize. */
export function drainOccurrencesPerYear(
  frequency: DrainCostFrequency,
): number | null {
  if (frequency === "irregular") {
    return null;
  }
  return DRAIN_COST_OCCURRENCES_PER_YEAR[frequency];
}

/** Normalizes one drain's cost + cadence into an annualized figure — null (never a guess) for `irregular`; 0 for `one_time`, since it never recurs. */
export function annualizeDrainCostMinorUnits(
  costAmountMinorUnits: number,
  frequency: DrainCostFrequency,
): number | null {
  const occurrences = drainOccurrencesPerYear(frequency);
  if (occurrences === null) {
    return null;
  }
  return costAmountMinorUnits * occurrences;
}

/** The monthly-equivalent figure for one drain — null wherever the annualized figure is null. Rounds to the nearest minor unit. */
export function computeMonthlyEquivalentDrainCostMinorUnits(
  costAmountMinorUnits: number,
  frequency: DrainCostFrequency,
): number | null {
  const annualized = annualizeDrainCostMinorUnits(
    costAmountMinorUnits,
    frequency,
  );
  if (annualized === null) {
    return null;
  }
  return Math.round(annualized / 12);
}

const LOW_USE_FREQUENCIES: readonly DrainUsageFrequency[] = [
  "never",
  "rarely",
  "occasionally",
];

/** A drain the household has told us it barely uses — "occasionally" included, unlike the stricter isUnusedDrain below. */
export function isLowUseDrain(usageFrequency: DrainUsageFrequency): boolean {
  return LOW_USE_FREQUENCIES.includes(usageFrequency);
}

/** "Unused" specifically — never or rarely used, the strict PROMPT 29 "unused subscriptions" view. */
export function isUnusedDrain(usageFrequency: DrainUsageFrequency): boolean {
  return usageFrequency === "never" || usageFrequency === "rarely";
}

/** High-cost + low-use: a monthly-equivalent cost at or above `thresholdMinorUnits` on an item the household says it barely uses. Never true for an unannualizable (irregular) cost, since there's no comparable monthly figure to threshold against. */
export function isHighCostLowUse(
  monthlyEquivalentMinorUnits: number | null,
  usageFrequency: DrainUsageFrequency,
  thresholdMinorUnits: number,
): boolean {
  return (
    monthlyEquivalentMinorUnits !== null &&
    monthlyEquivalentMinorUnits >= thresholdMinorUnits &&
    isLowUseDrain(usageFrequency)
  );
}

/** A renewal date within the next `withinDays` (default 30) that hasn't already passed — purely advisory, mirroring insurance.ts's isRenewalDueSoon; never itself changes status. */
export function isRenewalUpcoming(
  nextRenewalDate: string | null,
  asOfDate: string,
  withinDays = 30,
): boolean {
  if (nextRenewalDate === null) {
    return false;
  }
  if (nextRenewalDate < asOfDate) {
    return false;
  }
  const daysUntil = differenceInCalendarDays(
    parseISO(nextRenewalDate),
    parseISO(asOfDate),
  );
  return daysUntil <= withinDays;
}

/** A renewal date that has already passed as of `asOfDate` — advisory only. */
export function isRenewalOverdue(
  nextRenewalDate: string | null,
  asOfDate: string,
): boolean {
  if (nextRenewalDate === null) {
    return false;
  }
  return nextRenewalDate < asOfDate;
}

const MAINTENANCE_HEAVY_TYPES: readonly DrainType[] = [
  "vehicle",
  "maintenance_heavy_asset",
];

/** Whether this drain type is one of the "maintenance burden" categories the analysis groups separately. */
export function isMaintenanceHeavyType(drainType: DrainType): boolean {
  return MAINTENANCE_HEAVY_TYPES.includes(drainType);
}

export type DrainTotalsInput = {
  drainType: DrainType;
  costFrequency: DrainCostFrequency;
  costAmountMinorUnits: number;
  isEssential: boolean;
};

export type DrainTotals = {
  /** Sum of every annualizable item's monthly-equivalent cost — excludes irregular-cadence items entirely, never estimates them in. */
  totalMonthlyMinorUnits: number;
  /** Sum of every annualizable item's annualized cost. */
  totalAnnualMinorUnits: number;
  /** How many active items have an irregular cadence and are therefore excluded from both totals above — a visible, explainable gap, never silently absorbed. */
  irregularCostCount: number;
  essentialMonthlyMinorUnits: number;
  discretionaryMonthlyMinorUnits: number;
  byTypeMonthlyMinorUnits: Record<DrainType, number>;
  maintenanceMonthlyMinorUnits: number;
};

/**
 * Aggregates a set of drains (already filtered to one currency and
 * whatever status the caller wants included — e.g. active only) into the
 * combined totals the overview page shows. Every figure here is a sum of
 * real entered costs at their real cadence; nothing is inferred or
 * projected beyond the per-item annualization above.
 */
export function computeDrainTotals(drains: DrainTotalsInput[]): DrainTotals {
  const byTypeMonthlyMinorUnits: Record<DrainType, number> = {
    subscription: 0,
    membership: 0,
    vehicle: 0,
    unused_service: 0,
    rented_space: 0,
    gadget: 0,
    maintenance_heavy_asset: 0,
    contractual_commitment: 0,
    recurring_fee: 0,
    other: 0,
  };

  let totalMonthlyMinorUnits = 0;
  let totalAnnualMinorUnits = 0;
  let irregularCostCount = 0;
  let essentialMonthlyMinorUnits = 0;
  let discretionaryMonthlyMinorUnits = 0;
  let maintenanceMonthlyMinorUnits = 0;

  for (const drain of drains) {
    const monthly = computeMonthlyEquivalentDrainCostMinorUnits(
      drain.costAmountMinorUnits,
      drain.costFrequency,
    );
    const annual = annualizeDrainCostMinorUnits(
      drain.costAmountMinorUnits,
      drain.costFrequency,
    );

    if (monthly === null || annual === null) {
      irregularCostCount += 1;
      continue;
    }

    totalMonthlyMinorUnits += monthly;
    totalAnnualMinorUnits += annual;
    byTypeMonthlyMinorUnits[drain.drainType] += monthly;

    if (drain.isEssential) {
      essentialMonthlyMinorUnits += monthly;
    } else {
      discretionaryMonthlyMinorUnits += monthly;
    }

    if (isMaintenanceHeavyType(drain.drainType)) {
      maintenanceMonthlyMinorUnits += monthly;
    }
  }

  return {
    totalMonthlyMinorUnits,
    totalAnnualMinorUnits,
    irregularCostCount,
    essentialMonthlyMinorUnits,
    discretionaryMonthlyMinorUnits,
    byTypeMonthlyMinorUnits,
    maintenanceMonthlyMinorUnits,
  };
}
