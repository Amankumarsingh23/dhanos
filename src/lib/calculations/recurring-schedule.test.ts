import { describe, expect, it } from "vitest";
import {
  computeInitialNextDueDate,
  computeNextOccurrenceAfter,
  isRecurringMissed,
  isRecurringUpcoming,
  resolveAmountForDate,
  type RecurringScheduleSource,
} from "./recurring-schedule";

function source(
  overrides: Partial<RecurringScheduleSource>,
): RecurringScheduleSource {
  return {
    frequency: "monthly",
    intervalCount: 1,
    startDate: "2026-01-31",
    endDate: null,
    ...overrides,
  };
}

describe("computeInitialNextDueDate", () => {
  it("is always the rule's start date", () => {
    expect(computeInitialNextDueDate(source({ startDate: "2026-03-15" }))).toBe(
      "2026-03-15",
    );
  });
});

describe("computeNextOccurrenceAfter", () => {
  it("advances daily by intervalCount days", () => {
    const s = source({
      frequency: "daily",
      intervalCount: 1,
      startDate: "2026-07-01",
    });
    expect(computeNextOccurrenceAfter(s, "2026-07-01")).toBe("2026-07-02");
    expect(computeNextOccurrenceAfter(s, "2026-07-02")).toBe("2026-07-03");
  });

  it("advances a custom interval (a plain day count) safely regardless of month length", () => {
    const s = source({
      frequency: "custom",
      intervalCount: 10,
      startDate: "2026-01-25",
    });
    expect(computeNextOccurrenceAfter(s, "2026-01-25")).toBe("2026-02-04");
    expect(computeNextOccurrenceAfter(s, "2026-02-04")).toBe("2026-02-14");
  });

  it("advances weekly/biweekly by intervalCount weeks", () => {
    const weekly = source({
      frequency: "weekly",
      intervalCount: 2,
      startDate: "2026-07-01",
    });
    expect(computeNextOccurrenceAfter(weekly, "2026-07-01")).toBe("2026-07-15");

    const biweekly = source({ frequency: "biweekly", startDate: "2026-07-01" });
    expect(computeNextOccurrenceAfter(biweekly, "2026-07-01")).toBe(
      "2026-07-15",
    );
  });

  it("never drags a clamped short-month occurrence's later occurrences earlier", () => {
    // Anchored to the 31st: Jan 31 -> Feb (clamped to 28th) -> Mar must
    // still land on the 31st, not "28th + 1 month" = Mar 28.
    const s = source({ frequency: "monthly", startDate: "2026-01-31" });
    expect(computeNextOccurrenceAfter(s, "2026-01-31")).toBe("2026-02-28");
    expect(computeNextOccurrenceAfter(s, "2026-02-28")).toBe("2026-03-31");
    expect(computeNextOccurrenceAfter(s, "2026-03-31")).toBe("2026-04-30");
    expect(computeNextOccurrenceAfter(s, "2026-04-30")).toBe("2026-05-31");
  });

  it("clamps to the 29th (not the 28th) in a leap-year February, and still anchors back to the 31st in March — PROMPT 46", () => {
    // 2028 is a leap year (divisible by 4, not a century): Jan 31 -> Feb
    // clamps to the 29th, not the 28th a non-leap-year table would give —
    // and Mar must still re-anchor to the 31st from startDate, not
    // "29th + 1 month" = Mar 29.
    const s = source({ frequency: "monthly", startDate: "2028-01-31" });
    expect(computeNextOccurrenceAfter(s, "2028-01-31")).toBe("2028-02-29");
    expect(computeNextOccurrenceAfter(s, "2028-02-29")).toBe("2028-03-31");
    // The following February (2029) is not a leap year — confirms the
    // clamp isn't hardcoded to 29 either, it's genuinely re-derived from
    // getDaysInMonth every time.
    const yearLater = source({ frequency: "monthly", startDate: "2029-01-31" });
    expect(computeNextOccurrenceAfter(yearLater, "2029-01-31")).toBe(
      "2029-02-28",
    );
  });

  it("applies intervalCount to monthly-family cadences (e.g. every 2 months)", () => {
    const s = source({
      frequency: "monthly",
      intervalCount: 2,
      startDate: "2026-01-15",
    });
    expect(computeNextOccurrenceAfter(s, "2026-01-15")).toBe("2026-03-15");
    expect(computeNextOccurrenceAfter(s, "2026-03-15")).toBe("2026-05-15");
  });

  it("handles quarterly, half-yearly, and yearly", () => {
    expect(
      computeNextOccurrenceAfter(
        source({ frequency: "quarterly", startDate: "2026-01-15" }),
        "2026-01-15",
      ),
    ).toBe("2026-04-15");
    expect(
      computeNextOccurrenceAfter(
        source({ frequency: "half_yearly", startDate: "2026-01-15" }),
        "2026-01-15",
      ),
    ).toBe("2026-07-15");
    expect(
      computeNextOccurrenceAfter(
        source({ frequency: "yearly", startDate: "2026-01-15" }),
        "2026-01-15",
      ),
    ).toBe("2027-01-15");
  });

  it("returns null once the next occurrence would fall after endDate", () => {
    const s = source({
      frequency: "monthly",
      startDate: "2026-01-15",
      endDate: "2026-02-20",
    });
    expect(computeNextOccurrenceAfter(s, "2026-01-15")).toBe("2026-02-15");
    expect(computeNextOccurrenceAfter(s, "2026-02-15")).toBeNull();
  });

  it("is idempotent — repeatedly calling with the previous result never revisits or skips a date", () => {
    const s = source({ frequency: "monthly", startDate: "2026-01-31" });
    const occurrences: string[] = [s.startDate];
    let current = s.startDate;
    for (let i = 0; i < 12; i++) {
      const next = computeNextOccurrenceAfter(s, current);
      expect(next).not.toBeNull();
      occurrences.push(next!);
      current = next!;
    }
    // No duplicates, strictly increasing.
    expect(new Set(occurrences).size).toBe(occurrences.length);
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i]! > occurrences[i - 1]!).toBe(true);
    }
  });
});

describe("isRecurringMissed", () => {
  it("is not missed within the grace window", () => {
    expect(
      isRecurringMissed({
        nextDueDate: "2026-07-15",
        asOfDate: "2026-07-17",
        graceDays: 3,
      }),
    ).toBe(false);
  });

  it("is missed once the grace window has elapsed", () => {
    expect(
      isRecurringMissed({
        nextDueDate: "2026-07-15",
        asOfDate: "2026-07-19",
        graceDays: 3,
      }),
    ).toBe(true);
  });

  it("is not missed for a due date in the future", () => {
    expect(
      isRecurringMissed({ nextDueDate: "2026-08-01", asOfDate: "2026-07-21" }),
    ).toBe(false);
  });
});

describe("isRecurringUpcoming", () => {
  it("is upcoming when due today", () => {
    expect(
      isRecurringUpcoming({
        nextDueDate: "2026-07-21",
        asOfDate: "2026-07-21",
        daysAhead: 7,
      }),
    ).toBe(true);
  });

  it("is upcoming when due within the window", () => {
    expect(
      isRecurringUpcoming({
        nextDueDate: "2026-07-25",
        asOfDate: "2026-07-21",
        daysAhead: 7,
      }),
    ).toBe(true);
  });

  it("is not upcoming beyond the window", () => {
    expect(
      isRecurringUpcoming({
        nextDueDate: "2026-08-15",
        asOfDate: "2026-07-21",
        daysAhead: 7,
      }),
    ).toBe(false);
  });

  it("is not upcoming for a date already in the past", () => {
    expect(
      isRecurringUpcoming({
        nextDueDate: "2026-07-01",
        asOfDate: "2026-07-21",
        daysAhead: 7,
      }),
    ).toBe(false);
  });
});

describe("resolveAmountForDate", () => {
  it("returns the base amount when no schedule entries apply yet", () => {
    expect(
      resolveAmountForDate(
        10_000,
        [{ effectiveDate: "2026-09-01", amountMinorUnits: 15_000 }],
        "2026-08-01",
      ),
    ).toBe(10_000);
  });

  it("applies a scheduled change once its effective date arrives", () => {
    expect(
      resolveAmountForDate(
        10_000,
        [{ effectiveDate: "2026-09-01", amountMinorUnits: 15_000 }],
        "2026-09-01",
      ),
    ).toBe(15_000);
    expect(
      resolveAmountForDate(
        10_000,
        [{ effectiveDate: "2026-09-01", amountMinorUnits: 15_000 }],
        "2026-10-01",
      ),
    ).toBe(15_000);
  });

  it("uses the latest applicable schedule entry when several exist", () => {
    const schedule = [
      { effectiveDate: "2026-09-01", amountMinorUnits: 15_000 },
      { effectiveDate: "2026-11-01", amountMinorUnits: 20_000 },
    ];
    expect(resolveAmountForDate(10_000, schedule, "2026-08-15")).toBe(10_000);
    expect(resolveAmountForDate(10_000, schedule, "2026-09-15")).toBe(15_000);
    expect(resolveAmountForDate(10_000, schedule, "2026-12-01")).toBe(20_000);
  });

  it("never lets a future schedule entry affect an earlier occurrence — past occurrences are unaffected by later changes", () => {
    // A change scheduled for 2026-09-01, made *after* July's occurrence
    // was already generated, must never apply to July's date.
    const schedule = [
      { effectiveDate: "2026-09-01", amountMinorUnits: 15_000 },
    ];
    expect(resolveAmountForDate(10_000, schedule, "2026-07-15")).toBe(10_000);
  });
});
