import { describe, expect, it } from "vitest";
import { computeLumpSumGrowth } from "./lump-sum";

describe("computeLumpSumGrowth", () => {
  it("matches the standard compound-interest formula for annual compounding", () => {
    const result = computeLumpSumGrowth({
      principalMinorUnits: 1_000_000,
      annualRate: 0.1,
      durationYears: 5,
      compoundingFrequency: "annually",
    });

    const expected = 1_000_000 * Math.pow(1.1, 5);
    expect(result.futureValueMinorUnits).toBe(Math.round(expected));
    expect(result.yearlyPoints).toHaveLength(5);
    expect(result.yearlyPoints[4]?.valueMinorUnits).toBe(
      result.futureValueMinorUnits,
    );
  });

  it("compounds more per year for a higher compounding frequency at the same nominal rate", () => {
    const annual = computeLumpSumGrowth({
      principalMinorUnits: 1_000_000,
      annualRate: 0.12,
      durationYears: 3,
      compoundingFrequency: "annually",
    });
    const monthly = computeLumpSumGrowth({
      principalMinorUnits: 1_000_000,
      annualRate: 0.12,
      durationYears: 3,
      compoundingFrequency: "monthly",
    });

    expect(monthly.futureValueMinorUnits).toBeGreaterThan(
      annual.futureValueMinorUnits,
    );
  });

  it("handles a zero rate as no growth at all", () => {
    const result = computeLumpSumGrowth({
      principalMinorUnits: 500_000,
      annualRate: 0,
      durationYears: 10,
      compoundingFrequency: "monthly",
    });

    expect(result.futureValueMinorUnits).toBe(500_000);
    expect(result.totalGrowthMinorUnits).toBe(0);
  });

  it("handles a zero duration by returning the principal unchanged", () => {
    const result = computeLumpSumGrowth({
      principalMinorUnits: 250_000,
      annualRate: 0.15,
      durationYears: 0,
      compoundingFrequency: "daily",
    });

    expect(result.futureValueMinorUnits).toBe(250_000);
    expect(result.yearlyPoints).toHaveLength(0);
  });
});
