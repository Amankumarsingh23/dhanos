import { describe, expect, it } from "vitest";
import {
  computeExcessPaymentAmount,
  computeLiabilityBalanceHistory,
  computeLiabilityOutstanding,
  selectEffectivePayments,
} from "./liability-outstanding";

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

describe("computeLiabilityOutstanding", () => {
  it("subtracts principal paid from the original amount", () => {
    const result = computeLiabilityOutstanding(100_000, [
      {
        principalComponentMinorUnits: 20_000,
        interestComponentMinorUnits: 1_000,
        excessAmountMinorUnits: 0,
      },
      {
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 500,
        excessAmountMinorUnits: 0,
      },
    ]);
    expect(result.outstandingMinorUnits).toBe(65_000);
    expect(result.totalPrincipalPaidMinorUnits).toBe(35_000);
    expect(result.totalInterestPaidMinorUnits).toBe(1_500);
  });

  it("floors outstanding at zero rather than going negative", () => {
    const result = computeLiabilityOutstanding(10_000, [
      {
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 0,
        excessAmountMinorUnits: 5_000,
      },
    ]);
    expect(result.outstandingMinorUnits).toBe(0);
    expect(result.totalExcessMinorUnits).toBe(5_000);
  });

  it("returns the full amount as outstanding when nothing has been paid", () => {
    expect(computeLiabilityOutstanding(50_000, []).outstandingMinorUnits).toBe(
      50_000,
    );
  });
});

describe("computeExcessPaymentAmount", () => {
  it("returns zero when the payment doesn't exceed the outstanding balance", () => {
    expect(computeExcessPaymentAmount(10_000, 5_000)).toBe(0);
    expect(computeExcessPaymentAmount(10_000, 10_000)).toBe(0);
  });

  it("returns the excess when the payment exceeds the outstanding balance", () => {
    expect(computeExcessPaymentAmount(10_000, 12_000)).toBe(2_000);
  });
});

describe("computeLiabilityBalanceHistory", () => {
  it("returns an empty series with no payments", () => {
    expect(computeLiabilityBalanceHistory(100_000, [])).toEqual([]);
  });

  it("builds a running outstanding balance and cumulative components", () => {
    const history = computeLiabilityBalanceHistory(100_000, [
      {
        paymentDate: "2026-01-01",
        principalComponentMinorUnits: 8_000,
        interestComponentMinorUnits: 2_000,
      },
      {
        paymentDate: "2026-02-01",
        principalComponentMinorUnits: 8_200,
        interestComponentMinorUnits: 1_800,
      },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      date: "2026-01-01",
      outstandingMinorUnits: 92_000,
      cumulativePrincipalPaidMinorUnits: 8_000,
      cumulativeInterestPaidMinorUnits: 2_000,
    });
    expect(history[1]).toEqual({
      date: "2026-02-01",
      outstandingMinorUnits: 83_800,
      cumulativePrincipalPaidMinorUnits: 16_200,
      cumulativeInterestPaidMinorUnits: 3_800,
    });
  });

  it("floors outstanding at zero across the series", () => {
    const history = computeLiabilityBalanceHistory(10_000, [
      {
        paymentDate: "2026-01-01",
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 0,
      },
    ]);
    expect(history[0]?.outstandingMinorUnits).toBe(0);
  });
});
