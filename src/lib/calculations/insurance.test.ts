import { describe, expect, it } from "vitest";
import {
  annualizePremiumMinorUnits,
  computeWaitingPeriodMilestoneDate,
  isPolicyPastRenewalDate,
  isRenewalDueSoon,
  isWaitingPeriodMilestoneUpcoming,
  isWaitingPeriodPassed,
  premiumOccurrencesPerYear,
} from "./insurance";

describe("premiumOccurrencesPerYear", () => {
  it("maps every cadence to occurrences per year", () => {
    expect(premiumOccurrencesPerYear("monthly")).toBe(12);
    expect(premiumOccurrencesPerYear("quarterly")).toBe(4);
    expect(premiumOccurrencesPerYear("half_yearly")).toBe(2);
    expect(premiumOccurrencesPerYear("yearly")).toBe(1);
    expect(premiumOccurrencesPerYear("one_time")).toBe(0);
  });
});

describe("annualizePremiumMinorUnits", () => {
  it("annualizes a monthly premium", () => {
    expect(annualizePremiumMinorUnits(1_000, "monthly")).toBe(12_000);
  });

  it("annualizes a quarterly premium", () => {
    expect(annualizePremiumMinorUnits(3_000, "quarterly")).toBe(12_000);
  });

  it("leaves a yearly premium unchanged", () => {
    expect(annualizePremiumMinorUnits(12_000, "yearly")).toBe(12_000);
  });

  it("excludes a one-time premium from the annualized total", () => {
    expect(annualizePremiumMinorUnits(50_000, "one_time")).toBe(0);
  });
});

describe("isRenewalDueSoon", () => {
  it("is due soon within the window", () => {
    expect(
      isRenewalDueSoon({ renewalOrExpiryDate: "2026-01-20" }, "2026-01-01", 30),
    ).toBe(true);
  });

  it("is not due soon beyond the window", () => {
    expect(
      isRenewalDueSoon({ renewalOrExpiryDate: "2026-03-01" }, "2026-01-01", 30),
    ).toBe(false);
  });

  it("is not due soon once the date has already passed", () => {
    expect(
      isRenewalDueSoon({ renewalOrExpiryDate: "2025-12-01" }, "2026-01-01", 30),
    ).toBe(false);
  });

  it("is not trackable with no date", () => {
    expect(isRenewalDueSoon({ renewalOrExpiryDate: null }, "2026-01-01")).toBe(
      false,
    );
  });
});

describe("isPolicyPastRenewalDate", () => {
  it("is true once the date has passed", () => {
    expect(
      isPolicyPastRenewalDate(
        { renewalOrExpiryDate: "2025-12-01" },
        "2026-01-01",
      ),
    ).toBe(true);
  });

  it("is false before the date arrives", () => {
    expect(
      isPolicyPastRenewalDate(
        { renewalOrExpiryDate: "2026-02-01" },
        "2026-01-01",
      ),
    ).toBe(false);
  });

  it("is false with no date", () => {
    expect(
      isPolicyPastRenewalDate({ renewalOrExpiryDate: null }, "2026-01-01"),
    ).toBe(false);
  });
});

describe("computeWaitingPeriodMilestoneDate", () => {
  it("adds whole months to the start date", () => {
    expect(computeWaitingPeriodMilestoneDate("2026-01-15", 48)).toBe(
      "2030-01-15",
    );
  });

  it("clamps a short-month landing the same way addMonths does", () => {
    // Jan 31 + 1 month clamps to Feb 28 (2027 is not a leap year).
    expect(computeWaitingPeriodMilestoneDate("2027-01-31", 1)).toBe(
      "2027-02-28",
    );
  });
});

describe("isWaitingPeriodPassed", () => {
  it("is true once the milestone date has arrived", () => {
    expect(isWaitingPeriodPassed("2026-01-01", "2026-01-01")).toBe(true);
    expect(isWaitingPeriodPassed("2025-12-01", "2026-01-01")).toBe(true);
  });

  it("is false before the milestone date", () => {
    expect(isWaitingPeriodPassed("2026-02-01", "2026-01-01")).toBe(false);
  });
});

describe("isWaitingPeriodMilestoneUpcoming", () => {
  it("is upcoming within the window", () => {
    expect(
      isWaitingPeriodMilestoneUpcoming("2026-03-01", "2026-01-01", 90),
    ).toBe(true);
  });

  it("is not upcoming beyond the window", () => {
    expect(
      isWaitingPeriodMilestoneUpcoming("2026-12-01", "2026-01-01", 90),
    ).toBe(false);
  });

  it("is not upcoming once the milestone has already passed", () => {
    expect(
      isWaitingPeriodMilestoneUpcoming("2025-12-01", "2026-01-01", 90),
    ).toBe(false);
  });
});
