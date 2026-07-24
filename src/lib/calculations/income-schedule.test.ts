import { describe, expect, it } from "vitest";
import {
  computeIncomeSchedule,
  isIncomeMissed,
  type IncomeScheduleSource,
} from "./income-schedule";

function source(
  overrides: Partial<IncomeScheduleSource>,
): IncomeScheduleSource {
  return {
    frequency: "monthly",
    expectedDayOfMonth: 5,
    startDate: "2026-01-05",
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

describe("computeIncomeSchedule", () => {
  it("returns nulls for an irregular source", () => {
    const result = computeIncomeSchedule(
      source({ frequency: "irregular", expectedDayOfMonth: null }),
      "2026-07-21",
    );
    expect(result).toEqual({ mostRecentDueDate: null, nextExpectedDate: null });
  });

  it("returns nulls for an inactive source", () => {
    const result = computeIncomeSchedule(
      source({ isActive: false }),
      "2026-07-21",
    );
    expect(result).toEqual({ mostRecentDueDate: null, nextExpectedDate: null });
  });

  it("computes monthly most-recent-due and next-expected dates", () => {
    const result = computeIncomeSchedule(source({}), "2026-07-21");
    expect(result).toEqual({
      mostRecentDueDate: "2026-07-05",
      nextExpectedDate: "2026-08-05",
    });
  });

  it("has no most-recent-due date before the source's start date", () => {
    const result = computeIncomeSchedule(
      source({ startDate: "2026-08-05" }),
      "2026-07-21",
    );
    expect(result.mostRecentDueDate).toBeNull();
    expect(result.nextExpectedDate).toBe("2026-08-05");
  });

  it("clamps expected day 31 to the last day of a shorter month, without drifting later months", () => {
    const withLongDay = source({
      expectedDayOfMonth: 31,
      startDate: "2026-01-31",
    });
    // February 2026 has 28 days.
    const feb = computeIncomeSchedule(withLongDay, "2026-02-15");
    expect(feb.mostRecentDueDate).toBe("2026-01-31");
    expect(feb.nextExpectedDate).toBe("2026-02-28");
    // March should be back to the 31st, not drifting from February's clamp.
    const mar = computeIncomeSchedule(withLongDay, "2026-03-15");
    expect(mar.mostRecentDueDate).toBe("2026-02-28");
    expect(mar.nextExpectedDate).toBe("2026-03-31");
  });

  it("stops producing occurrences after the source's end date", () => {
    const ended = source({ endDate: "2026-03-05" });
    const result = computeIncomeSchedule(ended, "2026-07-21");
    expect(result.mostRecentDueDate).toBe("2026-03-05");
    expect(result.nextExpectedDate).toBeNull();
  });

  it("computes weekly occurrences by day interval, not day-of-month", () => {
    const weekly = source({
      frequency: "weekly",
      expectedDayOfMonth: null,
      startDate: "2026-07-01",
    });
    const result = computeIncomeSchedule(weekly, "2026-07-21");
    expect(result.mostRecentDueDate).toBe("2026-07-15");
    expect(result.nextExpectedDate).toBe("2026-07-22");
  });

  it("computes quarterly occurrences three months apart", () => {
    const quarterly = source({
      frequency: "quarterly",
      startDate: "2026-01-05",
    });
    const result = computeIncomeSchedule(quarterly, "2026-07-21");
    expect(result.mostRecentDueDate).toBe("2026-07-05");
    expect(result.nextExpectedDate).toBe("2026-10-05");
  });
});

describe("isIncomeMissed", () => {
  it("is false when there is no due date", () => {
    expect(
      isIncomeMissed({
        mostRecentDueDate: null,
        lastReceivedDate: null,
        asOfDate: "2026-07-21",
      }),
    ).toBe(false);
  });

  it("is false while still within the grace period", () => {
    expect(
      isIncomeMissed({
        mostRecentDueDate: "2026-07-05",
        lastReceivedDate: null,
        asOfDate: "2026-07-08",
        graceDays: 7,
      }),
    ).toBe(false);
  });

  it("is true once the grace period elapses with nothing received", () => {
    expect(
      isIncomeMissed({
        mostRecentDueDate: "2026-07-05",
        lastReceivedDate: null,
        asOfDate: "2026-07-20",
        graceDays: 7,
      }),
    ).toBe(true);
  });

  it("is false when something was received on or after the due date", () => {
    expect(
      isIncomeMissed({
        mostRecentDueDate: "2026-07-05",
        lastReceivedDate: "2026-07-06",
        asOfDate: "2026-07-20",
        graceDays: 7,
      }),
    ).toBe(false);
  });

  it("is true when the last receipt predates the current due date (a newer payment is now overdue)", () => {
    expect(
      isIncomeMissed({
        mostRecentDueDate: "2026-07-05",
        lastReceivedDate: "2026-06-05",
        asOfDate: "2026-07-20",
        graceDays: 7,
      }),
    ).toBe(true);
  });
});
