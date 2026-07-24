import { describe, expect, it } from "vitest";
import {
  computeNetWorthContributionMinorUnits,
  computeOwnedValueMinorUnits,
  isOwnershipUncertain,
  isValuationConfidenceVerified,
  type OwnershipStatus,
  type ValuationConfidence,
} from "./assets";

describe("isOwnershipUncertain", () => {
  it("is true for disputed and expected", () => {
    expect(isOwnershipUncertain("disputed")).toBe(true);
    expect(isOwnershipUncertain("expected")).toBe(true);
  });

  it("is false for every other status", () => {
    const statuses: OwnershipStatus[] = [
      "confirmed",
      "shared",
      "transfer_pending",
      "documentation_incomplete",
      "unknown",
    ];
    for (const status of statuses) {
      expect(isOwnershipUncertain(status)).toBe(false);
    }
  });
});

describe("computeOwnedValueMinorUnits", () => {
  it("scales value by ownership percentage", () => {
    expect(computeOwnedValueMinorUnits(10_000_000, 50)).toBe(5_000_000);
  });

  it("returns the full value at 100%", () => {
    expect(computeOwnedValueMinorUnits(10_000_000, 100)).toBe(10_000_000);
  });

  it("rounds a non-integral share to the nearest minor unit", () => {
    expect(computeOwnedValueMinorUnits(100, 33.33)).toBe(33);
  });
});

describe("computeNetWorthContributionMinorUnits", () => {
  const base = {
    valueMinorUnits: 10_000_000,
    ownershipPercentage: 100,
    ownershipStatus: "confirmed" as OwnershipStatus,
    includeInNetWorth: true,
  };

  it("returns the owned value for a confirmed, included asset", () => {
    expect(computeNetWorthContributionMinorUnits(base)).toBe(10_000_000);
  });

  it("scales by ownership percentage", () => {
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        ownershipPercentage: 40,
      }),
    ).toBe(4_000_000);
  });

  it("is 0 when excluded from net worth, regardless of ownership status", () => {
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        includeInNetWorth: false,
      }),
    ).toBe(0);
  });

  it("is 0 for disputed ownership even when included in net worth", () => {
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        ownershipStatus: "disputed",
      }),
    ).toBe(0);
  });

  it("is 0 for expected ownership even when included in net worth", () => {
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        ownershipStatus: "expected",
      }),
    ).toBe(0);
  });

  it("still counts a merely shared or unknown-status asset", () => {
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        ownershipStatus: "shared",
      }),
    ).toBe(10_000_000);
    expect(
      computeNetWorthContributionMinorUnits({
        ...base,
        ownershipStatus: "unknown",
      }),
    ).toBe(10_000_000);
  });
});

describe("isValuationConfidenceVerified", () => {
  it("is true only for verified", () => {
    expect(isValuationConfidenceVerified("verified")).toBe(true);
  });

  it("is false for every estimate-level confidence", () => {
    const estimateLevels: ValuationConfidence[] = [
      "professional",
      "informal_estimate",
      "unverified",
    ];
    for (const confidence of estimateLevels) {
      expect(isValuationConfidenceVerified(confidence)).toBe(false);
    }
  });
});
