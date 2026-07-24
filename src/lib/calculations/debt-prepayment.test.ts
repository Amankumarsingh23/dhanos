import { describe, expect, it } from "vitest";
import { computeEmi } from "./calculators/emi";
import {
  comparePrepaymentScenarios,
  computePrepaymentScenario,
} from "./debt-prepayment";

// A real 15-year, 9%/year, ₹20,00,000 loan's EMI — used as the "current EMI" throughout.
const emi = computeEmi({
  principalMinorUnits: 2_000_000,
  annualInterestRate: 0.09,
  tenureYears: 15,
  paymentFrequency: "monthly",
}).paymentMinorUnits;

describe("computePrepaymentScenario", () => {
  it("no_prepayment reproduces the loan's own remaining tenure", () => {
    const result = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "no_prepayment" },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Math.abs(result.tenureMonths - 180)).toBeLessThanOrEqual(2);
    }
  });

  it("one_time_prepayment shortens tenure and reduces interest", () => {
    const result = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      {
        kind: "one_time_prepayment",
        prepaymentMinorUnits: 500_000,
        afterPeriods: 12,
      },
    );
    const baseline = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "no_prepayment" },
    );
    expect(result.ok).toBe(true);
    expect(baseline.ok).toBe(true);
    if (result.ok && baseline.ok) {
      expect(result.tenureMonths).toBeLessThan(baseline.tenureMonths);
      expect(result.totalInterestMinorUnits).toBeLessThan(
        baseline.totalInterestMinorUnits,
      );
    }
  });

  it("increased_emi shortens tenure using the new EMI, not the original", () => {
    const result = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "increased_emi", newEmiMinorUnits: emi * 1.5 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenureMonths).toBeLessThan(180);
    }
  });

  it("regular_extra_payment is equivalent to increasing the EMI by the same amount", () => {
    const extra = Math.round(emi * 0.2);
    const viaExtra = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "regular_extra_payment", extraPerPeriodMinorUnits: extra },
    );
    const viaIncreasedEmi = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "increased_emi", newEmiMinorUnits: emi + extra },
    );
    expect(viaExtra).toEqual(viaIncreasedEmi);
  });

  it("computes a revised payoff date relative to asOfDate", () => {
    const result = computePrepaymentScenario(100_000, 0, 50_000, "2026-01-01", {
      kind: "no_prepayment",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Zero-interest ₹100,000 at ₹50,000/month pays off in exactly 2 months.
      expect(result.tenureMonths).toBe(2);
      expect(result.payoffDate).toBe("2026-03-01");
    }
  });

  it("rejects a non-positive outstanding balance or EMI", () => {
    expect(
      computePrepaymentScenario(0, 0.09, emi, "2026-01-01", {
        kind: "no_prepayment",
      }).ok,
    ).toBe(false);
    expect(
      computePrepaymentScenario(2_000_000, 0.09, 0, "2026-01-01", {
        kind: "no_prepayment",
      }).ok,
    ).toBe(false);
  });

  it("reports does_not_amortize when the effective payment can't cover interest", () => {
    const result = computePrepaymentScenario(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "increased_emi", newEmiMinorUnits: 1_000 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("does_not_amortize");
    }
  });
});

describe("comparePrepaymentScenarios", () => {
  it("computes interest saved and tenure reduced against the no-prepayment baseline", () => {
    const comparison = comparePrepaymentScenarios(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      {
        kind: "one_time_prepayment",
        prepaymentMinorUnits: 500_000,
        afterPeriods: 12,
      },
    );
    expect(comparison.baseline.ok).toBe(true);
    expect(comparison.scenario.ok).toBe(true);
    expect(comparison.interestSavedMinorUnits).toBeGreaterThan(0);
    expect(comparison.tenureReducedMonths).toBeGreaterThan(0);
  });

  it("returns null savings when either scenario fails to converge, never a fabricated number", () => {
    const comparison = comparePrepaymentScenarios(
      2_000_000,
      0.09,
      emi,
      "2026-01-01",
      { kind: "increased_emi", newEmiMinorUnits: 1_000 },
    );
    expect(comparison.scenario.ok).toBe(false);
    expect(comparison.interestSavedMinorUnits).toBeNull();
    expect(comparison.tenureReducedMonths).toBeNull();
  });
});
