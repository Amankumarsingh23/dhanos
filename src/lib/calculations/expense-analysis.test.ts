import { describe, expect, it } from "vitest";
import {
  bucketClassification,
  computeAverageDailySpend,
  computeMonthOverMonth,
  daysInRange,
  netExpenseAmount,
} from "./expense-analysis";

describe("bucketClassification", () => {
  it("buckets need, obligation, and protection as essential", () => {
    expect(bucketClassification("need")).toBe("essential");
    expect(bucketClassification("obligation")).toBe("essential");
    expect(bucketClassification("protection")).toBe("essential");
  });

  it("buckets want as discretionary", () => {
    expect(bucketClassification("want")).toBe("discretionary");
  });

  it("buckets null or an unexpected classification as unclassified", () => {
    expect(bucketClassification(null)).toBe("unclassified");
    expect(bucketClassification("investment")).toBe("unclassified");
  });
});

describe("netExpenseAmount", () => {
  it("subtracts the refunded amount from the gross amount", () => {
    expect(netExpenseAmount(10000, 4000)).toBe(6000);
  });

  it("never goes below zero even if refunds somehow exceed the gross amount", () => {
    expect(netExpenseAmount(10000, 15000)).toBe(0);
  });

  it("returns the full gross amount when nothing was refunded", () => {
    expect(netExpenseAmount(10000, 0)).toBe(10000);
  });
});

describe("daysInRange", () => {
  it("counts an inclusive range", () => {
    expect(daysInRange("2026-07-01", "2026-07-31")).toBe(31);
  });

  it("counts a same-day range as one day", () => {
    expect(daysInRange("2026-07-21", "2026-07-21")).toBe(1);
  });

  it("never returns less than one day, even for an inverted range", () => {
    expect(daysInRange("2026-07-21", "2026-07-01")).toBe(1);
  });
});

describe("computeAverageDailySpend", () => {
  it("divides total net spend by the number of days in range", () => {
    expect(computeAverageDailySpend(31000, "2026-07-01", "2026-07-31")).toBe(
      1000,
    );
  });

  it("floors to a whole minor unit rather than returning a fraction", () => {
    expect(computeAverageDailySpend(100, "2026-07-01", "2026-07-31")).toBe(3);
  });
});

describe("computeMonthOverMonth", () => {
  it("computes a positive change and ratio when spend increased", () => {
    const result = computeMonthOverMonth(11000, 10000);
    expect(result).toEqual({
      currentMonthMinorUnits: 11000,
      previousMonthMinorUnits: 10000,
      changeMinorUnits: 1000,
      changeRatio: 0.1,
    });
  });

  it("computes a negative change and ratio when spend decreased", () => {
    const result = computeMonthOverMonth(8000, 10000);
    expect(result.changeMinorUnits).toBe(-2000);
    expect(result.changeRatio).toBe(-0.2);
  });

  it("returns a null ratio when the previous month had no spend", () => {
    const result = computeMonthOverMonth(5000, 0);
    expect(result.changeMinorUnits).toBe(5000);
    expect(result.changeRatio).toBeNull();
  });
});
