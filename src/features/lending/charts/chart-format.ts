import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/money";
import { minorUnitExponent } from "@/lib/money/currency";

export function formatDayLabel(date: string): string {
  return format(parseISO(date), "d MMM yyyy");
}

export function formatDayTick(date: string): string {
  return format(parseISO(date), "d MMM");
}

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

export function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}
