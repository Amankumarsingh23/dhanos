import { describe, expect, it } from "vitest";
import {
  computeLoanBalanceHistory,
  computeLoanOutstanding,
  computeOverpaymentAmount,
  selectEffectivePayments,
} from "./loan-outstanding";

describe("selectEffectivePayments", () => {
  it("passes through ordinary payments unchanged", () => {
    const payments = [
      { id: "1", reversesPaymentId: null, principalComponentMinorUnits: 100 },
      { id: "2", reversesPaymentId: null, principalComponentMinorUnits: 200 },
    ];
    expect(selectEffectivePayments(payments)).toEqual(payments);
  });

  it("excludes both a reversed payment and its reversal row", () => {
    const payments = [
      { id: "1", reversesPaymentId: null, principalComponentMinorUnits: 100 },
      { id: "2", reversesPaymentId: "1", principalComponentMinorUnits: 100 },
      { id: "3", reversesPaymentId: null, principalComponentMinorUnits: 50 },
    ];
    const effective = selectEffectivePayments(payments);
    expect(effective).toHaveLength(1);
    expect(effective[0]?.id).toBe("3");
  });
});

describe("computeLoanOutstanding", () => {
  it("returns all zeros for an undisbursed loan", () => {
    const result = computeLoanOutstanding(null, [
      { principalComponentMinorUnits: 1000, overpaymentAmountMinorUnits: 0 },
    ]);
    expect(result).toEqual({
      outstandingMinorUnits: 0,
      totalPrincipalPaidMinorUnits: 0,
      totalOverpaidMinorUnits: 0,
    });
  });

  it("subtracts principal paid from the disbursed amount", () => {
    const result = computeLoanOutstanding(100_000, [
      { principalComponentMinorUnits: 20_000, overpaymentAmountMinorUnits: 0 },
      { principalComponentMinorUnits: 15_000, overpaymentAmountMinorUnits: 0 },
    ]);
    expect(result.outstandingMinorUnits).toBe(65_000);
    expect(result.totalPrincipalPaidMinorUnits).toBe(35_000);
  });

  it("floors outstanding at zero rather than going negative", () => {
    const result = computeLoanOutstanding(10_000, [
      {
        principalComponentMinorUnits: 15_000,
        overpaymentAmountMinorUnits: 5_000,
      },
    ]);
    expect(result.outstandingMinorUnits).toBe(0);
    expect(result.totalOverpaidMinorUnits).toBe(5_000);
  });

  it("treats a fully repaid loan as zero outstanding", () => {
    const result = computeLoanOutstanding(50_000, [
      { principalComponentMinorUnits: 50_000, overpaymentAmountMinorUnits: 0 },
    ]);
    expect(result.outstandingMinorUnits).toBe(0);
  });
});

describe("computeOverpaymentAmount", () => {
  it("returns zero when the payment doesn't exceed the outstanding balance", () => {
    expect(computeOverpaymentAmount(10_000, 5_000)).toBe(0);
    expect(computeOverpaymentAmount(10_000, 10_000)).toBe(0);
  });

  it("returns the excess when the payment exceeds the outstanding balance", () => {
    expect(computeOverpaymentAmount(10_000, 12_000)).toBe(2_000);
  });

  it("handles a zero outstanding balance", () => {
    expect(computeOverpaymentAmount(0, 500)).toBe(500);
  });
});

describe("computeLoanBalanceHistory", () => {
  it("returns an empty series for an undisbursed loan", () => {
    expect(computeLoanBalanceHistory(null, [])).toEqual([]);
  });

  it("builds a running outstanding balance and cumulative components", () => {
    const history = computeLoanBalanceHistory(100_000, [
      {
        paymentDate: "2026-01-01",
        principalComponentMinorUnits: 8_000,
        interestComponentMinorUnits: 2_000,
        feeComponentMinorUnits: 100,
        penaltyComponentMinorUnits: 0,
      },
      {
        paymentDate: "2026-02-01",
        principalComponentMinorUnits: 8_200,
        interestComponentMinorUnits: 1_800,
        feeComponentMinorUnits: 0,
        penaltyComponentMinorUnits: 50,
      },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      date: "2026-01-01",
      outstandingMinorUnits: 92_000,
      cumulativePrincipalPaidMinorUnits: 8_000,
      cumulativeInterestPaidMinorUnits: 2_000,
      cumulativeFeesPaidMinorUnits: 100,
      cumulativePenaltyPaidMinorUnits: 0,
    });
    expect(history[1]).toEqual({
      date: "2026-02-01",
      outstandingMinorUnits: 83_800,
      cumulativePrincipalPaidMinorUnits: 16_200,
      cumulativeInterestPaidMinorUnits: 3_800,
      cumulativeFeesPaidMinorUnits: 100,
      cumulativePenaltyPaidMinorUnits: 50,
    });
  });

  it("floors outstanding at zero across the series", () => {
    const history = computeLoanBalanceHistory(10_000, [
      {
        paymentDate: "2026-01-01",
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 0,
        feeComponentMinorUnits: 0,
        penaltyComponentMinorUnits: 0,
      },
    ]);
    expect(history[0]?.outstandingMinorUnits).toBe(0);
  });
});
