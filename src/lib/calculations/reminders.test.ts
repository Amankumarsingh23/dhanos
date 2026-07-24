import { describe, expect, it } from "vitest";
import {
  classifyReminder,
  enumerateOccurrencesInWindow,
  generateAssetValuationReviewCandidates,
  generateDecisionReviewCandidates,
  generateDocumentExpiryCandidates,
  generateEmiDueCandidates,
  generateExpectedIncomeCandidates,
  generateFixedDepositMaturityCandidates,
  generateGoalReviewCandidates,
  generateInsurancePremiumCandidates,
  generateLendingRepaymentCandidates,
  generateLoanReviewCandidates,
  generateMonthlyClosingCandidates,
  generatePolicyRenewalCandidates,
  generateSipDueCandidates,
  type ReminderWindow,
} from "./reminders";

const WINDOW: ReminderWindow = {
  windowStart: "2026-06-21",
  windowEnd: "2026-10-19",
};

describe("classifyReminder", () => {
  const base = {
    status: "pending" as const,
    dueDate: "2026-07-20",
    snoozedUntil: null,
    asOfDate: "2026-07-21",
  };

  it("is completed/skipped regardless of date once the status says so", () => {
    expect(classifyReminder({ ...base, status: "completed" })).toBe(
      "completed",
    );
    expect(classifyReminder({ ...base, status: "skipped" })).toBe("skipped");
  });

  it("is snoozed while snoozedUntil is today or later", () => {
    expect(
      classifyReminder({ ...base, snoozedUntil: "2026-07-21" }),
    ).toBe("snoozed");
    expect(
      classifyReminder({ ...base, snoozedUntil: "2026-08-01" }),
    ).toBe("snoozed");
  });

  it("is no longer snoozed once snoozedUntil has passed", () => {
    expect(
      classifyReminder({ ...base, snoozedUntil: "2026-07-20" }),
    ).toBe("overdue");
  });

  it("is overdue when due before asOfDate, upcoming otherwise", () => {
    expect(classifyReminder({ ...base, dueDate: "2026-07-20" })).toBe(
      "overdue",
    );
    expect(classifyReminder({ ...base, dueDate: "2026-07-21" })).toBe(
      "upcoming",
    );
    expect(classifyReminder({ ...base, dueDate: "2026-07-22" })).toBe(
      "upcoming",
    );
  });
});

describe("enumerateOccurrencesInWindow", () => {
  it("includes an occurrence exactly on the window boundary", () => {
    const dates = enumerateOccurrencesInWindow(
      { frequency: "monthly", intervalCount: 1, startDate: "2026-06-21", endDate: null },
      WINDOW,
    );
    expect(dates[0]).toBe("2026-06-21");
  });

  it("clamps a day-31 start to the last day of shorter months without drifting later occurrences", () => {
    const dates = enumerateOccurrencesInWindow(
      { frequency: "monthly", intervalCount: 1, startDate: "2026-01-31", endDate: null },
      { windowStart: "2026-01-01", windowEnd: "2026-05-01" },
    );
    // Jan 31, Feb 28 (clamped), Mar 31 (back to 31st — no drift from Feb), Apr 30 (clamped)
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("stops at endDate", () => {
    const dates = enumerateOccurrencesInWindow(
      { frequency: "yearly", intervalCount: 1, startDate: "2020-03-01", endDate: "2027-03-01" },
      { windowStart: "2026-01-01", windowEnd: "2030-01-01" },
    );
    expect(dates).toEqual(["2026-03-01", "2027-03-01"]);
  });
});

describe("generateSipDueCandidates", () => {
  it("reports the single stored next_due_date when within the window and active", () => {
    const result = generateSipDueCandidates(
      [{ id: "sip-1", nextDueDate: "2026-07-05", status: "active" }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "sip-1", dueDate: "2026-07-05" }]);
  });

  it("skips a paused/completed SIP or one with no next_due_date", () => {
    const result = generateSipDueCandidates(
      [
        { id: "sip-2", nextDueDate: "2026-07-05", status: "paused" },
        { id: "sip-3", nextDueDate: null, status: "active" },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });

  it("excludes a next_due_date outside the window", () => {
    const result = generateSipDueCandidates(
      [{ id: "sip-4", nextDueDate: "2025-01-01", status: "active" }],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateEmiDueCandidates", () => {
  it("generates monthly occurrences anchored to repayment_start_date's day-of-month", () => {
    const result = generateEmiDueCandidates(
      [
        {
          id: "loan-1",
          repaymentStartDate: "2026-06-05",
          maturityDate: "2030-01-01",
          emiAmountMinorUnits: 500000,
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result.map((r) => r.dueDate)).toEqual([
      "2026-07-05",
      "2026-08-05",
      "2026-09-05",
      "2026-10-05",
    ]);
    expect(result.every((r) => r.entityId === "loan-1")).toBe(true);
  });

  it("skips a loan in moratorium (no EMI amount) or not active", () => {
    const result = generateEmiDueCandidates(
      [
        {
          id: "loan-2",
          repaymentStartDate: "2026-06-05",
          maturityDate: null,
          emiAmountMinorUnits: null,
          status: "active",
        },
        {
          id: "loan-3",
          repaymentStartDate: "2026-06-05",
          maturityDate: null,
          emiAmountMinorUnits: 500000,
          status: "closed",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateLoanReviewCandidates", () => {
  it("generates one annual occurrence anchored to start_date", () => {
    const result = generateLoanReviewCandidates(
      [
        {
          id: "loan-1",
          startDate: "2024-08-01",
          maturityDate: null,
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "loan-1", dueDate: "2026-08-01" }]);
  });
});

describe("generateInsurancePremiumCandidates", () => {
  it("steps quarterly from start_date", () => {
    const result = generateInsurancePremiumCandidates(
      [
        {
          id: "policy-1",
          startDate: "2026-01-15",
          premiumFrequency: "quarterly",
          renewalDate: null,
          expiryDate: null,
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result.map((r) => r.dueDate)).toEqual(["2026-07-15", "2026-10-15"]);
  });

  it("never produces a candidate for a one_time policy", () => {
    const result = generateInsurancePremiumCandidates(
      [
        {
          id: "policy-2",
          startDate: "2026-01-15",
          premiumFrequency: "one_time",
          renewalDate: null,
          expiryDate: null,
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generatePolicyRenewalCandidates", () => {
  it("prefers renewal_date over expiry_date", () => {
    const result = generatePolicyRenewalCandidates(
      [
        {
          id: "policy-1",
          renewalDate: "2026-07-10",
          expiryDate: "2026-08-01",
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "policy-1", dueDate: "2026-07-10" }]);
  });

  it("falls back to expiry_date when renewal_date is unset", () => {
    const result = generatePolicyRenewalCandidates(
      [
        {
          id: "policy-2",
          renewalDate: null,
          expiryDate: "2026-08-01",
          status: "active",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "policy-2", dueDate: "2026-08-01" }]);
  });
});

describe("generateExpectedIncomeCandidates", () => {
  it("enumerates every monthly occurrence in the window", () => {
    const result = generateExpectedIncomeCandidates(
      [
        {
          id: "income-1",
          frequency: "monthly",
          expectedDayOfMonth: 1,
          startDate: "2026-01-01",
          endDate: null,
          isActive: true,
        },
      ],
      WINDOW,
    );
    expect(result.map((r) => r.dueDate)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
    ]);
  });

  it("produces nothing for an irregular or inactive source", () => {
    const result = generateExpectedIncomeCandidates(
      [
        {
          id: "income-2",
          frequency: "irregular",
          expectedDayOfMonth: null,
          startDate: "2026-01-01",
          endDate: null,
          isActive: true,
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateLendingRepaymentCandidates", () => {
  it("includes an owed lending with an expected date in the window", () => {
    const result = generateLendingRepaymentCandidates(
      [
        {
          id: "lending-1",
          expectedRepaymentDate: "2026-07-15",
          status: "partially_repaid",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "lending-1", dueDate: "2026-07-15" }]);
  });

  it("excludes a fully repaid or written-off lending", () => {
    const result = generateLendingRepaymentCandidates(
      [
        { id: "lending-2", expectedRepaymentDate: "2026-07-15", status: "repaid" },
        { id: "lending-3", expectedRepaymentDate: "2026-07-15", status: "written_off" },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateDocumentExpiryCandidates", () => {
  it("includes an active document's expiry within the window", () => {
    const result = generateDocumentExpiryCandidates(
      [{ id: "doc-1", expiryDate: "2026-07-15", status: "active" }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "doc-1", dueDate: "2026-07-15" }]);
  });

  it("excludes an archived document", () => {
    const result = generateDocumentExpiryCandidates(
      [{ id: "doc-2", expiryDate: "2026-07-15", status: "archived" }],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateFixedDepositMaturityCandidates", () => {
  it("includes an open account's maturity date within the window", () => {
    const result = generateFixedDepositMaturityCandidates(
      [{ id: "acc-1", maturityDate: "2026-08-01", isActive: true }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "acc-1", dueDate: "2026-08-01" }]);
  });

  it("excludes a closed account", () => {
    const result = generateFixedDepositMaturityCandidates(
      [{ id: "acc-2", maturityDate: "2026-08-01", isActive: false }],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});

describe("generateGoalReviewCandidates", () => {
  it("steps quarterly from the goal's created_at date, only while active", () => {
    const result = generateGoalReviewCandidates(
      [
        {
          id: "goal-1",
          createdAtDate: "2026-01-21",
          targetDate: "2030-01-01",
          status: "active",
        },
        {
          id: "goal-2",
          createdAtDate: "2026-01-21",
          targetDate: "2030-01-01",
          status: "achieved",
        },
      ],
      WINDOW,
    );
    // Quarterly from 2026-01-21: ..., 2026-04-21, 2026-07-21, 2026-10-21 —
    // only 2026-07-21 falls inside this window (2026-10-21 is just past windowEnd).
    expect(result).toEqual([{ entityId: "goal-1", dueDate: "2026-07-21" }]);
  });
});

describe("generateMonthlyClosingCandidates", () => {
  it("flags every elapsed period within the lookback that has no closed/reopened row", () => {
    const result = generateMonthlyClosingCandidates(
      "household-1",
      new Set(),
      "2026-07-21",
      { windowStart: "2026-06-01", windowEnd: "2026-08-01" },
    );
    // June 2026 and May 2026 are both fully elapsed and unclosed; April 2026's
    // due date (2026-05-01) falls outside this particular window.
    expect(result).toEqual([
      { entityId: "household-1", dueDate: "2026-07-01" },
      { entityId: "household-1", dueDate: "2026-06-01" },
    ]);
  });

  it("does not flag a period that already has a closed/reopened row", () => {
    const result = generateMonthlyClosingCandidates(
      "household-1",
      new Set(["2026-06", "2026-05"]),
      "2026-07-21",
      { windowStart: "2026-06-01", windowEnd: "2026-08-01" },
    );
    expect(result).toEqual([]);
  });

  it("does not flag the current, still-in-progress month", () => {
    const result = generateMonthlyClosingCandidates(
      "household-1",
      new Set(),
      "2026-07-15",
      { windowStart: "2026-06-01", windowEnd: "2026-08-01" },
    );
    expect(result.some((r) => r.dueDate.startsWith("2026-08"))).toBe(false);
  });
});

describe("generateAssetValuationReviewCandidates", () => {
  it("anchors to the latest valuation date when present", () => {
    const result = generateAssetValuationReviewCandidates(
      [
        {
          id: "asset-1",
          createdAtDate: "2020-01-01",
          latestValuationDate: "2025-07-21",
        },
      ],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "asset-1", dueDate: "2026-07-21" }]);
  });

  it("falls back to created_at when never valued", () => {
    const result = generateAssetValuationReviewCandidates(
      [{ id: "asset-2", createdAtDate: "2025-07-01", latestValuationDate: null }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "asset-2", dueDate: "2026-07-01" }]);
  });

  it("stays a fixed yearly anniversary even for a long-neglected asset — never a moving target that would re-duplicate on every sync", () => {
    const result = generateAssetValuationReviewCandidates(
      [{ id: "asset-3", createdAtDate: "2018-08-01", latestValuationDate: null }],
      WINDOW,
    );
    // The anniversary landing inside this window is a single fixed date
    // (2026-08-01), not "today" — recomputing this a day later still
    // yields the same due date, so it never re-triggers the dedup constraint.
    expect(result).toEqual([{ entityId: "asset-3", dueDate: "2026-08-01" }]);
  });
});

describe("generateDecisionReviewCandidates", () => {
  it("includes a decided decision's review date within the window", () => {
    const result = generateDecisionReviewCandidates(
      [{ id: "decision-1", reviewDate: "2026-07-15", status: "decided" }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "decision-1", dueDate: "2026-07-15" }]);
  });

  it("includes an under_review decision too", () => {
    const result = generateDecisionReviewCandidates(
      [{ id: "decision-2", reviewDate: "2026-07-15", status: "under_review" }],
      WINDOW,
    );
    expect(result).toEqual([{ entityId: "decision-2", dueDate: "2026-07-15" }]);
  });

  it("excludes an open, reversed, or superseded decision", () => {
    const result = generateDecisionReviewCandidates(
      [
        { id: "decision-3", reviewDate: "2026-07-15", status: "open" },
        { id: "decision-4", reviewDate: "2026-07-15", status: "reversed" },
        { id: "decision-5", reviewDate: "2026-07-15", status: "superseded" },
      ],
      WINDOW,
    );
    expect(result).toEqual([]);
  });

  it("excludes a decision with no review date", () => {
    const result = generateDecisionReviewCandidates(
      [{ id: "decision-6", reviewDate: null, status: "decided" }],
      WINDOW,
    );
    expect(result).toEqual([]);
  });
});
