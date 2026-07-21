/**
 * Number of minor-unit decimal places per ISO 4217 currency code, for the
 * currencies DhanOS is expected to encounter. Defaults to 2 for any code not
 * listed here (correct for the overwhelming majority of currencies).
 */
const MINOR_UNIT_EXPONENTS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  AED: 2,
  SGD: 2,
  AUD: 2,
  CAD: 2,
  JPY: 0,
  BHD: 3,
  KWD: 3,
};

const DEFAULT_MINOR_UNIT_EXPONENT = 2;

export function minorUnitExponent(currencyCode: string): number {
  return (
    MINOR_UNIT_EXPONENTS[currencyCode.toUpperCase()] ??
    DEFAULT_MINOR_UNIT_EXPONENT
  );
}

const ISO_CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

export function isValidCurrencyCode(value: string): boolean {
  return ISO_CURRENCY_CODE_PATTERN.test(value);
}
