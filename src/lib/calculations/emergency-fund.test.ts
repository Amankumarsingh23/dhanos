import { describe, expect, it } from "vitest";
import {
  classifyAccountLiquidity,
  computeEmergencyFundResult,
  defaultIncludesForLiquidity,
  isAccountTypeEligible,
  suggestCoverageTargetMonths,
} from "./emergency-fund";

describe("classifyAccountLiquidity", () => {
  it("classifies everyday spending accounts as liquid", () => {
    expect(classifyAccountLiquidity("savings")).toBe("liquid");
    expect(classifyAccountLiquidity("current")).toBe("liquid");
    expect(classifyAccountLiquidity("cash")).toBe("liquid");
    expect(classifyAccountLiquidity("wallet")).toBe("liquid");
  });

  it("classifies retirement accounts as illiquid — locked money by default", () => {
    expect(classifyAccountLiquidity("provident_fund")).toBe("illiquid");
    expect(classifyAccountLiquidity("pension")).toBe("illiquid");
  });

  it("classifies a fixed deposit as illiquid", () => {
    expect(classifyAccountLiquidity("fixed_deposit")).toBe("illiquid");
  });

  it("defaults an unrecognized account type to semi_liquid, never a guess at either extreme", () => {
    expect(classifyAccountLiquidity("other")).toBe("semi_liquid");
    expect(classifyAccountLiquidity("something_unknown")).toBe("semi_liquid");
  });
});

describe("defaultIncludesForLiquidity", () => {
  it("only a liquid classification defaults to included", () => {
    expect(defaultIncludesForLiquidity("liquid")).toBe(true);
    expect(defaultIncludesForLiquidity("semi_liquid")).toBe(false);
    expect(defaultIncludesForLiquidity("illiquid")).toBe(false);
  });
});

describe("isAccountTypeEligible", () => {
  it("excludes loan and credit accounts entirely — unavailable credit limits are never counted", () => {
    expect(isAccountTypeEligible("loan")).toBe(false);
    expect(isAccountTypeEligible("credit")).toBe(false);
  });

  it("allows every other account type as a candidate (subject to its own default classification)", () => {
    expect(isAccountTypeEligible("savings")).toBe(true);
    expect(isAccountTypeEligible("provident_fund")).toBe(true);
  });
});

describe("computeEmergencyFundResult", () => {
  it("computes the full coverage picture for an underfunded household", () => {
    const result = computeEmergencyFundResult({
      averageEssentialMonthlyExpensesMinorUnits: 40_000_00,
      monthlyEmiMinorUnits: 15_000_00,
      monthlyInsuranceCommitmentsMinorUnits: 5_000_00,
      coverageTargetMonths: 6,
      liquidEmergencyMoneyMinorUnits: 150_000_00,
    });

    expect(result.monthlyBurnRateMinorUnits).toBe(60_000_00);
    expect(result.targetAmountMinorUnits).toBe(360_000_00);
    expect(result.shortfallMinorUnits).toBe(210_000_00);
    expect(result.monthsOfCoverage).toBeCloseTo(2.5, 5);
    expect(result.progressPercentage).toBeCloseTo(41.6666, 3);
    // shortfall / 12-month default horizon
    expect(result.suggestedMonthlyContributionMinorUnits).toBe(17_500_00);
  });

  it("reports zero shortfall and a suggested contribution of zero once fully funded", () => {
    const result = computeEmergencyFundResult({
      averageEssentialMonthlyExpensesMinorUnits: 30_000_00,
      monthlyEmiMinorUnits: 0,
      monthlyInsuranceCommitmentsMinorUnits: 0,
      coverageTargetMonths: 6,
      liquidEmergencyMoneyMinorUnits: 500_000_00,
    });

    expect(result.shortfallMinorUnits).toBe(0);
    expect(result.suggestedMonthlyContributionMinorUnits).toBe(0);
    // Overfunded — progress can exceed 100%, never capped.
    expect(result.progressPercentage).toBeGreaterThan(100);
  });

  it("never fabricates months-of-coverage or progress when the burn rate/target is zero", () => {
    const result = computeEmergencyFundResult({
      averageEssentialMonthlyExpensesMinorUnits: 0,
      monthlyEmiMinorUnits: 0,
      monthlyInsuranceCommitmentsMinorUnits: 0,
      coverageTargetMonths: 6,
      liquidEmergencyMoneyMinorUnits: 100_000_00,
    });

    expect(result.monthsOfCoverage).toBeNull();
    expect(result.progressPercentage).toBeNull();
    expect(result.targetAmountMinorUnits).toBe(0);
  });

  it("respects a custom build horizon for the suggested contribution", () => {
    const result = computeEmergencyFundResult(
      {
        averageEssentialMonthlyExpensesMinorUnits: 50_000_00,
        monthlyEmiMinorUnits: 0,
        monthlyInsuranceCommitmentsMinorUnits: 0,
        coverageTargetMonths: 6,
        liquidEmergencyMoneyMinorUnits: 0,
      },
      6,
    );

    // target = 300,000; shortfall = 300,000; / 6 months
    expect(result.suggestedMonthlyContributionMinorUnits).toBe(50_000_00);
  });
});

describe("suggestCoverageTargetMonths", () => {
  it("suggests a 3-month baseline with no dependants", () => {
    expect(suggestCoverageTargetMonths(0)).toBe(3);
  });

  it("adds one month per dependant", () => {
    expect(suggestCoverageTargetMonths(2)).toBe(5);
  });

  it("caps the suggestion at 12 months regardless of dependants", () => {
    expect(suggestCoverageTargetMonths(20)).toBe(12);
  });

  it("never suggests less than the baseline for a negative input", () => {
    expect(suggestCoverageTargetMonths(-5)).toBe(3);
  });
});
