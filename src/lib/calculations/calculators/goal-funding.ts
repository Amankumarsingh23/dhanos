import { differenceInCalendarMonths, parseISO } from "date-fns";

/**
 * Goal-funding calculator — PROMPT 20: "target amount, target date, current
 * amount, expected return, inflation." `targetAmountMinorUnits` is treated
 * as a **today's-purchasing-power** figure (what the goal would cost right
 * now) — it is inflated forward to the target date to get the actual
 * nominal amount that must be on hand then, so the `inflationRate` input
 * has a real effect rather than sitting unused (docs/money-calculation-rules.md
 * §4: every assumption shown must actually be doing something, not
 * decorative). Both figures — the real (today's-terms) target and the
 * nominal (inflated) one — are returned so the caller can show both, per
 * the shared "show nominal and inflation-adjusted values" rule.
 *
 * The required monthly contribution solves the standard future-value
 * equation for a lump sum plus an ordinary annuity:
 *
 *   nominalTarget = currentAmount * (1+r)^n + contribution * ((1+r)^n - 1) / r
 *
 * for `contribution`, where `r` is the monthly-equivalent expected return
 * and `n` is the number of whole months remaining. If the current amount
 * alone is already projected to clear the nominal target, the required
 * contribution is 0 (`isAlreadyFunded: true`) rather than a negative
 * number implying a withdrawal.
 */

export type GoalFundingInput = {
  /** In today's purchasing power. */
  targetAmountMinorUnits: number;
  targetDate: string;
  asOfDate: string;
  currentAmountMinorUnits: number;
  /** Decimal, e.g. 0.1 for 10%/year. */
  annualExpectedReturn: number;
  /** Decimal, e.g. 0.06 for 6%/year. */
  annualInflationRate: number;
};

export type GoalFundingResult = {
  monthsRemaining: number;
  realTargetAmountMinorUnits: number;
  nominalTargetAmountMinorUnits: number;
  /** What the current amount alone grows to by the target date, at the expected return. */
  projectedCurrentAmountGrowthMinorUnits: number;
  requiredMonthlyContributionMinorUnits: number;
  isAlreadyFunded: boolean;
};

export function computeGoalFunding(input: GoalFundingInput): GoalFundingResult {
  const monthsRemaining = Math.max(
    0,
    differenceInCalendarMonths(
      parseISO(input.targetDate),
      parseISO(input.asOfDate),
    ),
  );
  const yearsRemaining = monthsRemaining / 12;

  const nominalTargetAmountMinorUnits = Math.round(
    input.targetAmountMinorUnits *
      Math.pow(1 + input.annualInflationRate, yearsRemaining),
  );

  const monthlyRate = Math.pow(1 + input.annualExpectedReturn, 1 / 12) - 1;
  const projectedCurrentAmountGrowthMinorUnits = Math.round(
    input.currentAmountMinorUnits * Math.pow(1 + monthlyRate, monthsRemaining),
  );

  const shortfall =
    nominalTargetAmountMinorUnits - projectedCurrentAmountGrowthMinorUnits;

  let requiredMonthlyContributionMinorUnits = 0;
  if (shortfall > 0 && monthsRemaining > 0) {
    requiredMonthlyContributionMinorUnits =
      monthlyRate === 0
        ? shortfall / monthsRemaining
        : shortfall /
          ((Math.pow(1 + monthlyRate, monthsRemaining) - 1) / monthlyRate);
  }

  return {
    monthsRemaining,
    realTargetAmountMinorUnits: input.targetAmountMinorUnits,
    nominalTargetAmountMinorUnits,
    projectedCurrentAmountGrowthMinorUnits,
    requiredMonthlyContributionMinorUnits: Math.round(
      Math.max(0, requiredMonthlyContributionMinorUnits),
    ),
    isAlreadyFunded: shortfall <= 0,
  };
}
