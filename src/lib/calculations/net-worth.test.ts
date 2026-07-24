import { describe, expect, it } from "vitest";
import {
  computeCompletenessPercentage,
  computeContributionVsValuationChange,
  computeMonthOverMonthChange,
  computeNetWorthTotals,
  computeOtherLiabilitiesBreakdown,
  selectLatestSnapshotPerMonth,
  type LiabilityForNetWorth,
} from "./net-worth";

describe("computeNetWorthTotals", () => {
  it("sums assets, sums liabilities, and subtracts", () => {
    const totals = computeNetWorthTotals({
      cashAndAccountsMinorUnits: 200_000_00,
      investmentsMinorUnits: 300_000_00,
      movableAssetsMinorUnits: 50_000_00,
      propertyMinorUnits: 1_000_000_00,
      receivablesMinorUnits: 25_000_00,
      loansMinorUnits: 400_000_00,
      otherLiabilitiesMinorUnits: 10_000_00,
    });

    expect(totals.totalAssetsMinorUnits).toBe(1_575_000_00);
    expect(totals.totalLiabilitiesMinorUnits).toBe(410_000_00);
    expect(totals.netWorthMinorUnits).toBe(1_165_000_00);
  });

  it("allows a negative net worth when liabilities exceed assets", () => {
    const totals = computeNetWorthTotals({
      cashAndAccountsMinorUnits: 10_000_00,
      investmentsMinorUnits: 0,
      movableAssetsMinorUnits: 0,
      propertyMinorUnits: 0,
      receivablesMinorUnits: 0,
      loansMinorUnits: 50_000_00,
      otherLiabilitiesMinorUnits: 0,
    });
    expect(totals.netWorthMinorUnits).toBe(-40_000_00);
  });
});

describe("computeCompletenessPercentage", () => {
  it("is 100 when there are no valuation-dependent items at all", () => {
    expect(computeCompletenessPercentage(0, 0)).toBe(100);
  });

  it("is the exact fraction of items with a valuation", () => {
    expect(computeCompletenessPercentage(4, 3)).toBe(75);
  });

  it("is 0 when nothing has a valuation yet, never hidden as a fabricated number", () => {
    expect(computeCompletenessPercentage(5, 0)).toBe(0);
  });
});

function liability(
  overrides: Partial<LiabilityForNetWorth>,
): LiabilityForNetWorth {
  return {
    currencyCode: "INR",
    status: "active",
    liabilitySource: "informal_borrowing",
    certainty: "confirmed",
    outstandingMinorUnits: 0,
    ...overrides,
  };
}

describe("computeOtherLiabilitiesBreakdown", () => {
  it("counts informal debt regardless of certainty", () => {
    const breakdown = computeOtherLiabilitiesBreakdown(
      [
        liability({
          liabilitySource: "informal_borrowing",
          certainty: "confirmed",
          outstandingMinorUnits: 10_000_00,
        }),
        liability({
          liabilitySource: "informal_borrowing",
          certainty: "estimated",
          outstandingMinorUnits: 5_000_00,
        }),
      ],
      "INR",
    );
    expect(breakdown.informalDebtMinorUnits).toBe(15_000_00);
    expect(breakdown.otherLiabilitiesMinorUnits).toBe(15_000_00);
  });

  it("only counts confirmed general obligations, excluding estimated ones from the total", () => {
    const breakdown = computeOtherLiabilitiesBreakdown(
      [
        liability({
          liabilitySource: "general_obligation",
          certainty: "confirmed",
          outstandingMinorUnits: 20_000_00,
        }),
        liability({
          liabilitySource: "general_obligation",
          certainty: "estimated",
          outstandingMinorUnits: 8_000_00,
        }),
      ],
      "INR",
    );
    expect(breakdown.confirmedGeneralObligationsMinorUnits).toBe(20_000_00);
    expect(breakdown.estimatedGeneralObligationsExcludedMinorUnits).toBe(
      8_000_00,
    );
    expect(breakdown.otherLiabilitiesMinorUnits).toBe(20_000_00);
  });

  it("excludes paid and waived liabilities from every figure", () => {
    const breakdown = computeOtherLiabilitiesBreakdown(
      [
        liability({ status: "paid", outstandingMinorUnits: 10_000_00 }),
        liability({ status: "waived", outstandingMinorUnits: 10_000_00 }),
      ],
      "INR",
    );
    expect(breakdown.otherLiabilitiesMinorUnits).toBe(0);
  });

  it("never blends a different currency into the total", () => {
    const breakdown = computeOtherLiabilitiesBreakdown(
      [liability({ currencyCode: "USD", outstandingMinorUnits: 10_000_00 })],
      "INR",
    );
    expect(breakdown.otherLiabilitiesMinorUnits).toBe(0);
  });
});

describe("selectLatestSnapshotPerMonth", () => {
  it("keeps only the latest snapshot within each calendar month", () => {
    const result = selectLatestSnapshotPerMonth([
      { asOfDate: "2026-01-05", netWorthMinorUnits: 1 },
      { asOfDate: "2026-01-20", netWorthMinorUnits: 2 },
      { asOfDate: "2026-02-10", netWorthMinorUnits: 3 },
    ]);
    expect(result.map((r) => r.asOfDate)).toEqual(["2026-01-20", "2026-02-10"]);
  });

  it("sorts by month regardless of input order", () => {
    const result = selectLatestSnapshotPerMonth([
      { asOfDate: "2026-03-01", netWorthMinorUnits: 3 },
      { asOfDate: "2026-01-01", netWorthMinorUnits: 1 },
      { asOfDate: "2026-02-01", netWorthMinorUnits: 2 },
    ]);
    expect(result.map((r) => r.asOfDate)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });
});

describe("computeMonthOverMonthChange", () => {
  it("has no change for the first month on record", () => {
    const result = computeMonthOverMonthChange([
      { asOfDate: "2026-01-31", netWorthMinorUnits: 1_000_00 },
    ]);
    expect(result[0]?.changeMinorUnits).toBe(0);
    expect(result[0]?.changePercentage).toBeNull();
  });

  it("computes the delta and percentage against the prior month", () => {
    const result = computeMonthOverMonthChange([
      { asOfDate: "2026-01-31", netWorthMinorUnits: 1_000_00 },
      { asOfDate: "2026-02-28", netWorthMinorUnits: 1_200_00 },
    ]);
    expect(result[1]?.changeMinorUnits).toBe(200_00);
    expect(result[1]?.changePercentage).toBeCloseTo(20, 5);
  });

  it("returns a null percentage rather than dividing by zero when the prior month was exactly zero", () => {
    const result = computeMonthOverMonthChange([
      { asOfDate: "2026-01-31", netWorthMinorUnits: 0 },
      { asOfDate: "2026-02-28", netWorthMinorUnits: 500_00 },
    ]);
    expect(result[1]?.changeMinorUnits).toBe(500_00);
    expect(result[1]?.changePercentage).toBeNull();
  });
});

describe("computeContributionVsValuationChange", () => {
  it("attributes the remainder of the change to valuation once contribution is known", () => {
    const result = computeContributionVsValuationChange(
      100_000_00,
      130_000_00,
      20_000_00,
    );
    expect(result.contributionMinorUnits).toBe(20_000_00);
    expect(result.valuationChangeMinorUnits).toBe(10_000_00);
  });

  it("can show a valuation loss even with positive net contributions", () => {
    const result = computeContributionVsValuationChange(
      100_000_00,
      90_000_00,
      20_000_00,
    );
    expect(result.contributionMinorUnits).toBe(20_000_00);
    expect(result.valuationChangeMinorUnits).toBe(-30_000_00);
  });
});
