"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrivacy } from "@/components/shared/privacy-provider";
import { buildCsv, type CsvColumn, type CsvRow } from "@/lib/reports/csv";

type ExportCsvButtonProps = {
  filename: string;
  columns: readonly CsvColumn[];
  rows: readonly CsvRow[];
};

/**
 * "Exportable table view exists where practical" (PROMPT 36). Disabled
 * while privacy mode is on — the exact same amounts sit right next to it
 * concealed as "••••••"; letting the button still download real figures
 * would defeat the point of concealing them in the first place, the same
 * "never let a real figure escape while concealed" rule ChartCard and
 * SensitiveAmount already enforce.
 */
export function ExportCsvButton({
  filename,
  columns,
  rows,
}: ExportCsvButtonProps) {
  const { concealed } = usePrivacy();
  const disabled = concealed || rows.length === 0;

  function handleExport() {
    const csv = buildCsv(columns, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled}
      title={concealed ? "Turn off privacy mode to export" : undefined}
    >
      <DownloadIcon data-icon="inline-start" />
      Export CSV
    </Button>
  );
}
