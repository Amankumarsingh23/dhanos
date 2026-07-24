import { describe, expect, it } from "vitest";
import {
  computeFreeCashFlow,
  computeInvestmentRate,
  computeSavingsRate,
} from "./cash-flow-summary";

describe("computeFreeCashFlow", () => {
  it("subtracts expenses and debt payments from income", () => {
    expect(
      computeFreeCashFlow({
        incomeMinorUnits: 100000,
        expenseMinorUnits: 60000,
        investmentMinorUnits: 20000,
        debtPaymentMinorUnits: 10000,
      }),
    ).toBe(30000);
  });

  it("ignores the investment total entirely — investing is not a cash outflow subtracted here", () => {
    expect(
      computeFreeCashFlow({
        incomeMinorUnits: 100000,
        expenseMinorUnits: 60000,
        investmentMinorUnits: 999999,
        debtPaymentMinorUnits: 10000,
      }),
    ).toBe(30000);
  });

  it("can go negative when expenses and debt payments exceed income", () => {
    expect(
      computeFreeCashFlow({
        incomeMinorUnits: 50000,
        expenseMinorUnits: 60000,
        investmentMinorUnits: 0,
        debtPaymentMinorUnits: 10000,
      }),
    ).toBe(-20000);
  });
});

describe("computeSavingsRate", () => {
  it("returns free cash flow as a fraction of income", () => {
    expect(computeSavingsRate(30000, 100000)).toBe(0.3);
  });

  it("returns 0 rather than NaN/Infinity when income is 0", () => {
    expect(computeSavingsRate(0, 0)).toBe(0);
    expect(computeSavingsRate(-5000, 0)).toBe(0);
  });

  it("can be negative when free cash flow is negative", () => {
    expect(computeSavingsRate(-20000, 50000)).toBe(-0.4);
  });
});

describe("computeInvestmentRate", () => {
  it("returns investments as a fraction of income", () => {
    expect(computeInvestmentRate(20000, 100000)).toBe(0.2);
  });

  it("returns 0 rather than NaN/Infinity when income is 0", () => {
    expect(computeInvestmentRate(0, 0)).toBe(0);
    expect(computeInvestmentRate(5000, 0)).toBe(0);
  });
});
