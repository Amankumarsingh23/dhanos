import { describe, expect, it } from "vitest";
import { computeEmi } from "./emi";

describe("computeEmi", () => {
  it("matches the standard EMI formula for a monthly loan", () => {
    const result = computeEmi({
      principalMinorUnits: 10_000_000,
      annualInterestRate: 0.09,
      tenureYears: 20,
      paymentFrequency: "monthly",
    });

    const r = 0.09 / 12;
    const n = 240;
    const expectedEmi =
      (10_000_000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

    expect(result.totalPayments).toBe(240);
    expect(result.paymentMinorUnits).toBe(Math.round(expectedEmi));
    expect(result.schedule).toHaveLength(240);
  });

  it("closes the balance to exactly zero on the final scheduled payment", () => {
    const result = computeEmi({
      principalMinorUnits: 500_000,
      annualInterestRate: 0.1,
      tenureYears: 5,
      paymentFrequency: "monthly",
    });

    const lastRow = result.schedule[result.schedule.length - 1];
    expect(lastRow?.closingBalanceMinorUnits).toBe(0);
  });

  it("keeps principal and interest components summing back to the payment each period", () => {
    const result = computeEmi({
      principalMinorUnits: 300_000,
      annualInterestRate: 0.08,
      tenureYears: 3,
      paymentFrequency: "quarterly",
    });

    for (const row of result.schedule) {
      expect(
        row.principalComponentMinorUnits + row.interestComponentMinorUnits,
      ).toBe(row.paymentMinorUnits);
    }
  });

  it("degenerates to principal / n for a zero interest rate", () => {
    const result = computeEmi({
      principalMinorUnits: 120_000,
      annualInterestRate: 0,
      tenureYears: 1,
      paymentFrequency: "monthly",
    });

    expect(result.paymentMinorUnits).toBe(10_000);
    expect(result.totalInterestMinorUnits).toBe(0);
  });

  it("returns an empty result for a zero or negative principal/tenure", () => {
    expect(
      computeEmi({
        principalMinorUnits: 0,
        annualInterestRate: 0.1,
        tenureYears: 5,
        paymentFrequency: "monthly",
      }).schedule,
    ).toHaveLength(0);

    expect(
      computeEmi({
        principalMinorUnits: 100_000,
        annualInterestRate: 0.1,
        tenureYears: 0,
        paymentFrequency: "monthly",
      }).schedule,
    ).toHaveLength(0);
  });
});
