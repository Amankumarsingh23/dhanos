/**
 * Lump-sum compound-growth calculator — PROMPT 20. Standard compound
 * interest: `FV = P * (1 + r/n) ^ (n * t)`, where `n` is the compounding
 * frequency's periods-per-year and `t` is the duration in years. `r/n` (the
 * periodic rate), never `r` itself, compounds — this is what distinguishes
 * "12%/year compounded monthly" from "12%/year compounded annually," and
 * why `compoundingFrequency` is a required input, not cosmetic.
 */

export type CompoundingFrequency =
  "annually" | "semi_annually" | "quarterly" | "monthly" | "daily";

export const COMPOUNDING_PERIODS_PER_YEAR: Record<
  CompoundingFrequency,
  number
> = {
  annually: 1,
  semi_annually: 2,
  quarterly: 4,
  monthly: 12,
  daily: 365,
};

export type LumpSumInput = {
  principalMinorUnits: number;
  /** Decimal, e.g. 0.08 for 8%/year. */
  annualRate: number;
  durationYears: number;
  compoundingFrequency: CompoundingFrequency;
};

export type LumpSumYearPoint = {
  /** 1-based — value at the end of this year. */
  yearIndex: number;
  valueMinorUnits: number;
};

export type LumpSumResult = {
  /** One point per whole elapsed year, for charting — the final point may fall short of the exact (possibly fractional) duration; see futureValueMinorUnits for the precise figure. */
  yearlyPoints: LumpSumYearPoint[];
  futureValueMinorUnits: number;
  totalGrowthMinorUnits: number;
};

export function computeLumpSumGrowth(input: LumpSumInput): LumpSumResult {
  const periodsPerYear =
    COMPOUNDING_PERIODS_PER_YEAR[input.compoundingFrequency];
  const periodRate = input.annualRate / periodsPerYear;

  const yearlyPoints: LumpSumYearPoint[] = [];
  const wholeYears = Math.max(0, Math.floor(input.durationYears));
  for (let year = 1; year <= wholeYears; year++) {
    const value =
      input.principalMinorUnits *
      Math.pow(1 + periodRate, periodsPerYear * year);
    yearlyPoints.push({ yearIndex: year, valueMinorUnits: Math.round(value) });
  }

  const totalPeriods = periodsPerYear * input.durationYears;
  const futureValueMinorUnits = Math.round(
    input.principalMinorUnits * Math.pow(1 + periodRate, totalPeriods),
  );

  return {
    yearlyPoints,
    futureValueMinorUnits,
    totalGrowthMinorUnits: futureValueMinorUnits - input.principalMinorUnits,
  };
}
