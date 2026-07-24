/**
 * Pure arithmetic behind the staking/daily-value-tracking module (PROMPT
 * 19). No database access, so every function here is fully unit-testable
 * in isolation — the same "closing = opening + contribution + reward -
 * withdrawal - fee" equation this module validates is also enforced as a
 * database CHECK constraint (see
 * supabase/migrations/20260722130000_staking_positions.sql), so a
 * malformed row is rejected at the strongest possible layer; this module
 * exists so the *application* (a form, an import) can validate and
 * explain a mismatch *before* ever attempting the write, with a friendly
 * message instead of a raw constraint-violation error.
 */

export type SnapshotComponents = {
  openingValueMinorUnits: number;
  contributionMinorUnits: number;
  withdrawalMinorUnits: number;
  rewardMinorUnits: number;
  feeMinorUnits: number;
};

/** closing = opening + contribution + reward - withdrawal - fee — PROMPT 19's exact equation. */
export function computeClosingValue(components: SnapshotComponents): number {
  return (
    components.openingValueMinorUnits +
    components.contributionMinorUnits +
    components.rewardMinorUnits -
    components.withdrawalMinorUnits -
    components.feeMinorUnits
  );
}

/** True when a proposed closingValueMinorUnits exactly matches what the five components compute to. */
export function validateClosingValue(
  components: SnapshotComponents,
  closingValueMinorUnits: number,
): boolean {
  return computeClosingValue(components) === closingValueMinorUnits;
}

export type ExpectedDailyRateValidation =
  { valid: true; warning: string | null } | { valid: false; reason: string };

/**
 * A daily rate at or beyond this is impossible, not just unlikely: -100%
 * would mean the position lost its entire value (or more) in a single
 * day, which cannot happen for money already denominated in the position
 * itself (a balance cannot go negative from a percentage decline).
 */
const MIN_VALID_DAILY_RATE = -1;

/**
 * A daily rate above this is rejected outright, not merely warned about —
 * PROMPT 19 "impossible rates ... are rejected." +50%/day compounds to an
 * ~4.15x return in a single week; nothing legitimate approaches this
 * sustained daily, so a value here is treated as a data-entry error (most
 * commonly: a percentage typed as a whole number, e.g. "5" meaning 5%
 * instead of the decimal 0.05).
 */
const MAX_VALID_DAILY_RATE = 0.5;

/** A daily rate beyond this magnitude is still accepted, but flagged — PROMPT 19 "high-return warning." */
const SUSPICIOUS_DAILY_RATE_MAGNITUDE = 0.05;

/**
 * Validates an expected daily rate — PROMPT 19: "Do not implement...
 * incorrectly... impossible rates ... are rejected or warned about."
 * Never throws; returns a typed result so the caller can show a specific
 * message rather than a generic form error.
 */
export function validateExpectedDailyRate(
  rate: number,
): ExpectedDailyRateValidation {
  if (!Number.isFinite(rate)) {
    return {
      valid: false,
      reason: "The expected daily rate must be a number.",
    };
  }
  if (rate <= MIN_VALID_DAILY_RATE) {
    return {
      valid: false,
      reason:
        "A daily rate of -100% or worse is impossible — that would mean losing the entire position (or more) in a single day.",
    };
  }
  if (rate > MAX_VALID_DAILY_RATE) {
    return {
      valid: false,
      reason: `A daily rate above ${(MAX_VALID_DAILY_RATE * 100).toFixed(0)}% isn't realistic for a real position — check whether this was entered as a whole-number percentage (e.g. "5") instead of a decimal (0.05 for 5%).`,
    };
  }
  if (Math.abs(rate) > SUSPICIOUS_DAILY_RATE_MAGNITUDE) {
    return {
      valid: true,
      warning: `A daily rate of ${(rate * 100).toFixed(2)}% compounds very quickly (see the expected-projection chart) — double check this figure before relying on it.`,
    };
  }
  return { valid: true, warning: null };
}

export type ExpectedProjectionPoint = {
  dayIndex: number;
  expectedValueMinorUnits: number;
};

/**
 * Projects the opening principal forward via **daily compounding** at a
 * fixed `expectedDailyRate` for `days` days: `expected_n = principal *
 * (1 + rate) ^ n`. Each point is computed directly from the original
 * principal (a closed-form power, not an iterative running multiplication)
 * so rounding at one day can never drift into the next day's figure.
 *
 * This is **always an assumption, never a guarantee** (PROMPT 19:
 * "expected return must never be shown as guaranteed") — the caller must
 * render it as a visually distinct (e.g. dashed) projection line, never
 * merged with actual data into one series that could be mistaken for a
 * single ground truth (docs/money-calculation-rules.md §4).
 *
 * Callers should validate `expectedDailyRate` with
 * `validateExpectedDailyRate` first — this function does not re-validate
 * (it may be called with a real, already-accepted rate, or with a
 * hypothetical one for a "what if" preview).
 */
export function computeExpectedProjection(
  openingPrincipalMinorUnits: number,
  expectedDailyRate: number,
  days: number,
): ExpectedProjectionPoint[] {
  const points: ExpectedProjectionPoint[] = [];
  for (let day = 0; day <= days; day++) {
    const preciseValue =
      openingPrincipalMinorUnits * Math.pow(1 + expectedDailyRate, day);
    const roundedValue = Number.isFinite(preciseValue)
      ? Math.round(preciseValue)
      : preciseValue > 0
        ? Number.MAX_SAFE_INTEGER
        : 0;
    points.push({ dayIndex: day, expectedValueMinorUnits: roundedValue });
  }
  return points;
}
