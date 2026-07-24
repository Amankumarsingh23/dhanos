import { describe, expect, it } from "vitest";
import {
  computeFundingSourceAllocationTotals,
  computeGoalCurrentSavedAmount,
  computeGoalFunding,
  computeGoalFundingGapMinorUnits,
  computeGoalOnTrackStatus,
  fundingSourceKey,
  isFundingSourceOverAllocated,
} from "./goals";

describe("computeGoalCurrentSavedAmount", () => {
  it("sums the manual amount plus every source's allocated share", () => {
    const result = computeGoalCurrentSavedAmount(100_000, "INR", [
      {
        currentValueMinorUnits: 200_000,
        allocationPercentage: 50,
        currencyCode: "INR",
      },
      {
        currentValueMinorUnits: 300_000,
        allocationPercentage: 100,
        currencyCode: "INR",
      },
    ]);
    // 100,000 + (200,000 * 0.5) + (300,000 * 1.0) = 100,000 + 100,000 + 300,000
    expect(result.amountMinorUnits).toBe(500_000);
    expect(result.excludedCurrencyMismatchCount).toBe(0);
    expect(result.missingValueCount).toBe(0);
  });

  it("excludes a source in a different currency rather than blending it", () => {
    const result = computeGoalCurrentSavedAmount(0, "INR", [
      {
        currentValueMinorUnits: 500_000,
        allocationPercentage: 100,
        currencyCode: "USD",
      },
    ]);
    expect(result.amountMinorUnits).toBe(0);
    expect(result.excludedCurrencyMismatchCount).toBe(1);
  });

  it("counts a source with no current value yet as 0, not a guess", () => {
    const result = computeGoalCurrentSavedAmount(1_000, "INR", [
      {
        currentValueMinorUnits: null,
        allocationPercentage: 100,
        currencyCode: "INR",
      },
    ]);
    expect(result.amountMinorUnits).toBe(1_000);
    expect(result.missingValueCount).toBe(1);
  });
});

describe("computeGoalFundingGapMinorUnits", () => {
  it("is the shortfall when under target", () => {
    expect(computeGoalFundingGapMinorUnits(400_000, 1_000_000)).toBe(600_000);
  });

  it("floors at zero once at or above target", () => {
    expect(computeGoalFundingGapMinorUnits(1_200_000, 1_000_000)).toBe(0);
    expect(computeGoalFundingGapMinorUnits(1_000_000, 1_000_000)).toBe(0);
  });
});

describe("computeGoalOnTrackStatus", () => {
  it("is funded once current savings already meet the nominal target", () => {
    expect(
      computeGoalOnTrackStatus({
        currentSavedAmountMinorUnits: 1_000_000,
        nominalTargetAmountMinorUnits: 900_000,
        projectedCurrentAmountGrowthMinorUnits: 1_000_000,
        monthsRemaining: 12,
      }),
    ).toBe("funded");
  });

  it("is overdue once the target date has passed and it's still not funded", () => {
    expect(
      computeGoalOnTrackStatus({
        currentSavedAmountMinorUnits: 500_000,
        nominalTargetAmountMinorUnits: 900_000,
        projectedCurrentAmountGrowthMinorUnits: 500_000,
        monthsRemaining: 0,
      }),
    ).toBe("overdue");
  });

  it("is on_track when current savings alone project to reach the target", () => {
    expect(
      computeGoalOnTrackStatus({
        currentSavedAmountMinorUnits: 500_000,
        nominalTargetAmountMinorUnits: 900_000,
        projectedCurrentAmountGrowthMinorUnits: 950_000,
        monthsRemaining: 24,
      }),
    ).toBe("on_track");
  });

  it("needs_contribution when time remains but the current trajectory falls short", () => {
    expect(
      computeGoalOnTrackStatus({
        currentSavedAmountMinorUnits: 200_000,
        nominalTargetAmountMinorUnits: 900_000,
        projectedCurrentAmountGrowthMinorUnits: 250_000,
        monthsRemaining: 24,
      }),
    ).toBe("needs_contribution");
  });
});

describe("computeGoalFunding (reused from the standalone calculator)", () => {
  it("is re-exported and usable directly", () => {
    const result = computeGoalFunding({
      targetAmountMinorUnits: 1_000_000,
      targetDate: "2027-01-01",
      asOfDate: "2026-01-01",
      currentAmountMinorUnits: 0,
      annualExpectedReturn: 0.08,
      annualInflationRate: 0.06,
    });
    expect(result.monthsRemaining).toBe(12);
    expect(result.isAlreadyFunded).toBe(false);
  });
});

describe("computeFundingSourceAllocationTotals / isFundingSourceOverAllocated", () => {
  it("sums allocation percentages per source across multiple goals", () => {
    const totals = computeFundingSourceAllocationTotals([
      {
        sourceKey: fundingSourceKey("account", "acc-1"),
        allocationPercentage: 60,
      },
      {
        sourceKey: fundingSourceKey("account", "acc-1"),
        allocationPercentage: 70,
      },
      {
        sourceKey: fundingSourceKey("investment_holding", "hold-1"),
        allocationPercentage: 40,
      },
    ]);
    expect(totals.get(fundingSourceKey("account", "acc-1"))).toBe(130);
    expect(totals.get(fundingSourceKey("investment_holding", "hold-1"))).toBe(
      40,
    );
  });

  it("flags a source over-allocated only once its total exceeds 100%", () => {
    expect(isFundingSourceOverAllocated(100)).toBe(false);
    expect(isFundingSourceOverAllocated(100.01)).toBe(true);
    expect(isFundingSourceOverAllocated(130)).toBe(true);
  });
});
