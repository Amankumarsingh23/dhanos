import { describe, expect, it } from "vitest";
import {
  computeFixedCommitmentsRatio,
  computeInvestmentContributionRate,
  computePlatformConcentration,
  type PlatformValue,
} from "./learning-insights";

describe("computeFixedCommitmentsRatio", () => {
  it("divides fixed commitments by monthly income", () => {
    expect(computeFixedCommitmentsRatio(20_000, 80_000)).toBeCloseTo(0.25);
  });

  it("returns null when there is no income to divide by", () => {
    expect(computeFixedCommitmentsRatio(20_000, 0)).toBeNull();
    expect(computeFixedCommitmentsRatio(20_000, -100)).toBeNull();
  });

  it("can exceed 1 when commitments outstrip income — never capped", () => {
    expect(computeFixedCommitmentsRatio(90_000, 60_000)).toBeCloseTo(1.5);
  });
});

describe("computeInvestmentContributionRate", () => {
  it("divides contributions by monthly income", () => {
    expect(computeInvestmentContributionRate(10_000, 50_000)).toBeCloseTo(0.2);
  });

  it("returns null (never a fabricated 0%) when income is 0", () => {
    expect(computeInvestmentContributionRate(10_000, 0)).toBeNull();
  });

  it("returns 0 when nothing was contributed but income exists", () => {
    expect(computeInvestmentContributionRate(0, 50_000)).toBe(0);
  });
});

describe("computePlatformConcentration", () => {
  it("returns null when there is nothing valued yet", () => {
    expect(computePlatformConcentration([])).toBeNull();
    const zeroed: PlatformValue[] = [
      { label: "Zerodha", valueMinorUnits: 0 },
      { label: "Groww", valueMinorUnits: 0 },
    ];
    expect(computePlatformConcentration(zeroed)).toBeNull();
  });

  it("identifies the largest platform and its share of the total", () => {
    const platforms: PlatformValue[] = [
      { label: "Zerodha", valueMinorUnits: 700_000 },
      { label: "Groww", valueMinorUnits: 300_000 },
    ];
    const result = computePlatformConcentration(platforms);
    expect(result).not.toBeNull();
    expect(result?.topPlatformLabel).toBe("Zerodha");
    expect(result?.totalValueMinorUnits).toBe(1_000_000);
    expect(result?.shareOfPortfolio).toBeCloseTo(0.7);
  });

  it("handles a single platform as 100% concentration", () => {
    const platforms: PlatformValue[] = [
      { label: "Zerodha", valueMinorUnits: 500_000 },
    ];
    const result = computePlatformConcentration(platforms);
    expect(result?.shareOfPortfolio).toBe(1);
  });
});
