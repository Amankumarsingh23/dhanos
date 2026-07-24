import { describe, expect, it } from "vitest";
import { validateAnnualRate, validateDurationYears } from "./rate-validation";

describe("validateAnnualRate", () => {
  it("accepts an ordinary annual rate with no warning", () => {
    const result = validateAnnualRate(0.1);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warning).toBeNull();
    }
  });

  it("rejects a rate of -100% or worse", () => {
    const result = validateAnnualRate(-1);
    expect(result.valid).toBe(false);
  });

  it("rejects a rate above the 1000% ceiling", () => {
    const result = validateAnnualRate(11);
    expect(result.valid).toBe(false);
  });

  it("warns on an unusually high but not impossible rate", () => {
    const result = validateAnnualRate(0.5);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.warning).not.toBeNull();
    }
  });

  it("rejects a non-finite rate", () => {
    const result = validateAnnualRate(Number.NaN);
    expect(result.valid).toBe(false);
  });
});

describe("validateDurationYears", () => {
  it("accepts zero as a valid (empty-projection) duration", () => {
    expect(validateDurationYears(0).valid).toBe(true);
  });

  it("rejects a negative duration", () => {
    expect(validateDurationYears(-1).valid).toBe(false);
  });

  it("rejects an unrealistically long duration", () => {
    expect(validateDurationYears(200).valid).toBe(false);
  });
});
