import { describe, expect, it } from "vitest";
import {
  computeDailyEquivalent,
  computeMonthlyEquivalent,
  occurrencesPerYear,
} from "./sip-commitment";

describe("occurrencesPerYear", () => {
  it("returns 365.25 for a daily SIP", () => {
    expect(occurrencesPerYear("daily", 1)).toBeCloseTo(365.25, 2);
  });

  it("returns 12 for a monthly SIP", () => {
    expect(occurrencesPerYear("monthly", 1)).toBe(12);
  });

  it("divides by intervalCount for every cadence", () => {
    expect(occurrencesPerYear("daily", 2)).toBeCloseTo(182.625, 2);
    expect(occurrencesPerYear("monthly", 3)).toBe(4);
  });

  it("returns 0 for an unrecognized frequency", () => {
    expect(occurrencesPerYear("bogus", 1)).toBe(0);
  });
});

describe("computeMonthlyEquivalent / computeDailyEquivalent — PROMPT 17 example scenarios", () => {
  it("₹20 every day through PhonePe: exact daily figure, approximate monthly figure", () => {
    const dailyAmount = 2000; // ₹20.00 in paise
    expect(computeDailyEquivalent(dailyAmount, "daily", 1)).toBe(2000);
    // 20 * 365.25 / 12 = 608.75 -> 60875 paise
    expect(computeMonthlyEquivalent(dailyAmount, "daily", 1)).toBe(60875);
  });

  it("₹100 every month through another platform: exact monthly figure, approximate daily figure", () => {
    const monthlyAmount = 10000; // ₹100.00 in paise
    expect(computeMonthlyEquivalent(monthlyAmount, "monthly", 1)).toBe(10000);
    // 100 * 12 / 365.25 = 3.2854... -> 328.54... paise, rounds to 329
    expect(computeDailyEquivalent(monthlyAmount, "monthly", 1)).toBe(329);
  });

  it("combining both example SIPs gives a consistent total monthly commitment", () => {
    const dailySip = computeMonthlyEquivalent(2000, "daily", 1);
    const monthlySip = computeMonthlyEquivalent(10000, "monthly", 1);
    expect(dailySip + monthlySip).toBe(70875);
  });
});

describe("computeMonthlyEquivalent — other cadences", () => {
  it("a quarterly SIP's monthly equivalent is one third the quarterly amount", () => {
    expect(computeMonthlyEquivalent(30000, "quarterly", 1)).toBe(10000);
  });

  it("a yearly SIP's monthly equivalent is one twelfth the yearly amount", () => {
    expect(computeMonthlyEquivalent(120000, "yearly", 1)).toBe(10000);
  });

  it("returns 0 for an unrecognized frequency rather than NaN", () => {
    expect(computeMonthlyEquivalent(10000, "bogus", 1)).toBe(0);
    expect(computeDailyEquivalent(10000, "bogus", 1)).toBe(0);
  });
});
