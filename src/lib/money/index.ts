import { ValidationError } from "@/lib/errors/app-error";
import { isValidCurrencyCode, minorUnitExponent } from "./currency";
import type { Money } from "./types";

export type { Money } from "./types";

function assertValidMoney(
  amountMinorUnits: number,
  currencyCode: string,
): void {
  if (
    !Number.isInteger(amountMinorUnits) ||
    !Number.isSafeInteger(amountMinorUnits)
  ) {
    throw new ValidationError(
      `Money amounts must be safe integers in minor units; received ${amountMinorUnits}.`,
    );
  }
  if (!isValidCurrencyCode(currencyCode)) {
    throw new ValidationError(
      `"${currencyCode}" is not a valid ISO 4217 currency code (expected e.g. "INR", "USD").`,
    );
  }
}

/** Constructs a Money value, rejecting non-integer amounts and invalid currency codes. */
export function createMoney(
  amountMinorUnits: number,
  currencyCode: string,
): Money {
  const normalized = currencyCode.toUpperCase();
  assertValidMoney(amountMinorUnits, normalized);
  return { amountMinorUnits, currencyCode: normalized };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currencyCode !== b.currencyCode) {
    throw new ValidationError(
      `Cannot combine amounts in different currencies (${a.currencyCode} and ${b.currencyCode}) without an explicit conversion.`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinorUnits + b.amountMinorUnits, a.currencyCode);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return createMoney(a.amountMinorUnits - b.amountMinorUnits, a.currencyCode);
}

export function negateMoney(money: Money): Money {
  return createMoney(-money.amountMinorUnits, money.currencyCode);
}

export function isZeroMoney(money: Money): boolean {
  return money.amountMinorUnits === 0;
}

/** Compares two amounts of the same currency: negative if a < b, 0 if equal, positive if a > b. */
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amountMinorUnits - b.amountMinorUnits;
}

export function sumMoney(
  amounts: readonly Money[],
  currencyCode: string,
): Money {
  const normalized = currencyCode.toUpperCase();
  return amounts.reduce(
    (total, next) => addMoney(total, next),
    createMoney(0, normalized),
  );
}

/**
 * Formats a Money value for display using `Intl.NumberFormat`. This is the
 * only place minor units should ever be divided into major units — the
 * result is a display string, never fed back into a calculation.
 * See docs/money-calculation-rules.md §1.
 */
export function formatMoney(money: Money, locale = "en-IN"): string {
  const exponent = minorUnitExponent(money.currencyCode);
  const majorUnits = money.amountMinorUnits / 10 ** exponent;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(majorUnits);
}

/**
 * Parses a user-typed decimal amount (e.g. "100.25", "0.01") into integer
 * minor units for the given currency — the only place user-facing decimal
 * input should ever be converted into the authoritative integer
 * representation (see docs/money-calculation-rules.md §1). Deliberately
 * strict: no thousands-grouping ambiguity, no more fractional digits than
 * the currency supports, no scientific notation, no empty string. Uses
 * string-splitting rather than `Number(input) * 10 ** exponent` so the
 * result can never pick up binary-float rounding error from the
 * multiplication itself.
 */
export function parseDecimalToMinorUnits(
  input: string,
  currencyCode: string,
): number {
  const exponent = minorUnitExponent(currencyCode);
  // Commas are accepted only as a thousands grouping separator (e.g.
  // "1,234.56"), stripped before validation — never as a decimal separator,
  // which would be locale-ambiguous.
  const trimmed = input.trim().replace(/,/g, "");

  if (trimmed === "") {
    throw new ValidationError("Enter an amount.");
  }

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new ValidationError(`"${input}" is not a valid amount.`);
  }

  const [, sign, wholePart, fractionPart = ""] = match;
  if (fractionPart.length > exponent) {
    throw new ValidationError(
      `"${input}" has more decimal places than ${currencyCode.toUpperCase()} supports (${exponent}).`,
    );
  }

  const digits = `${wholePart}${fractionPart.padEnd(exponent, "0")}`;
  // Strip leading zeros before parsing so e.g. "0100" -> 100 rather than an
  // octal-looking literal; Number() on a plain digit string is safe either
  // way, this just keeps the intermediate value easy to reason about.
  const amount = Number(digits);

  if (!Number.isSafeInteger(amount)) {
    throw new ValidationError(`"${input}" is too large to represent safely.`);
  }

  return sign === "-" ? -amount : amount;
}

/**
 * Formats a ratio (0.1 = 10%) for display. Like formatMoney, this is a
 * display-only conversion — never feed the formatted string back into a
 * calculation. See docs/money-calculation-rules.md §4 for the related rule
 * that any assumption/rate used in a calculator must be shown, not hidden.
 */
export function formatPercentage(
  ratio: number,
  options: { locale?: string; maximumFractionDigits?: number } = {},
): string {
  const { locale = "en-IN", maximumFractionDigits = 1 } = options;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(ratio);
}

/**
 * A safe ratio of two same-currency amounts (e.g. "how much of this budget
 * category have I spent"). Returns 0 rather than NaN/Infinity when the
 * denominator is zero — a zero-budget category is "0% used," not an error
 * state a caller needs to special-case before every division.
 */
export function calculateRatio(numerator: Money, denominator: Money): number {
  assertSameCurrency(numerator, denominator);
  if (denominator.amountMinorUnits === 0) {
    return 0;
  }
  return numerator.amountMinorUnits / denominator.amountMinorUnits;
}

/**
 * Splits `total` across `weights` (proportional shares, not required to sum
 * to 1) using the largest-remainder method: each share is floored, then the
 * few leftover minor units are handed out one at a time to the shares with
 * the largest fractional remainder. Every output amount is within 1 minor
 * unit of its exact proportional share, and — unlike naively rounding each
 * share independently — the shares always sum back to exactly `total`, so
 * splitting e.g. ₹100.01 three ways never drops or invents a paisa.
 */
export function allocateMoney(
  total: Money,
  weights: readonly number[],
): Money[] {
  if (weights.length === 0) {
    throw new ValidationError("Cannot allocate money across zero shares.");
  }
  if (weights.some((weight) => weight < 0)) {
    throw new ValidationError("Allocation weights must not be negative.");
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    throw new ValidationError(
      "Allocation weights must sum to a positive number.",
    );
  }

  const sign = total.amountMinorUnits < 0 ? -1 : 1;
  const absoluteAmount = Math.abs(total.amountMinorUnits);

  const rawShares = weights.map(
    (weight) => (absoluteAmount * weight) / totalWeight,
  );
  const flooredShares = rawShares.map(Math.floor);
  let remainder =
    absoluteAmount - flooredShares.reduce((sum, share) => sum + share, 0);

  const byRemainingFraction = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  const shares = [...flooredShares];
  for (const { index } of byRemainingFraction) {
    if (remainder <= 0) {
      break;
    }
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares.map((share) => createMoney(sign * share, total.currencyCode));
}
