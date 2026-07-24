import { describe, expect, it } from "vitest";
import {
  computeClosingCompleteness,
  computePeriodDateRange,
  computeReconciliationStatus,
  resolveCurrentClosing,
} from "./monthly-closing";

describe("computePeriodDateRange", () => {
  it("resolves the first and last day of a 31-day month", () => {
    expect(computePeriodDateRange("2026-01")).toEqual({
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    });
  });

  it("resolves the last day of a 28-day February correctly", () => {
    expect(computePeriodDateRange("2026-02")).toEqual({
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
    });
  });

  it("resolves a leap-year February correctly", () => {
    expect(computePeriodDateRange("2028-02")).toEqual({
      dateFrom: "2028-02-01",
      dateTo: "2028-02-29",
    });
  });
});

describe("computeReconciliationStatus", () => {
  it("is clean once there are zero unresolved items", () => {
    expect(computeReconciliationStatus(0)).toBe("clean");
  });

  it("has unresolved items with even a single one outstanding", () => {
    expect(computeReconciliationStatus(1)).toBe("has_unresolved_items");
  });
});

describe("computeClosingCompleteness", () => {
  it("is complete with zero unresolved items and full net-worth completeness", () => {
    const result = computeClosingCompleteness({
      unresolvedItemsCount: 0,
      totalReviewItemsCount: 12,
      netWorthCompletenessPercentage: 100,
    });
    expect(result.isComplete).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("gives a specific, countable reason for unresolved review items", () => {
    const result = computeClosingCompleteness({
      unresolvedItemsCount: 3,
      totalReviewItemsCount: 12,
      netWorthCompletenessPercentage: 100,
    });
    expect(result.isComplete).toBe(false);
    expect(result.reasons).toEqual([
      "3 of 12 review item(s) were not marked reviewed.",
    ]);
  });

  it("gives a specific reason for incomplete net-worth data", () => {
    const result = computeClosingCompleteness({
      unresolvedItemsCount: 0,
      totalReviewItemsCount: 12,
      netWorthCompletenessPercentage: 80,
    });
    expect(result.isComplete).toBe(false);
    expect(result.reasons[0]).toContain("80%");
  });

  it("reports both reasons at once when both are true", () => {
    const result = computeClosingCompleteness({
      unresolvedItemsCount: 2,
      totalReviewItemsCount: 12,
      netWorthCompletenessPercentage: 50,
    });
    expect(result.reasons).toHaveLength(2);
  });
});

describe("resolveCurrentClosing", () => {
  it("returns null for an empty chain", () => {
    expect(resolveCurrentClosing([])).toBeNull();
  });

  it("picks the single closing when there's only one", () => {
    const result = resolveCurrentClosing([
      { id: "a", createdAt: "2026-02-01T00:00:00Z" },
    ]);
    expect(result?.id).toBe("a");
  });

  it("picks the most recently created closing regardless of input order", () => {
    const result = resolveCurrentClosing([
      { id: "a", createdAt: "2026-02-01T00:00:00Z" },
      { id: "c", createdAt: "2026-02-15T00:00:00Z" },
      { id: "b", createdAt: "2026-02-10T00:00:00Z" },
    ]);
    expect(result?.id).toBe("c");
  });
});
