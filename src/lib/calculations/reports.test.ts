import { describe, expect, it } from "vitest";
import {
  computeOverallSipConsistency,
  computeSipConsistency,
  type SipScheduleSource,
} from "./reports";

const WINDOW = { windowStart: "2026-01-01", windowEnd: "2026-06-30" };

function sip(overrides: Partial<SipScheduleSource> = {}): SipScheduleSource {
  return {
    id: "sip-1",
    name: "Axis Bluechip",
    currencyCode: "INR",
    schedule: {
      frequency: "monthly",
      intervalCount: 1,
      startDate: "2026-01-05",
      endDate: null,
    },
    ...overrides,
  };
}

describe("computeSipConsistency", () => {
  it("reports 100% when every expected occurrence has a matching contribution", () => {
    const rows = computeSipConsistency(
      [sip()],
      [
        { sipId: "sip-1" },
        { sipId: "sip-1" },
        { sipId: "sip-1" },
        { sipId: "sip-1" },
        { sipId: "sip-1" },
        { sipId: "sip-1" },
      ],
      WINDOW,
    );
    expect(rows[0]?.expectedCount).toBe(6);
    expect(rows[0]?.completedCount).toBe(6);
    expect(rows[0]?.consistencyPercentage).toBe(100);
  });

  it("reports a partial percentage when some occurrences have no contribution", () => {
    const rows = computeSipConsistency(
      [sip()],
      [{ sipId: "sip-1" }, { sipId: "sip-1" }, { sipId: "sip-1" }],
      WINDOW,
    );
    expect(rows[0]?.expectedCount).toBe(6);
    expect(rows[0]?.completedCount).toBe(3);
    expect(rows[0]?.consistencyPercentage).toBe(50);
  });

  it("caps at 100% rather than exceeding it for extra contributions", () => {
    const rows = computeSipConsistency(
      [sip()],
      Array.from({ length: 10 }, () => ({ sipId: "sip-1" })),
      WINDOW,
    );
    expect(rows[0]?.completedCount).toBe(10);
    expect(rows[0]?.consistencyPercentage).toBe(100);
  });

  it("is null, not 0, when nothing was expected in the window", () => {
    const rows = computeSipConsistency(
      [sip({ schedule: { frequency: "monthly", intervalCount: 1, startDate: "2027-01-01", endDate: null } })],
      [],
      WINDOW,
    );
    expect(rows[0]?.expectedCount).toBe(0);
    expect(rows[0]?.consistencyPercentage).toBeNull();
  });

  it("is 0%, not null, when occurrences were expected but none were completed", () => {
    const rows = computeSipConsistency([sip()], [], WINDOW);
    expect(rows[0]?.expectedCount).toBe(6);
    expect(rows[0]?.consistencyPercentage).toBe(0);
  });

  it("never attributes one SIP's contributions to another", () => {
    const rows = computeSipConsistency(
      [sip({ id: "sip-1" }), sip({ id: "sip-2", name: "Other Fund" })],
      [{ sipId: "sip-1" }, { sipId: "sip-1" }],
      WINDOW,
    );
    const sip1 = rows.find((r) => r.sipId === "sip-1");
    const sip2 = rows.find((r) => r.sipId === "sip-2");
    expect(sip1?.completedCount).toBe(2);
    expect(sip2?.completedCount).toBe(0);
  });
});

describe("computeOverallSipConsistency", () => {
  it("weights by occurrence count rather than averaging percentages", () => {
    // SIP A: 1 expected, 1 completed (100%). SIP B: 11 expected, 0 completed (0%).
    // A plain average of percentages would say 50%; weighted, it's 1/12 ≈ 8%.
    const overall = computeOverallSipConsistency([
      { sipId: "a", sipName: "A", currencyCode: "INR", expectedCount: 1, completedCount: 1, consistencyPercentage: 100 },
      { sipId: "b", sipName: "B", currencyCode: "INR", expectedCount: 11, completedCount: 0, consistencyPercentage: 0 },
    ]);
    expect(overall).toBe(8);
  });

  it("is null when nothing was expected across any SIP", () => {
    expect(computeOverallSipConsistency([])).toBeNull();
  });

  it("never lets one SIP's overcompletion inflate the household total past 100%", () => {
    const overall = computeOverallSipConsistency([
      { sipId: "a", sipName: "A", currencyCode: "INR", expectedCount: 1, completedCount: 10, consistencyPercentage: 100 },
    ]);
    expect(overall).toBe(100);
  });
});
