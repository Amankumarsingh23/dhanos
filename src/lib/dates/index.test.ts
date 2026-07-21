import { describe, expect, it } from "vitest";
import {
  createStatementPeriod,
  DEFAULT_TIMEZONE,
  formatDisplayDate,
  isFutureDate,
  isValidDate,
  isValidMonthKey,
  resolveTimeZone,
  toDueDateString,
  toIsoDateString,
  toMonthKey,
  toTransactionDateString,
  toValuationDateString,
} from "./index";

describe("toIsoDateString", () => {
  it("formats a Date as a date-only ISO string", () => {
    expect(toIsoDateString(new Date("2026-07-21T10:30:00Z"))).toBe(
      "2026-07-21",
    );
  });

  it("accepts an ISO string as input", () => {
    expect(toIsoDateString("2026-01-05T00:00:00Z")).toBe("2026-01-05");
  });
});

describe("formatDisplayDate", () => {
  it("formats a date for display with the default pattern", () => {
    expect(
      formatDisplayDate(new Date("2026-07-21T00:00:00Z"), "d MMM yyyy"),
    ).toContain("2026");
  });
});

describe("isFutureDate / isValidDate", () => {
  it("recognizes a future date", () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    expect(isFutureDate(nextYear)).toBe(true);
  });

  it("recognizes a past date as not future", () => {
    expect(isFutureDate(new Date("2000-01-01"))).toBe(false);
  });

  it("validates a well-formed date", () => {
    expect(isValidDate(new Date("2026-07-21"))).toBe(true);
  });

  it("flags an invalid date string", () => {
    expect(isValidDate("not-a-date")).toBe(false);
  });
});

describe("semantic date aliases", () => {
  it("all produce the same YYYY-MM-DD representation as toIsoDateString", () => {
    const value = new Date("2026-07-21T00:00:00Z");
    expect(toTransactionDateString(value)).toBe(toIsoDateString(value));
    expect(toDueDateString(value)).toBe(toIsoDateString(value));
    expect(toValuationDateString(value)).toBe(toIsoDateString(value));
  });
});

describe("toMonthKey / isValidMonthKey", () => {
  it("computes a YYYY-MM month key in UTC by default", () => {
    expect(toMonthKey(new Date("2026-07-21T10:00:00Z"))).toBe("2026-07");
  });

  it("computes the month key in an explicit timezone, which can differ from UTC near midnight", () => {
    // 2026-07-01T00:30:00Z is still 2026-06-30 in US/Pacific (UTC-7 in July).
    const nearMidnightUtc = new Date("2026-07-01T00:30:00Z");
    expect(toMonthKey(nearMidnightUtc, "UTC")).toBe("2026-07");
    expect(toMonthKey(nearMidnightUtc, "America/Los_Angeles")).toBe("2026-06");
  });

  it("throws for an invalid date", () => {
    expect(() => toMonthKey("not-a-date")).toThrow(/not a valid date/);
  });

  it("validates a well-formed month key", () => {
    expect(isValidMonthKey("2026-07")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-7")).toBe(false);
  });
});

describe("resolveTimeZone", () => {
  it("returns the explicit timezone when given", () => {
    expect(resolveTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("falls back to DEFAULT_TIMEZONE for null/undefined/blank", () => {
    expect(resolveTimeZone(null)).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIMEZONE);
    expect(resolveTimeZone("   ")).toBe(DEFAULT_TIMEZONE);
  });
});

describe("createStatementPeriod", () => {
  it("builds a period from two dates", () => {
    expect(createStatementPeriod("2026-07-01", "2026-07-31")).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    });
  });

  it("allows a single-day period (start equals end)", () => {
    expect(createStatementPeriod("2026-07-21", "2026-07-21")).toEqual({
      startDate: "2026-07-21",
      endDate: "2026-07-21",
    });
  });

  it("rejects an end date before the start date", () => {
    expect(() => createStatementPeriod("2026-07-31", "2026-07-01")).toThrow(
      /cannot be before/,
    );
  });
});
