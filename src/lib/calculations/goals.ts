/**
 * Pure arithmetic behind the financial goals module (PROMPT 30). No
 * database access, so every function here is fully unit-testable in
 * isolation. Deliberately builds on
 * src/lib/calculations/calculators/goal-funding.ts (PROMPT 20) for the
 * actual future-value/required-contribution math rather than re-deriving
 * it — this module only adds what a *persisted* goal needs on top of that
 * standalone calculator: combining multiple real funding sources into one
 * current-saved-amount figure, detecting when a source is over-allocated
 * across goals, and turning the calculator's raw numbers into a factual,
 * explainable on-track status.
 *
 * "Never assume investment returns are guaranteed" (PROMPT 30 acceptance
 * criterion): every figure derived from `annualExpectedReturn` here is a
 * projection, not a promise — callers must present it as such (see
 * GoalOnTrackStatus below, and the "on_track"/"funded" distinction, which
 * is always traceable back to the goal's own stated assumption rather than
 * an opaque verdict).
 */

import {
  computeGoalFunding,
  type GoalFundingInput,
  type GoalFundingResult,
} from "@/lib/calculations/calculators/goal-funding";

export type { GoalFundingInput, GoalFundingResult };
export { computeGoalFunding };

export type GoalFundingSourceContribution = {
  /** Null when the source has no valuation/balance figure yet — contributes 0, never a guessed amount. */
  currentValueMinorUnits: number | null;
  allocationPercentage: number;
  currencyCode: string;
};

export type GoalCurrentSavedAmount = {
  amountMinorUnits: number;
  /** Sources excluded from the total because their currency doesn't match the goal's — never blended across currencies (see docs/money-calculation-rules.md). */
  excludedCurrencyMismatchCount: number;
  /** Sources counted as contributing 0 because they have no current value yet. */
  missingValueCount: number;
};

/**
 * A goal's real current saved amount: the household's own manually-entered
 * (untracked) figure plus every linked funding source's current value,
 * each scaled by its own allocation_percentage — never assumed to be 100%
 * dedicated to this one goal. A source in a different currency than the
 * goal is excluded entirely (counted, never silently converted or
 * dropped without a trace) rather than combined via an invented rate.
 */
export function computeGoalCurrentSavedAmount(
  manualAmountMinorUnits: number,
  goalCurrencyCode: string,
  sources: readonly GoalFundingSourceContribution[],
): GoalCurrentSavedAmount {
  let amountMinorUnits = manualAmountMinorUnits;
  let excludedCurrencyMismatchCount = 0;
  let missingValueCount = 0;

  for (const source of sources) {
    if (source.currencyCode !== goalCurrencyCode) {
      excludedCurrencyMismatchCount += 1;
      continue;
    }
    if (source.currentValueMinorUnits === null) {
      missingValueCount += 1;
      continue;
    }
    amountMinorUnits += Math.round(
      (source.currentValueMinorUnits * source.allocationPercentage) / 100,
    );
  }

  return {
    amountMinorUnits,
    excludedCurrencyMismatchCount,
    missingValueCount,
  };
}

/** How much more (in nominal, inflation-adjusted terms) is needed beyond what's already saved — floored at 0, never negative. */
export function computeGoalFundingGapMinorUnits(
  currentSavedAmountMinorUnits: number,
  nominalTargetAmountMinorUnits: number,
): number {
  return Math.max(
    0,
    nominalTargetAmountMinorUnits - currentSavedAmountMinorUnits,
  );
}

export type GoalOnTrackStatus =
  "funded" | "on_track" | "needs_contribution" | "overdue";

/**
 * A factual, explainable classification — never a vague "good"/"bad"
 * verdict, each state is directly traceable to a real comparison:
 *
 *  - `funded`: the current saved amount alone already meets or exceeds the
 *    inflation-adjusted target, regardless of the target date.
 *  - `overdue`: the target date has already passed and the goal is still
 *    not funded.
 *  - `on_track`: time remains, and the current saved amount — left alone,
 *    growing only at the goal's own stated expected-return assumption,
 *    with no further contribution — projects to reach the target. This is
 *    a projection under an explicit, visible assumption, never a
 *    guarantee (PROMPT 30: "never assume investment returns are
 *    guaranteed").
 *  - `needs_contribution`: time remains but the current trajectory alone
 *    will not reach the target — the goal's own requiredMonthlyContribution
 *    figure is the actionable number, not a sign anything has gone wrong.
 */
export function computeGoalOnTrackStatus(params: {
  currentSavedAmountMinorUnits: number;
  nominalTargetAmountMinorUnits: number;
  projectedCurrentAmountGrowthMinorUnits: number;
  monthsRemaining: number;
}): GoalOnTrackStatus {
  if (
    params.currentSavedAmountMinorUnits >= params.nominalTargetAmountMinorUnits
  ) {
    return "funded";
  }
  if (params.monthsRemaining <= 0) {
    return "overdue";
  }
  if (
    params.projectedCurrentAmountGrowthMinorUnits >=
    params.nominalTargetAmountMinorUnits
  ) {
    return "on_track";
  }
  return "needs_contribution";
}

/** A stable key identifying one real funding source, regardless of which goal(s) link to it. */
export function fundingSourceKey(
  sourceType: "account" | "investment_holding",
  sourceId: string,
): string {
  return `${sourceType}:${sourceId}`;
}

export type FundingSourceAllocationEntry = {
  sourceKey: string;
  allocationPercentage: number;
};

/**
 * Sums allocation_percentage per real source across every goal that links
 * to it — the household-wide fact "how much of this account/holding's
 * value is currently promised to goals in total," regardless of which
 * single goal is being viewed. A source's own single-goal allocation can
 * be well within (0, 100] while still being over-allocated overall once
 * every goal linking to it is summed.
 */
export function computeFundingSourceAllocationTotals(
  entries: readonly FundingSourceAllocationEntry[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(
      entry.sourceKey,
      (totals.get(entry.sourceKey) ?? 0) + entry.allocationPercentage,
    );
  }
  return totals;
}

/**
 * A source is over-allocated once its total allocation across every goal
 * linking to it exceeds 100% — PROMPT 30: "the same investment allocation
 * cannot be accidentally counted fully toward several goals without
 * showing the overlap." This never blocks the link; it's a fact the UI
 * always surfaces wherever that source is shown.
 */
export function isFundingSourceOverAllocated(
  totalAllocationPercentage: number,
): boolean {
  return totalAllocationPercentage > 100;
}
