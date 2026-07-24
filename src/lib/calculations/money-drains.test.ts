import { describe, expect, it } from "vitest";
import {
  annualizeDrainCostMinorUnits,
  computeDrainTotals,
  computeMonthlyEquivalentDrainCostMinorUnits,
  drainOccurrencesPerYear,
  isHighCostLowUse,
  isLowUseDrain,
  isMaintenanceHeavyType,
  isRenewalOverdue,
  isRenewalUpcoming,
  isUnusedDrain,
} from "./money-drains";

describe("drainOccurrencesPerYear", () => {
  it("maps every fixed cadence to occurrences per year", () => {
    expect(drainOccurrencesPerYear("monthly")).toBe(12);
    expect(drainOccurrencesPerYear("quarterly")).toBe(4);
    expect(drainOccurrencesPerYear("half_yearly")).toBe(2);
    expect(drainOccurrencesPerYear("yearly")).toBe(1);
    expect(drainOccurrencesPerYear("one_time")).toBe(0);
  });

  it("returns null for an irregular cadence — never a guessed number", () => {
    expect(drainOccurrencesPerYear("irregular")).toBeNull();
  });
});

describe("annualizeDrainCostMinorUnits", () => {
  it("annualizes a monthly subscription", () => {
    expect(annualizeDrainCostMinorUnits(50_000, "monthly")).toBe(600_000);
  });

  it("annualizes a quarterly cost", () => {
    expect(annualizeDrainCostMinorUnits(150_000, "quarterly")).toBe(600_000);
  });

  it("leaves a yearly cost unchanged", () => {
    expect(annualizeDrainCostMinorUnits(600_000, "yearly")).toBe(600_000);
  });

  it("excludes a one-time cost from the annualized total", () => {
    expect(annualizeDrainCostMinorUnits(200_000, "one_time")).toBe(0);
  });

  it("cannot annualize an irregular cost", () => {
    expect(annualizeDrainCostMinorUnits(100_000, "irregular")).toBeNull();
  });
});

describe("computeMonthlyEquivalentDrainCostMinorUnits", () => {
  it("is exact for a monthly cadence", () => {
    expect(computeMonthlyEquivalentDrainCostMinorUnits(50_000, "monthly")).toBe(
      50_000,
    );
  });

  it("divides a yearly cost across 12 months", () => {
    expect(computeMonthlyEquivalentDrainCostMinorUnits(120_000, "yearly")).toBe(
      10_000,
    );
  });

  it("is null for an irregular cadence", () => {
    expect(
      computeMonthlyEquivalentDrainCostMinorUnits(50_000, "irregular"),
    ).toBeNull();
  });
});

describe("isUnusedDrain / isLowUseDrain", () => {
  it("never/rarely count as unused", () => {
    expect(isUnusedDrain("never")).toBe(true);
    expect(isUnusedDrain("rarely")).toBe(true);
  });

  it("occasionally is low-use but not strictly unused", () => {
    expect(isUnusedDrain("occasionally")).toBe(false);
    expect(isLowUseDrain("occasionally")).toBe(true);
  });

  it("daily/weekly/monthly usage is not low-use", () => {
    expect(isLowUseDrain("daily")).toBe(false);
    expect(isLowUseDrain("weekly")).toBe(false);
    expect(isLowUseDrain("monthly")).toBe(false);
  });
});

describe("isHighCostLowUse", () => {
  it("flags a costly, rarely-used item above the threshold", () => {
    expect(isHighCostLowUse(100_000, "rarely", 50_000)).toBe(true);
  });

  it("does not flag a cheap, rarely-used item below the threshold", () => {
    expect(isHighCostLowUse(10_000, "rarely", 50_000)).toBe(false);
  });

  it("does not flag a costly item that's actually used often", () => {
    expect(isHighCostLowUse(100_000, "daily", 50_000)).toBe(false);
  });

  it("never flags an unannualizable (null) cost", () => {
    expect(isHighCostLowUse(null, "never", 0)).toBe(false);
  });
});

describe("isRenewalUpcoming / isRenewalOverdue", () => {
  it("is upcoming within the window", () => {
    expect(isRenewalUpcoming("2026-01-20", "2026-01-01", 30)).toBe(true);
  });

  it("is not upcoming beyond the window", () => {
    expect(isRenewalUpcoming("2026-03-01", "2026-01-01", 30)).toBe(false);
  });

  it("is not upcoming once the date has passed — it's overdue instead", () => {
    expect(isRenewalUpcoming("2025-12-01", "2026-01-01")).toBe(false);
    expect(isRenewalOverdue("2025-12-01", "2026-01-01")).toBe(true);
  });

  it("is not trackable with no date", () => {
    expect(isRenewalUpcoming(null, "2026-01-01")).toBe(false);
    expect(isRenewalOverdue(null, "2026-01-01")).toBe(false);
  });
});

describe("isMaintenanceHeavyType", () => {
  it("flags vehicles and maintenance-heavy assets", () => {
    expect(isMaintenanceHeavyType("vehicle")).toBe(true);
    expect(isMaintenanceHeavyType("maintenance_heavy_asset")).toBe(true);
  });

  it("does not flag a subscription", () => {
    expect(isMaintenanceHeavyType("subscription")).toBe(false);
  });
});

describe("computeDrainTotals", () => {
  it("sums monthly/annual totals, split by essential/discretionary and by type", () => {
    const totals = computeDrainTotals([
      {
        drainType: "subscription",
        costFrequency: "monthly",
        costAmountMinorUnits: 50_000,
        isEssential: false,
      },
      {
        drainType: "vehicle",
        costFrequency: "yearly",
        costAmountMinorUnits: 120_000,
        isEssential: true,
      },
    ]);

    expect(totals.totalMonthlyMinorUnits).toBe(60_000);
    expect(totals.totalAnnualMinorUnits).toBe(720_000);
    expect(totals.essentialMonthlyMinorUnits).toBe(10_000);
    expect(totals.discretionaryMonthlyMinorUnits).toBe(50_000);
    expect(totals.byTypeMonthlyMinorUnits.subscription).toBe(50_000);
    expect(totals.byTypeMonthlyMinorUnits.vehicle).toBe(10_000);
    expect(totals.maintenanceMonthlyMinorUnits).toBe(10_000);
    expect(totals.irregularCostCount).toBe(0);
  });

  it("excludes irregular-cadence items from every total but counts them separately", () => {
    const totals = computeDrainTotals([
      {
        drainType: "maintenance_heavy_asset",
        costFrequency: "irregular",
        costAmountMinorUnits: 300_000,
        isEssential: false,
      },
    ]);

    expect(totals.totalMonthlyMinorUnits).toBe(0);
    expect(totals.totalAnnualMinorUnits).toBe(0);
    expect(totals.irregularCostCount).toBe(1);
    expect(totals.maintenanceMonthlyMinorUnits).toBe(0);
  });
});
