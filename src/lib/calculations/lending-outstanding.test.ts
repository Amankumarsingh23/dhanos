import { describe, expect, it } from "vitest";
import {
  computeExcessRepaymentAmount,
  computeLendingOutstanding,
  computeLendingRecoveryHistory,
  selectEffectiveRepayments,
} from "./lending-outstanding";

describe("selectEffectiveRepayments", () => {
  it("passes through ordinary repayments unchanged", () => {
    const repayments = [
      { id: "1", reversesRepaymentId: null, principalComponentMinorUnits: 100 },
      { id: "2", reversesRepaymentId: null, principalComponentMinorUnits: 200 },
    ];
    expect(selectEffectiveRepayments(repayments)).toEqual(repayments);
  });

  it("excludes both a reversed repayment and its reversal row", () => {
    const repayments = [
      { id: "1", reversesRepaymentId: null, principalComponentMinorUnits: 100 },
      { id: "2", reversesRepaymentId: "1", principalComponentMinorUnits: 100 },
      { id: "3", reversesRepaymentId: null, principalComponentMinorUnits: 50 },
    ];
    const effective = selectEffectiveRepayments(repayments);
    expect(effective).toHaveLength(1);
    expect(effective[0]?.id).toBe("3");
  });
});

describe("computeLendingOutstanding", () => {
  it("subtracts principal recovered from the amount lent", () => {
    const result = computeLendingOutstanding(100_000, [
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
    expect(result.totalPrincipalRecoveredMinorUnits).toBe(35_000);
    expect(result.totalInterestReceivedMinorUnits).toBe(1_500);
  });

  it("floors outstanding at zero rather than going negative", () => {
    const result = computeLendingOutstanding(10_000, [
      {
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 0,
        excessAmountMinorUnits: 5_000,
      },
    ]);
    expect(result.outstandingMinorUnits).toBe(0);
    expect(result.totalExcessMinorUnits).toBe(5_000);
  });

  it("treats a fully recovered lending as zero outstanding", () => {
    const result = computeLendingOutstanding(50_000, [
      {
        principalComponentMinorUnits: 50_000,
        interestComponentMinorUnits: 0,
        excessAmountMinorUnits: 0,
      },
    ]);
    expect(result.outstandingMinorUnits).toBe(0);
  });

  it("returns the full amount as outstanding when nothing has been recovered", () => {
    const result = computeLendingOutstanding(50_000, []);
    expect(result.outstandingMinorUnits).toBe(50_000);
  });
});

describe("computeExcessRepaymentAmount", () => {
  it("returns zero when the repayment doesn't exceed the outstanding balance", () => {
    expect(computeExcessRepaymentAmount(10_000, 5_000)).toBe(0);
    expect(computeExcessRepaymentAmount(10_000, 10_000)).toBe(0);
  });

  it("returns the excess when the repayment exceeds the outstanding balance", () => {
    expect(computeExcessRepaymentAmount(10_000, 12_000)).toBe(2_000);
  });

  it("handles a zero outstanding balance", () => {
    expect(computeExcessRepaymentAmount(0, 500)).toBe(500);
  });
});

describe("computeLendingRecoveryHistory", () => {
  it("returns an empty series with no repayments", () => {
    expect(computeLendingRecoveryHistory(100_000, [])).toEqual([]);
  });

  it("builds a running outstanding balance and cumulative recovery", () => {
    const history = computeLendingRecoveryHistory(100_000, [
      {
        repaymentDate: "2026-01-01",
        principalComponentMinorUnits: 8_000,
        interestComponentMinorUnits: 2_000,
      },
      {
        repaymentDate: "2026-02-01",
        principalComponentMinorUnits: 8_200,
        interestComponentMinorUnits: 1_800,
      },
    ]);

    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({
      date: "2026-01-01",
      outstandingMinorUnits: 92_000,
      cumulativePrincipalRecoveredMinorUnits: 8_000,
      cumulativeInterestReceivedMinorUnits: 2_000,
    });
    expect(history[1]).toEqual({
      date: "2026-02-01",
      outstandingMinorUnits: 83_800,
      cumulativePrincipalRecoveredMinorUnits: 16_200,
      cumulativeInterestReceivedMinorUnits: 3_800,
    });
  });

  it("floors outstanding at zero across the series", () => {
    const history = computeLendingRecoveryHistory(10_000, [
      {
        repaymentDate: "2026-01-01",
        principalComponentMinorUnits: 15_000,
        interestComponentMinorUnits: 0,
      },
    ]);
    expect(history[0]?.outstandingMinorUnits).toBe(0);
  });
});
