"use client";

import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CsvColumn, CsvRow } from "@/lib/reports/csv";
import type { ReportCell, ReportTableColumn, ReportTableRow } from "./types";

type ReportTableProps = {
  columns: readonly ReportTableColumn[];
  rows: readonly ReportTableRow[];
  csvColumns: readonly CsvColumn[];
  csvRows: readonly CsvRow[];
  exportFilename: string;
  emptyDescription?: string;
};

function renderCell(cell: ReportCell | undefined) {
  if (!cell) return null;
  if (cell.kind === "money") {
    return (
      <SensitiveAmount
        value={formatMoney({
          amountMinorUnits: cell.amountMinorUnits,
          currencyCode: cell.currencyCode,
        })}
      />
    );
  }
  if (cell.kind === "number") {
    return (
      <span>
        {cell.value}
        {cell.suffix ?? ""}
      </span>
    );
  }
  return <span>{cell.text}</span>;
}

/**
 * The reconciling table view every report renders alongside its chart —
 * "chart totals reconcile with tables" (PROMPT 36 acceptance criterion)
 * holds because every report in src/features/reports/queries.ts builds
 * `rows`/`tableRows`/`csvRows` from the exact same computation, never a
 * second, independently-fetched one. Money cells go through
 * SensitiveAmount, same privacy-mode concealment as every chart built on
 * ChartCard — a plain-text table sitting right next to a concealed chart
 * would otherwise defeat it completely.
 */
export function ReportTable({
  columns,
  rows,
  csvColumns,
  csvRows,
  exportFilename,
  emptyDescription = "No data for this selection yet.",
}: ReportTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Table view</h3>
        <ExportCsvButton
          filename={exportFilename}
          columns={csvColumns}
          rows={csvRows}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {emptyDescription}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      "px-4 py-2.5 font-medium",
                      column.align === "right" && "text-right",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row, index) => (
                // Report rows have no stable id of their own (a category name,
                // a month key, a status label) — index is stable since this
                // list never reorders within one render of one fetch.
                <tr key={index}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-4 py-2.5",
                        column.align === "right" && "text-right",
                      )}
                    >
                      {renderCell(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
