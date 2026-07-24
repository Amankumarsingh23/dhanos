import { describe, expect, it } from "vitest";
import {
  computeCombinedDebtBreakdown,
  computeLiabilityTotals,
  groupLiabilitiesByCategory,
  type LiabilityForTotals,
} from "./liability-metrics";

const base: LiabilityForTotals = {
  currencyCode: "INR",
  status: "active",
  liabilitySource: "informal_borrowing",
  category: "family",
  certainty: "confirmed",
  outstandingMinorUnits: 50_000,
};

describe("computeLiabilityTotals", () => {
  it("filters to the requested currency", () => {
    const liabilities = [base, { ...base, currencyCode: "USD" }];
    const totals = computeLiabilityTotals(liabilities, "INR");
    expect(totals.totalOutstandingMinorUnits).toBe(50_000);
  });

  it("keeps informal and general obligation totals separate but also sums them", () => {
    const liabilities = [
      base,
      {
        ...base,
        liabilitySource: "general_obligation" as const,
        category: "unpaid_tax",
        outstandingMinorUnits: 20_000,
      },
    ];
    const totals = computeLiabilityTotals(liabilities, "INR");
    expect(totals.totalInformalOutstandingMinorUnits).toBe(50_000);
    expect(totals.totalGeneralOutstandingMinorUnits).toBe(20_000);
    expect(totals.totalOutstandingMinorUnits).toBe(70_000);
  });

  it("excludes paid/waived liabilities from currently-owed totals", () => {
    const liabilities = [
      base,
      { ...base, status: "paid", outstandingMinorUnits: 0 },
      { ...base, status: "waived", outstandingMinorUnits: 10_000 },
    ];
    const totals = computeLiabilityTotals(liabilities, "INR");
    expect(totals.totalOutstandingMinorUnits).toBe(50_000);
    expect(totals.currentlyOwedCount).toBe(1);
  });

  it("breaks out estimated outstanding separately from confirmed", () => {
    const liabilities = [
      base,
      {
        ...base,
        certainty: "estimated" as const,
        outstandingMinorUnits: 15_000,
      },
    ];
    const totals = computeLiabilityTotals(liabilities, "INR");
    expect(totals.totalOutstandingMinorUnits).toBe(65_000);
    expect(totals.totalEstimatedOutstandingMinorUnits).toBe(15_000);
    expect(totals.estimatedCount).toBe(1);
  });
});

describe("groupLiabilitiesByCategory", () => {
  it("groups currently-owed outstanding by category, highest first", () => {
    const liabilities = [
      base,
      { ...base, category: "friend", outstandingMinorUnits: 90_000 },
    ];
    const rows = groupLiabilitiesByCategory(liabilities, "INR");
    expect(rows).toEqual([
      { key: "friend", outstandingMinorUnits: 90_000, liabilityCount: 1 },
      { key: "family", outstandingMinorUnits: 50_000, liabilityCount: 1 },
    ]);
  });
});

describe("computeCombinedDebtBreakdown", () => {
  it("combines institutional debt with informal/general totals, all kept distinguishable", () => {
    const liabilities = [
      base,
      {
        ...base,
        liabilitySource: "general_obligation" as const,
        category: "unpaid_tax",
        outstandingMinorUnits: 20_000,
      },
    ];
    const totals = computeLiabilityTotals(liabilities, "INR");
    const breakdown = computeCombinedDebtBreakdown(200_000, totals);
    expect(breakdown).toEqual({
      currencyCode: "INR",
      institutionalOutstandingMinorUnits: 200_000,
      informalOutstandingMinorUnits: 50_000,
      generalObligationOutstandingMinorUnits: 20_000,
      totalDebtMinorUnits: 270_000,
    });
  });
});
