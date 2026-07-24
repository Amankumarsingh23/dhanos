/**
 * Shared rate-sanity checks for the financial calculators (PROMPT 20):
 * "impossible rates or malformed values are rejected or warned about" — the
 * same acceptance criterion PROMPT 19 established for staking's daily rate
 * (see src/lib/calculations/staking-snapshot.ts's validateExpectedDailyRate,
 * re-exported below so a daily-rate calculator field uses the exact same
 * bounds as an actual staking position rather than a second, possibly
 * drifting copy of the same numbers).
 *
 * Annual rates get their own, wider bounds here: an annual rate is not a
 * daily rate multiplied or divided by 365 — PROMPT 20's "daily rates do not
 * accidentally become annual rates" is enforced structurally by never
 * sharing one function between the two, only the shared *shape* of the
 * result.
 */

export type RateValidation =
  { valid: true; warning: string | null } | { valid: false; reason: string };

export { validateExpectedDailyRate as validateDailyRate } from "@/lib/calculations/staking-snapshot";

/** A rate at or below this is impossible: (1 + rate) would be zero or negative, meaningless for compounding. */
const MIN_VALID_ANNUAL_RATE = -1;

/** An annual rate above this (1000%/year) is treated as a data-entry error, not a legitimate assumption. */
const MAX_VALID_ANNUAL_RATE = 10;

/** An annual rate beyond this magnitude (30%/year) is accepted but flagged — sustained returns this high are rare. */
const SUSPICIOUS_ANNUAL_RATE_MAGNITUDE = 0.3;

/**
 * Validates an annual rate (expected return, interest rate, inflation,
 * step-up, etc.) used as a calculator assumption. Never throws — callers
 * render `reason`/`warning` directly rather than catching an exception.
 */
export function validateAnnualRate(
  rate: number,
  label = "annual rate",
): RateValidation {
  if (!Number.isFinite(rate)) {
    return { valid: false, reason: `The ${label} must be a number.` };
  }
  if (rate <= MIN_VALID_ANNUAL_RATE) {
    return {
      valid: false,
      reason: `A ${label} of -100% or worse is impossible — that would mean losing the entire amount (or more) in a single year.`,
    };
  }
  if (rate > MAX_VALID_ANNUAL_RATE) {
    return {
      valid: false,
      reason: `A ${label} above ${(MAX_VALID_ANNUAL_RATE * 100).toFixed(0)}% isn't realistic — check whether this was entered as a whole-number percentage instead of a decimal.`,
    };
  }
  if (Math.abs(rate) > SUSPICIOUS_ANNUAL_RATE_MAGNITUDE) {
    return {
      valid: true,
      warning: `A ${label} of ${(rate * 100).toFixed(1)}% is unusually high to sustain year after year — double check this figure before relying on it.`,
    };
  }
  return { valid: true, warning: null };
}

/** A duration of zero or less produces no projection at all — treated as valid input (an empty result), not an error, per "zero ... edge cases are handled." */
export function validateDurationYears(years: number): RateValidation {
  if (!Number.isFinite(years) || years < 0) {
    return {
      valid: false,
      reason: "Duration must be zero or a positive number of years.",
    };
  }
  if (years > 100) {
    return {
      valid: false,
      reason:
        "Duration longer than 100 years isn't a realistic planning horizon.",
    };
  }
  return { valid: true, warning: null };
}
