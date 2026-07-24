import { describe, expect, it } from "vitest";
import { computeSipProjection } from "./sip-projection";

describe("computeSipProjection", () => {
  it("matches the closed-form future value of an ordinary annuity for a flat monthly SIP", () => {
    // ₹10,000/month, 12%/year, 10 years, no step-up, no inflation.
    const result = computeSipProjection({
      contributionMinorUnits: 1_000_000,
      frequency: "monthly",
      annualReturnRate: 0.12,
      durationYears: 10,
      annualStepUpRate: 0,
      inflationRate: 0,
    });

    const monthlyRate = Math.pow(1.12, 1 / 12) - 1;
    const n = 120;
    const expectedFv =
      1_000_000 * ((Math.pow(1 + monthlyRate, n) - 1) / monthlyRate);

    expect(result.periods).toHaveLength(120);
    expect(result.totalContributedMinorUnits).toBe(120 * 1_000_000);
    expect(result.nominalFutureValueMinorUnits).toBeCloseTo(expectedFv, -2);
    expect(result.totalGrowthMinorUnits).toBe(
      result.nominalFutureValueMinorUnits - result.totalContributedMinorUnits,
    );
  });

  it("grows the contribution once per elapsed year under a step-up", () => {
    const result = computeSipProjection({
      contributionMinorUnits: 100_000,
      frequency: "monthly",
      annualReturnRate: 0,
      durationYears: 2,
      annualStepUpRate: 0.1,
      inflationRate: 0,
    });

    // First 12 periods at the base contribution, then a 10% bump.
    expect(result.periods[0]?.contributionMinorUnits).toBe(100_000);
    expect(result.periods[11]?.contributionMinorUnits).toBe(100_000);
    expect(result.periods[12]?.contributionMinorUnits).toBe(110_000);
    expect(result.periods[23]?.contributionMinorUnits).toBe(110_000);
  });

  it("discounts the nominal future value for inflation to produce the real value", () => {
    const result = computeSipProjection({
      contributionMinorUnits: 100_000,
      frequency: "yearly",
      annualReturnRate: 0,
      durationYears: 5,
      annualStepUpRate: 0,
      inflationRate: 0.05,
    });

    const expectedReal =
      result.nominalFutureValueMinorUnits / Math.pow(1.05, 5);
    expect(result.realFutureValueMinorUnits).toBeCloseTo(expectedReal, -1);
    expect(result.realFutureValueMinorUnits).toBeLessThan(
      result.nominalFutureValueMinorUnits,
    );
  });

  it("handles a zero duration by producing no periods and no value", () => {
    const result = computeSipProjection({
      contributionMinorUnits: 50_000,
      frequency: "monthly",
      annualReturnRate: 0.1,
      durationYears: 0,
      annualStepUpRate: 0,
      inflationRate: 0,
    });

    expect(result.periods).toHaveLength(0);
    expect(result.nominalFutureValueMinorUnits).toBe(0);
    expect(result.totalContributedMinorUnits).toBe(0);
  });

  it("handles a zero return rate as pure contribution accumulation", () => {
    const result = computeSipProjection({
      contributionMinorUnits: 10_000,
      frequency: "monthly",
      annualReturnRate: 0,
      durationYears: 1,
      annualStepUpRate: 0,
      inflationRate: 0,
    });

    expect(result.nominalFutureValueMinorUnits).toBe(120_000);
    expect(result.totalGrowthMinorUnits).toBe(0);
  });
});
