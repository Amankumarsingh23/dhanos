import { parseDecimalToMinorUnits } from "@/lib/money";

/**
 * Parses a user-typed decimal amount into integer minor units, returning
 * `null` for anything unparseable instead of throwing — every calculator
 * recomputes live on each keystroke, so a transiently-invalid value (e.g.
 * "1." mid-type, or an empty field) must fail quietly rather than crash
 * the component.
 */
export function tryParseAmount(
  input: string,
  currencyCode: string,
): number | null {
  try {
    return parseDecimalToMinorUnits(input, currencyCode);
  } catch {
    return null;
  }
}

/**
 * Parses a whole-number-style percentage input (e.g. "12" for 12%) into
 * the decimal fraction every calculation module expects (0.12) — the same
 * "percent field, divided by 100 at the boundary" convention
 * src/lib/validation/staking.ts's expectedDailyRatePercent established.
 */
export function tryParsePercent(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value / 100;
}

export function tryParseInteger(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export function tryParseDecimalYears(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
}
