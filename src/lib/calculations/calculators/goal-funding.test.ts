import { describe, expect, it } from "vitest";
import { computeGoalFunding } from "./goal-funding";

describe("computeGoalFunding", () => {
  it("requires zero further contribution when the current amount already covers the nominal target", () => {
    const result = computeGoalFunding({
      targetAmountMinorUnits: 100_000,
      targetDate: "2030-01-01",
      asOfDate: "2026-01-01",
      currentAmountMinorUnits: 10_000_000,
      annualExpectedReturn: 0.1,
      annualInflationRate: 0.05,
    });

    expect(result.isAlreadyFunded).toBe(true);
    expect(result.requiredMonthlyContributionMinorUnits).toBe(0);
  });

  it("inflates the target amount forward to the target date rather than leaving it flat", () => {
    const result = computeGoalFunding({
      targetAmountMinorUnits: 1_000_000,
      targetDate: "2036-01-01",
      asOfDate: "2026-01-01",
      currentAmountMinorUnits: 0,
      annualExpectedReturn: 0.1,
      annualInflationRate: 0.06,
    });

    expect(result.nominalTargetAmountMinorUnits).toBeGreaterThan(
      result.realTargetAmountMinorUnits,
    );
    expect(result.realTargetAmountMinorUnits).toBe(1_000_000);
  });

  it("computes a positive required monthly contribution for a realistic underfunded goal", () => {
    const result = computeGoalFunding({
      targetAmountMinorUnits: 5_000_000,
      targetDate: "2031-01-01",
      asOfDate: "2026-01-01",
      currentAmountMinorUnits: 0,
      annualExpectedReturn: 0.12,
      annualInflationRate: 0.06,
    });

    expect(result.isAlreadyFunded).toBe(false);
    expect(result.requiredMonthlyContributionMinorUnits).toBeGreaterThan(0);
    expect(result.monthsRemaining).toBe(60);
  });

  it("handles a target date that has already passed with zero months remaining", () => {
    const result = computeGoalFunding({
      targetAmountMinorUnits: 1_000_000,
      targetDate: "2020-01-01",
      asOfDate: "2026-01-01",
      currentAmountMinorUnits: 0,
      annualExpectedReturn: 0.1,
      annualInflationRate: 0.05,
    });

    expect(result.monthsRemaining).toBe(0);
    expect(result.requiredMonthlyContributionMinorUnits).toBe(0);
    expect(result.isAlreadyFunded).toBe(false);
  });
});
