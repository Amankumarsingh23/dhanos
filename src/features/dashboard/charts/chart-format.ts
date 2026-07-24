import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/money";
import { minorUnitExponent } from "@/lib/money/currency";

/** "2026-07" -> "Jul 2026" — the full label used in tooltips and accessible summaries. */
export function formatMonthLabel(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMM yyyy");
}

/** "2026-07" -> "Jul" — the compact label used on chart axes. */
export function formatMonthTick(monthKey: string): string {
  return format(parseISO(`${monthKey}-01`), "MMM");
}

/**
 * A compact currency label for axis ticks (e.g. "₹1.2K") — never fed back
 * into a calculation, display only, same rule as formatMoney (see
 * docs/money-calculation-rules.md §1).
 */
export function formatCompactMoney(
  amountMinorUnits: number,
  currencyCode: string,
  locale = "en-IN",
): string {
  const exponent = minorUnitExponent(currencyCode);
  const majorUnits = amountMinorUnits / 10 ** exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(majorUnits);
}

/** Display-formatted money for tooltips — thin wrapper so chart files share one import. */
export function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}
