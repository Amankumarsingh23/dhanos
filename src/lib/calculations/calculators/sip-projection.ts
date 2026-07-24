/**
 * SIP (systematic investment plan) projection calculator — PROMPT 20. This
 * is a standalone "what if" tool, deliberately separate from
 * src/lib/calculations/sip-commitment.ts (which normalizes an *actual*,
 * already-recorded investment_sips row's cadence for reporting): nothing
 * here reads or writes a real SIP, so a hypothetical scenario can never be
 * mistaken for a tracked commitment.
 *
 * ## Formula
 *
 * Each period's contribution grows the running value by the period's
 * compounded rate, then adds that period's own contribution (an ordinary,
 * end-of-period annuity, not annuity-due):
 *
 *   value_p = value_(p-1) * (1 + periodRate) + contribution_p
 *
 * `periodRate` is derived from the annual return via geometric conversion
 * (`(1 + annualReturnRate) ^ (1/periodsPerYear) - 1`), never a naive
 * `annualReturnRate / periodsPerYear` — the latter under-compounds for any
 * frequency faster than yearly.
 *
 * `contribution_p` grows once per elapsed year by `annualStepUpRate` (a
 * "step-up SIP"), computed directly from the year index (a closed-form
 * power), not by repeatedly multiplying the previous year's contribution,
 * so rounding at one year never drifts into the next.
 *
 * The real (inflation-adjusted) future value divides the nominal result by
 * `(1 + inflationRate) ^ durationYears` — see docs/money-calculation-rules.md
 * §4: "inflation assumptions must be visible," never buried.
 */

export type SipFrequency =
  "weekly" | "biweekly" | "monthly" | "quarterly" | "half_yearly" | "yearly";

export const SIP_PERIODS_PER_YEAR: Record<SipFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};

export type SipProjectionInput = {
  /** The base per-period contribution, before any step-up. */
  contributionMinorUnits: number;
  frequency: SipFrequency;
  /** Decimal, e.g. 0.12 for 12%/year — never a whole-number percentage. */
  annualReturnRate: number;
  durationYears: number;
  /** Decimal step-up applied once per elapsed year; 0 for a flat SIP. */
  annualStepUpRate: number;
  /** Decimal; used only for the real (inflation-adjusted) figure. */
  inflationRate: number;
};

export type SipProjectionPeriodPoint = {
  periodIndex: number;
  yearIndex: number;
  contributionMinorUnits: number;
  cumulativeContributedMinorUnits: number;
  /** Nominal running value — always a projection, never a guarantee. */
  cumulativeValueMinorUnits: number;
};

export type SipProjectionResult = {
  periods: SipProjectionPeriodPoint[];
  totalContributedMinorUnits: number;
  nominalFutureValueMinorUnits: number;
  realFutureValueMinorUnits: number;
  totalGrowthMinorUnits: number;
};

export function computeSipProjection(
  input: SipProjectionInput,
): SipProjectionResult {
  const periodsPerYear = SIP_PERIODS_PER_YEAR[input.frequency];
  const totalPeriods = Math.max(
    0,
    Math.round(input.durationYears * periodsPerYear),
  );
  const periodRate =
    Math.pow(1 + input.annualReturnRate, 1 / periodsPerYear) - 1;

  const periods: SipProjectionPeriodPoint[] = [];
  let value = 0;
  let cumulativeContributed = 0;

  for (let period = 1; period <= totalPeriods; period++) {
    const yearIndex = Math.floor((period - 1) / periodsPerYear);
    const contribution =
      input.contributionMinorUnits *
      Math.pow(1 + input.annualStepUpRate, yearIndex);
    value = value * (1 + periodRate) + contribution;
    cumulativeContributed += contribution;
    periods.push({
      periodIndex: period,
      yearIndex,
      contributionMinorUnits: Math.round(contribution),
      cumulativeContributedMinorUnits: Math.round(cumulativeContributed),
      cumulativeValueMinorUnits: Math.round(value),
    });
  }

  const totalContributedMinorUnits = Math.round(cumulativeContributed);
  const nominalFutureValueMinorUnits = Math.round(value);
  const realFutureValueMinorUnits = Math.round(
    value / Math.pow(1 + input.inflationRate, input.durationYears),
  );

  return {
    periods,
    totalContributedMinorUnits,
    nominalFutureValueMinorUnits,
    realFutureValueMinorUnits,
    totalGrowthMinorUnits:
      nominalFutureValueMinorUnits - totalContributedMinorUnits,
  };
}
