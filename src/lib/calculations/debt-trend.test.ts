import { describe, expect, it } from "vitest";
import {
  buildTrailingMonthKeys,
  computeHouseholdDebtTrend,
  generateEmiCalendar,
  type LoanForDebtTrend,
  type LoanForEmiCalendar,
} from "./debt-trend";

describe("buildTrailingMonthKeys", () => {
  it("builds N trailing months ending at asOfDate's month, oldest first", () => {
    expect(buildTrailingMonthKeys("2026-03-15", 3)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
  });

  it("handles a single month", () => {
    expect(buildTrailingMonthKeys("2026-07-01", 1)).toEqual(["2026-07"]);
  });
});

describe("computeHouseholdDebtTrend", () => {
  const loanA: LoanForDebtTrend = {
    disbursedAmountMinorUnits: 100_000,
    disbursedDate: "2026-01-01",
    balanceHistory: [
      {
        date: "2026-02-01",
        outstandingMinorUnits: 90_000,
        cumulativePrincipalPaidMinorUnits: 10_000,
        cumulativeInterestPaidMinorUnits: 1_000,
        cumulativeFeesPaidMinorUnits: 0,
        cumulativePenaltyPaidMinorUnits: 0,
      },
    ],
  };

  const loanB: LoanForDebtTrend = {
    disbursedAmountMinorUnits: 50_000,
    disbursedDate: "2026-03-01",
    balanceHistory: [],
  };

  it("carries the disbursed amount forward as outstanding when no payment has landed yet", () => {
    const trend = computeHouseholdDebtTrend([loanA], ["2026-01"]);
    expect(trend[0]).toEqual({
      monthKey: "2026-01",
      outstandingMinorUnits: 100_000,
      cumulativePrincipalPaidMinorUnits: 0,
      cumulativeInterestPaidMinorUnits: 0,
    });
  });

  it("uses the latest balance-history point at or before the month", () => {
    const trend = computeHouseholdDebtTrend([loanA], ["2026-02", "2026-03"]);
    expect(trend).toEqual([
      {
        monthKey: "2026-02",
        outstandingMinorUnits: 90_000,
        cumulativePrincipalPaidMinorUnits: 10_000,
        cumulativeInterestPaidMinorUnits: 1_000,
      },
      {
        monthKey: "2026-03",
        outstandingMinorUnits: 90_000,
        cumulativePrincipalPaidMinorUnits: 10_000,
        cumulativeInterestPaidMinorUnits: 1_000,
      },
    ]);
  });

  it("excludes a loan not yet disbursed by that month, and sums across loans once it is", () => {
    const trend = computeHouseholdDebtTrend(
      [loanA, loanB],
      ["2026-01", "2026-03"],
    );
    expect(trend[0]?.outstandingMinorUnits).toBe(100_000); // loanB not disbursed yet
    expect(trend[1]?.outstandingMinorUnits).toBe(90_000 + 50_000);
  });

  it("contributes nothing for an undisbursed loan", () => {
    const undisbursed: LoanForDebtTrend = {
      disbursedAmountMinorUnits: null,
      disbursedDate: null,
      balanceHistory: [],
    };
    const trend = computeHouseholdDebtTrend([undisbursed], ["2026-01"]);
    expect(trend[0]?.outstandingMinorUnits).toBe(0);
  });
});

describe("generateEmiCalendar", () => {
  const activeLoan: LoanForEmiCalendar = {
    id: "loan-1",
    name: "Home Loan",
    status: "active",
    repaymentStartDate: "2026-01-01",
    maturityDate: null,
    emiAmountMinorUnits: 10_000,
  };

  it("marks a fully-paid month as paid, using the actual payment sum", () => {
    const payments = new Map([
      [
        "loan-1",
        [{ paymentDate: "2026-01-15", totalPaymentMinorUnits: 10_000 }],
      ],
    ]);
    const entries = generateEmiCalendar(
      [activeLoan],
      payments,
      ["2026-01"],
      "2026-01",
    );
    expect(entries).toEqual([
      {
        monthKey: "2026-01",
        loanId: "loan-1",
        loanName: "Home Loan",
        scheduledAmountMinorUnits: 10_000,
        actualAmountMinorUnits: 10_000,
        status: "paid",
      },
    ]);
  });

  it("marks a partial payment distinctly from a full payment", () => {
    const payments = new Map([
      [
        "loan-1",
        [{ paymentDate: "2026-01-15", totalPaymentMinorUnits: 4_000 }],
      ],
    ]);
    const entries = generateEmiCalendar(
      [activeLoan],
      payments,
      ["2026-01"],
      "2026-01",
    );
    expect(entries[0]?.status).toBe("partially_paid");
    expect(entries[0]?.actualAmountMinorUnits).toBe(4_000);
    expect(entries[0]?.scheduledAmountMinorUnits).toBe(10_000);
  });

  it("marks a future month with no payment as upcoming, not overdue", () => {
    const entries = generateEmiCalendar(
      [activeLoan],
      new Map(),
      ["2026-03"],
      "2026-01",
    );
    expect(entries[0]?.status).toBe("upcoming");
  });

  it("marks a past month with no payment as overdue — based on actual payment records, not a stored flag", () => {
    const entries = generateEmiCalendar(
      [activeLoan],
      new Map(),
      ["2026-01"],
      "2026-03",
    );
    expect(entries[0]?.status).toBe("overdue");
  });

  it("marks a loan with no EMI set as not_tracked rather than fabricating a scheduled amount", () => {
    const entries = generateEmiCalendar(
      [{ ...activeLoan, emiAmountMinorUnits: null }],
      new Map(),
      ["2026-01"],
      "2026-01",
    );
    expect(entries[0]?.status).toBe("not_tracked");
    expect(entries[0]?.scheduledAmountMinorUnits).toBeNull();
  });

  it("skips a loan still pending disbursement entirely", () => {
    const entries = generateEmiCalendar(
      [{ ...activeLoan, status: "pending_disbursement" }],
      new Map(),
      ["2026-01"],
      "2026-01",
    );
    expect(entries).toEqual([]);
  });

  it("excludes months outside the repayment window", () => {
    const entries = generateEmiCalendar(
      [activeLoan],
      new Map(),
      ["2025-11"],
      "2026-01",
    );
    expect(entries).toEqual([]);
  });

  it("stops generating entries past the maturity date", () => {
    const entries = generateEmiCalendar(
      [{ ...activeLoan, maturityDate: "2026-02-01" }],
      new Map(),
      ["2026-01", "2026-02", "2026-03"],
      "2026-01",
    );
    expect(entries.map((e) => e.monthKey)).toEqual(["2026-01", "2026-02"]);
  });
});
