import { describe, expect, it } from "vitest";
import { computeEmi } from "./emi";
import { computeLoanPrepayment } from "./loan-prepayment";

describe("computeLoanPrepayment", () => {
  it("reproduces the original tenure when no prepayment is made", () => {
    // Derive a real EMI first so the loan actually amortizes cleanly.
    const emi = computeEmi({
      principalMinorUnits: 2_000_000,
      annualInterestRate: 0.09,
      tenureYears: 15,
      paymentFrequency: "monthly",
    });

    const result = computeLoanPrepayment({
      outstandingPrincipalMinorUnits: 2_000_000,
      annualInterestRate: 0.09,
      emiMinorUnits: emi.paymentMinorUnits,
      prepaymentMinorUnits: 0,
      prepaymentAfterPeriods: 0,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Re-deriving the tenure from a rounded EMI can land within a
      // month or two of the original 180, not necessarily exact.
      expect(Math.abs(result.originalTenureMonths - 180)).toBeLessThanOrEqual(
        2,
      );
      expect(result.newTenureMonths).toBe(result.originalTenureMonths);
      expect(result.interestSavedMinorUnits).toBe(0);
      expect(result.monthsSaved).toBe(0);
    }
  });

  it("shortens the tenure and reduces total interest when a prepayment is made", () => {
    const emi = computeEmi({
      principalMinorUnits: 2_000_000,
      annualInterestRate: 0.09,
      tenureYears: 15,
      paymentFrequency: "monthly",
    });

    const result = computeLoanPrepayment({
      outstandingPrincipalMinorUnits: 2_000_000,
      annualInterestRate: 0.09,
      emiMinorUnits: emi.paymentMinorUnits,
      prepaymentMinorUnits: 500_000,
      prepaymentAfterPeriods: 12,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newTenureMonths).toBeLessThan(result.originalTenureMonths);
      expect(result.interestSavedMinorUnits).toBeGreaterThan(0);
      expect(result.monthsSaved).toBeGreaterThan(0);
      expect(
        result.schedule[result.schedule.length - 1]?.closingBalanceMinorUnits,
      ).toBe(0);
    }
  });

  it("rejects an EMI that does not even cover a month's interest", () => {
    const result = computeLoanPrepayment({
      outstandingPrincipalMinorUnits: 1_000_000,
      annualInterestRate: 0.12,
      emiMinorUnits: 1_000, // far below even the interest-only payment
      prepaymentMinorUnits: 0,
      prepaymentAfterPeriods: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("does_not_amortize");
    }
  });

  it("rejects a non-positive principal or EMI", () => {
    const result = computeLoanPrepayment({
      outstandingPrincipalMinorUnits: 0,
      annualInterestRate: 0.09,
      emiMinorUnits: 10_000,
      prepaymentMinorUnits: 0,
      prepaymentAfterPeriods: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_input");
    }
  });
});
