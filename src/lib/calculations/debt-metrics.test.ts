import { describe, expect, it } from "vitest";
import {
  computeDebtToIncomeRatio,
  computeDebtTotals,
  computeOverdueAmount,
  computeRemainingTenureMonths,
  groupDebtByLender,
  groupDebtByType,
  type LoanForDebtTotals,
} from "./debt-metrics";

const activeHomeLoan: LoanForDebtTotals = {
  currencyCode: "INR",
  status: "active",
  loanType: "home",
  lenderName: "HDFC Bank",
  originalPrincipalMinorUnits: 5_000_000,
  outstandingMinorUnits: 4_000_000,
  emiAmountMinorUnits: 45_000,
  interestPaidMinorUnits: 300_000,
  principalRepaidMinorUnits: 1_000_000,
};

const activePersonalLoan: LoanForDebtTotals = {
  currencyCode: "INR",
  status: "active",
  loanType: "personal",
  lenderName: "ICICI Bank",
  originalPrincipalMinorUnits: 200_000,
  outstandingMinorUnits: 150_000,
  emiAmountMinorUnits: 10_000,
  interestPaidMinorUnits: 15_000,
  principalRepaidMinorUnits: 50_000,
};

const closedLoan: LoanForDebtTotals = {
  currencyCode: "INR",
  status: "closed",
  loanType: "vehicle",
  lenderName: "HDFC Bank",
  originalPrincipalMinorUnits: 300_000,
  outstandingMinorUnits: 0,
  emiAmountMinorUnits: 8_000,
  interestPaidMinorUnits: 20_000,
  principalRepaidMinorUnits: 300_000,
};

const usdLoan: LoanForDebtTotals = {
  currencyCode: "USD",
  status: "active",
  loanType: "personal",
  lenderName: "Chase",
  originalPrincipalMinorUnits: 10_000,
  outstandingMinorUnits: 8_000,
  emiAmountMinorUnits: 500,
  interestPaidMinorUnits: 200,
  principalRepaidMinorUnits: 2_000,
};

const allLoans = [activeHomeLoan, activePersonalLoan, closedLoan, usdLoan];

describe("computeDebtTotals", () => {
  it("scopes current-burden fields to active loans, but lifetime fields to every loan, in the requested currency", () => {
    const totals = computeDebtTotals(allLoans, "INR");
    expect(totals.totalOutstandingMinorUnits).toBe(4_000_000 + 150_000);
    expect(totals.monthlyEmiBurdenMinorUnits).toBe(45_000 + 10_000);
    expect(totals.activeLoanCount).toBe(2);
    // Lifetime fields include the closed loan too.
    expect(totals.totalOriginalPrincipalMinorUnits).toBe(
      5_000_000 + 200_000 + 300_000,
    );
    expect(totals.totalInterestPaidMinorUnits).toBe(300_000 + 15_000 + 20_000);
    expect(totals.totalPrincipalRepaidMinorUnits).toBe(
      1_000_000 + 50_000 + 300_000,
    );
  });

  it("excludes other currencies entirely, from both current and lifetime fields", () => {
    const totals = computeDebtTotals(allLoans, "USD");
    expect(totals.totalOutstandingMinorUnits).toBe(8_000);
    expect(totals.activeLoanCount).toBe(1);
    expect(totals.totalOriginalPrincipalMinorUnits).toBe(10_000);
  });

  it("returns all zeros when there are no loans in that currency", () => {
    const totals = computeDebtTotals(allLoans, "EUR");
    expect(totals.totalOutstandingMinorUnits).toBe(0);
    expect(totals.activeLoanCount).toBe(0);
    expect(totals.totalOriginalPrincipalMinorUnits).toBe(0);
  });
});

describe("groupDebtByType / groupDebtByLender", () => {
  it("groups active loans by type, highest outstanding first", () => {
    const rows = groupDebtByType([activeHomeLoan, activePersonalLoan], "INR");
    expect(rows).toEqual([
      { key: "home", outstandingMinorUnits: 4_000_000, loanCount: 1 },
      { key: "personal", outstandingMinorUnits: 150_000, loanCount: 1 },
    ]);
  });

  it("groups active loans by lender, combining loans from the same lender", () => {
    const anotherHdfcLoan: LoanForDebtTotals = {
      ...activePersonalLoan,
      lenderName: "HDFC Bank",
    };
    const rows = groupDebtByLender([activeHomeLoan, anotherHdfcLoan], "INR");
    expect(rows).toEqual([
      { key: "HDFC Bank", outstandingMinorUnits: 4_150_000, loanCount: 2 },
    ]);
  });

  it("excludes closed loans from both groupings", () => {
    expect(groupDebtByType([closedLoan], "INR")).toEqual([]);
    expect(groupDebtByLender([closedLoan], "INR")).toEqual([]);
  });
});

describe("computeDebtToIncomeRatio", () => {
  it("computes a plain ratio when income is positive", () => {
    expect(computeDebtToIncomeRatio(20_000, 100_000)).toBeCloseTo(0.2);
  });

  it("returns null (not zero) when income is zero or negative — never fake accuracy", () => {
    expect(computeDebtToIncomeRatio(20_000, 0)).toBeNull();
    expect(computeDebtToIncomeRatio(20_000, -5_000)).toBeNull();
  });
});

describe("computeOverdueAmount", () => {
  const loan = {
    status: "active",
    repaymentStartDate: "2026-01-01",
    maturityDate: null,
    emiAmountMinorUnits: 10_000,
  };

  it("is trackable and zero when every expected EMI has been paid in full", () => {
    const payments = [
      { paymentDate: "2026-01-01", totalPaymentMinorUnits: 10_000 },
      { paymentDate: "2026-02-01", totalPaymentMinorUnits: 10_000 },
      { paymentDate: "2026-03-01", totalPaymentMinorUnits: 10_000 },
    ];
    const result = computeOverdueAmount(loan, payments, "2026-03-15");
    expect(result).toEqual({
      trackable: true,
      expectedAmountMinorUnits: 30_000,
      actualAmountMinorUnits: 30_000,
      overdueAmountMinorUnits: 0,
    });
  });

  it("is based on actual payment records — a missed EMI shows up as overdue", () => {
    const payments = [
      { paymentDate: "2026-01-01", totalPaymentMinorUnits: 10_000 },
    ];
    const result = computeOverdueAmount(loan, payments, "2026-03-15");
    expect(result).toEqual({
      trackable: true,
      expectedAmountMinorUnits: 30_000,
      actualAmountMinorUnits: 10_000,
      overdueAmountMinorUnits: 20_000,
    });
  });

  it("ignores payments made after asOfDate", () => {
    const payments = [
      { paymentDate: "2026-01-01", totalPaymentMinorUnits: 10_000 },
      { paymentDate: "2026-04-01", totalPaymentMinorUnits: 10_000 },
    ];
    const result = computeOverdueAmount(loan, payments, "2026-02-15");
    if (result.trackable) {
      expect(result.actualAmountMinorUnits).toBe(10_000);
    } else {
      throw new Error("expected trackable result");
    }
  });

  it("is not trackable (never a fake zero) when the EMI isn't set", () => {
    const result = computeOverdueAmount(
      { ...loan, emiAmountMinorUnits: null },
      [],
      "2026-03-15",
    );
    expect(result).toEqual({ trackable: false, reason: "emi_not_set" });
  });

  it("is not trackable for a loan that isn't active", () => {
    const result = computeOverdueAmount(
      { ...loan, status: "closed" },
      [],
      "2026-03-15",
    );
    expect(result).toEqual({ trackable: false, reason: "not_active" });
  });

  it("is not trackable before repayment has even started", () => {
    const result = computeOverdueAmount(loan, [], "2025-12-01");
    expect(result).toEqual({ trackable: false, reason: "not_yet_due" });
  });

  it("caps expected EMIs at the maturity date", () => {
    const shortLoan = { ...loan, maturityDate: "2026-02-01" };
    const result = computeOverdueAmount(shortLoan, [], "2026-06-01");
    if (result.trackable) {
      expect(result.expectedAmountMinorUnits).toBe(20_000);
    } else {
      throw new Error("expected trackable result");
    }
  });
});

describe("computeRemainingTenureMonths", () => {
  it("computes remaining months for a normal amortizing loan", () => {
    const result = computeRemainingTenureMonths(1_000_000, 0.12, 100_000);
    expect(result.trackable).toBe(true);
    if (result.trackable) {
      expect(result.tenureMonths).toBeGreaterThan(0);
    }
  });

  it("is not trackable for an already-paid-off loan", () => {
    expect(computeRemainingTenureMonths(0, 0.12, 100_000)).toEqual({
      trackable: false,
      reason: "already_paid_off",
    });
  });

  it("is not trackable when EMI is missing — never a fabricated tenure", () => {
    expect(computeRemainingTenureMonths(1_000_000, 0.12, null)).toEqual({
      trackable: false,
      reason: "emi_not_set",
    });
  });

  it("is not trackable when the EMI doesn't cover interest", () => {
    expect(computeRemainingTenureMonths(1_000_000, 0.12, 1_000)).toEqual({
      trackable: false,
      reason: "does_not_amortize",
    });
  });
});
