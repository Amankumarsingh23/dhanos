import { describe, expect, it } from "vitest";
import {
  computeClosingValue,
  computeExpectedProjection,
  validateClosingValue,
  validateExpectedDailyRate,
} from "./staking-snapshot";

describe("computeClosingValue / validateClosingValue", () => {
  it("computes closing = opening + contribution + reward - withdrawal - fee", () => {
    expect(
      computeClosingValue({
        openingValueMinorUnits: 10000000,
        contributionMinorUnits: 0,
        withdrawalMinorUnits: 0,
        rewardMinorUnits: 5000,
        feeMinorUnits: 0,
      }),
    ).toBe(10005000);
  });

  it("accounts for a contribution, a withdrawal, and a fee together", () => {
    expect(
      computeClosingValue({
        openingValueMinorUnits: 10000000,
        contributionMinorUnits: 200000,
        withdrawalMinorUnits: 100000,
        rewardMinorUnits: 8000,
        feeMinorUnits: 500,
      }),
    ).toBe(10107500);
  });

  it("allows a negative reward (a slashing/penalty event)", () => {
    expect(
      computeClosingValue({
        openingValueMinorUnits: 10000000,
        contributionMinorUnits: 0,
        withdrawalMinorUnits: 0,
        rewardMinorUnits: -50000,
        feeMinorUnits: 0,
      }),
    ).toBe(9950000);
  });

  it("validateClosingValue confirms a balanced closing value and rejects a mismatched one", () => {
    const components = {
      openingValueMinorUnits: 10000000,
      contributionMinorUnits: 0,
      withdrawalMinorUnits: 0,
      rewardMinorUnits: 5000,
      feeMinorUnits: 0,
    };
    expect(validateClosingValue(components, 10005000)).toBe(true);
    expect(validateClosingValue(components, 10000000)).toBe(false);
  });
});

describe("validateExpectedDailyRate", () => {
  it("accepts a normal, modest daily rate with no warning", () => {
    const result = validateExpectedDailyRate(0.0005);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warning).toBeNull();
    }
  });

  it("accepts but warns on a high (but not impossible) daily rate", () => {
    const result = validateExpectedDailyRate(0.1);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warning).not.toBeNull();
      expect(result.warning).toMatch(/compounds very quickly/i);
    }
  });

  it("rejects a rate of exactly -100% or worse — impossible, not just unlikely", () => {
    expect(validateExpectedDailyRate(-1).valid).toBe(false);
    expect(validateExpectedDailyRate(-1.5).valid).toBe(false);
  });

  it("rejects a rate above +50%/day as implausible", () => {
    const result = validateExpectedDailyRate(0.51);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/whole-number percentage/i);
    }
  });

  it("rejects a common data-entry mistake: '5' meaning 5% typed as the decimal 5", () => {
    // A household meaning 5%/day types "5" instead of "0.05" — this must
    // be rejected outright, matching the acceptance criterion "impossible
    // rates ... are rejected."
    expect(validateExpectedDailyRate(5).valid).toBe(false);
  });

  it("rejects a non-finite rate", () => {
    expect(validateExpectedDailyRate(NaN).valid).toBe(false);
    expect(validateExpectedDailyRate(Infinity).valid).toBe(false);
  });

  it("accepts the exact boundary values", () => {
    // Just inside the valid range on both ends.
    expect(validateExpectedDailyRate(-0.999999).valid).toBe(true);
    expect(validateExpectedDailyRate(0.5).valid).toBe(true);
  });
});

describe("computeExpectedProjection — daily compounding", () => {
  it("day 0 is always exactly the opening principal, regardless of rate", () => {
    const points = computeExpectedProjection(1_000_000, 0.01, 10);
    expect(points[0]).toEqual({
      dayIndex: 0,
      expectedValueMinorUnits: 1_000_000,
    });
  });

  it("a zero rate produces a flat line at the opening principal", () => {
    const points = computeExpectedProjection(1_000_000, 0, 30);
    for (const point of points) {
      expect(point.expectedValueMinorUnits).toBe(1_000_000);
    }
  });

  it("compounds a known daily rate to the expected multiple after one year", () => {
    // Solve for the exact daily rate that doubles the principal in 365
    // days, then verify computeExpectedProjection reproduces that double
    // at day 365 — an analytically-anchored check, not just internal
    // self-consistency.
    const rate = Math.pow(2, 1 / 365) - 1;
    const points = computeExpectedProjection(1_000_000, rate, 365);
    const day365 = points[365];
    expect(day365?.dayIndex).toBe(365);
    expect(day365?.expectedValueMinorUnits).toBeCloseTo(2_000_000, -1); // within ~10 minor units of exactly double
  });

  it("a negative rate produces monotonically decreasing values", () => {
    const points = computeExpectedProjection(1_000_000, -0.01, 20);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.expectedValueMinorUnits).toBeLessThan(
        points[i - 1]!.expectedValueMinorUnits,
      );
    }
  });

  it("rounding at one day never drifts into the next day's figure (each point is independently exact)", () => {
    // A rate chosen to produce awkward fractional cents at several days —
    // verify each point matches the direct closed-form formula exactly,
    // not an accumulated running product.
    const principal = 333_333;
    const rate = 0.0033;
    const points = computeExpectedProjection(principal, rate, 5);
    for (const point of points) {
      const expected = Math.round(
        principal * Math.pow(1 + rate, point.dayIndex),
      );
      expect(point.expectedValueMinorUnits).toBe(expected);
    }
  });

  it("never produces NaN or a crash for an extreme (but schema-valid) rate over many days", () => {
    const points = computeExpectedProjection(1_000_000, 0.5, 365);
    for (const point of points) {
      expect(Number.isNaN(point.expectedValueMinorUnits)).toBe(false);
      expect(Number.isFinite(point.expectedValueMinorUnits)).toBe(true);
    }
  });

  it("produces exactly days + 1 points (day 0 through day `days` inclusive)", () => {
    const points = computeExpectedProjection(1_000_000, 0.01, 7);
    expect(points).toHaveLength(8);
    expect(points.map((p) => p.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
