import { format, parseISO } from "date-fns";

export {
  formatCompactMoney,
  money,
} from "@/features/dashboard/charts/chart-format";

/** "2026-07-22" -> "22 Jul" — the axis-tick label for a daily (not monthly) chart. */
export function formatDayTick(date: string): string {
  return format(parseISO(date), "d MMM");
}

/** "2026-07-22" -> "22 Jul 2026" — the full label used in tooltips and accessible summaries. */
export function formatDayLabel(date: string): string {
  return format(parseISO(date), "d MMM yyyy");
}
