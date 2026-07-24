import type { CsvColumn, CsvRow } from "@/lib/reports/csv";

/**
 * Shared table/export shape every report in queries.ts returns. A table
 * cell carries its *raw* value (never a pre-formatted, already-concealed
 * string) so ReportTable (src/features/reports/report-table.tsx) is the
 * one place that both formats money and applies privacy-mode concealment
 * — the same "conceal at render time, not at fetch time" rule
 * SensitiveAmount/ChartCard already follow.
 */
export type ReportCell =
  | { kind: "text"; text: string }
  | { kind: "money"; amountMinorUnits: number; currencyCode: string }
  | { kind: "number"; value: number; suffix?: string };

export function textCell(text: string): ReportCell {
  return { kind: "text", text };
}
export function moneyCell(
  amountMinorUnits: number,
  currencyCode: string,
): ReportCell {
  return { kind: "money", amountMinorUnits, currencyCode };
}
export function numberCell(value: number, suffix?: string): ReportCell {
  return { kind: "number", value, suffix };
}

export type ReportTableColumn = {
  key: string;
  label: string;
  align?: "right";
};

export type ReportTableRow = Record<string, ReportCell>;

/**
 * The common envelope every report's fetch function returns, alongside
 * whatever report-specific chart-ready data it also includes. `tableRows`
 * and `csvRows`/`csvColumns` are always built from the *same* underlying
 * figures the chart itself renders — never a second, separately-fetched
 * computation — which is what "chart totals reconcile with tables"
 * (PROMPT 36 acceptance criterion) rests on structurally rather than by
 * careful bookkeeping.
 */
export type ReportTableData = {
  tableColumns: readonly ReportTableColumn[];
  tableRows: readonly ReportTableRow[];
  csvColumns: readonly CsvColumn[];
  csvRows: readonly CsvRow[];
};

export type ReportMeta = {
  dateRangeLabel: string;
  dataCutoffLabel: string;
  currencyCode: string;
};
