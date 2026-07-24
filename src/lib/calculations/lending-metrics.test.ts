import { describe, expect, it } from "vitest";
import {
  computeLendingOverdue,
  computeLendingTotals,
  groupLendingByBorrower,
  isLendingUpcoming,
  type LendingForTotals,
} from "./lending-metrics";

const base: LendingForTotals = {
  currencyCode: "INR",
  status: "active",
  borrowerKey: "Alex",
  amountLentMinorUnits: 100_000,
  outstandingMinorUnits: 60_000,
  principalRecoveredMinorUnits: 40_000,
  interestReceivedMinorUnits: 2_000,
};

describe("computeLendingTotals", () => {
  it("filters to the requested currency", () => {
    const lendings = [base, { ...base, currencyCode: "USD" }];
    const totals = computeLendingTotals(lendings, "INR");
    expect(totals.totalLentMinorUnits).toBe(100_000);
  });

  it("sums outstanding only across currently-owed statuses", () => {
    const lendings = [
      base,
      { ...base, status: "repaid", outstandingMinorUnits: 0 },
      { ...base, status: "partially_repaid", outstandingMinorUnits: 30_000 },
    ];
    const totals = computeLendingTotals(lendings, "INR");
    expect(totals.totalOutstandingMinorUnits).toBe(90_000);
    expect(totals.currentlyOwedCount).toBe(2);
  });

  it("tracks written-off outstanding separately, never folded into current outstanding", () => {
    const lendings = [
      base,
      { ...base, status: "written_off", outstandingMinorUnits: 25_000 },
    ];
    const totals = computeLendingTotals(lendings, "INR");
    expect(totals.totalWrittenOffMinorUnits).toBe(25_000);
    expect(totals.totalOutstandingMinorUnits).toBe(60_000);
  });

  it("sums lifetime totals across every status", () => {
    const lendings = [
      base,
      { ...base, status: "repaid", outstandingMinorUnits: 0 },
    ];
    const totals = computeLendingTotals(lendings, "INR");
    expect(totals.totalLentMinorUnits).toBe(200_000);
    expect(totals.totalPrincipalRecoveredMinorUnits).toBe(80_000);
    expect(totals.totalInterestReceivedMinorUnits).toBe(4_000);
  });
});

describe("groupLendingByBorrower", () => {
  it("groups currently-owed outstanding by borrower, highest first", () => {
    const lendings = [
      base,
      { ...base, borrowerKey: "Sam", outstandingMinorUnits: 90_000 },
      { ...base, status: "repaid", outstandingMinorUnits: 0 },
    ];
    const rows = groupLendingByBorrower(lendings, "INR");
    expect(rows).toEqual([
      { key: "Sam", outstandingMinorUnits: 90_000, lendingCount: 1 },
      { key: "Alex", outstandingMinorUnits: 60_000, lendingCount: 1 },
    ]);
  });

  it("excludes repaid/written_off lendings from exposure", () => {
    const lendings = [{ ...base, status: "written_off" }];
    expect(groupLendingByBorrower(lendings, "INR")).toEqual([]);
  });
});

describe("computeLendingOverdue", () => {
  it("is overdue when the expected date has passed with outstanding remaining", () => {
    const result = computeLendingOverdue(
      { status: "active", expectedRepaymentDate: "2026-01-01" },
      60_000,
      "2026-01-15",
    );
    expect(result).toEqual({
      trackable: true,
      daysOverdue: 14,
      outstandingMinorUnits: 60_000,
    });
  });

  it("is not trackable when there's no expected date", () => {
    const result = computeLendingOverdue(
      { status: "active", expectedRepaymentDate: null },
      60_000,
      "2026-01-15",
    );
    expect(result).toEqual({ trackable: false, reason: "no_expected_date" });
  });

  it("is not trackable once fully recovered, even past the expected date", () => {
    const result = computeLendingOverdue(
      { status: "repaid", expectedRepaymentDate: "2026-01-01" },
      0,
      "2026-01-15",
    );
    expect(result).toEqual({
      trackable: false,
      reason: "not_currently_owed",
    });
  });

  it("is not trackable before the expected date arrives", () => {
    const result = computeLendingOverdue(
      { status: "active", expectedRepaymentDate: "2026-02-01" },
      60_000,
      "2026-01-15",
    );
    expect(result).toEqual({ trackable: false, reason: "not_yet_due" });
  });
});

describe("isLendingUpcoming", () => {
  it("is upcoming within the window", () => {
    expect(
      isLendingUpcoming(
        { status: "active", expectedRepaymentDate: "2026-01-20" },
        60_000,
        "2026-01-01",
        30,
      ),
    ).toBe(true);
  });

  it("is not upcoming beyond the window", () => {
    expect(
      isLendingUpcoming(
        { status: "active", expectedRepaymentDate: "2026-03-01" },
        60_000,
        "2026-01-01",
        30,
      ),
    ).toBe(false);
  });

  it("is not upcoming once already overdue", () => {
    expect(
      isLendingUpcoming(
        { status: "active", expectedRepaymentDate: "2025-12-01" },
        60_000,
        "2026-01-01",
        30,
      ),
    ).toBe(false);
  });

  it("is not upcoming once fully recovered", () => {
    expect(
      isLendingUpcoming(
        { status: "active", expectedRepaymentDate: "2026-01-10" },
        0,
        "2026-01-01",
        30,
      ),
    ).toBe(false);
  });
});
