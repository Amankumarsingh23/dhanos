"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EXPORT_GROUPS, type ExportTableKey } from "@/lib/validation/export";
import { exportHouseholdTablesCsvAction } from "./actions";

function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Settings > Data > Export, selected CSV files (PROMPT 42's other export
 * format, alongside ExportDataButton's JSON dump). Grouped checkboxes
 * mirror the prompt's own domain list (People, Institutions, Accounts,
 * ...) via src/lib/validation/export.ts's registry — the single source of
 * truth the server-side builder also reads from, so a group/label can
 * never drift from what the export action actually understands.
 *
 * One Server Action call covers every checked table, so a single
 * rate-limit check and activity event cover the whole batch; each
 * returned file is then downloaded as its own CSV — "selected CSV
 * files," plural, not one combined file.
 */
export function ExportCsvPanel({ householdId }: { householdId: string }) {
  const [selected, setSelected] = useState<Set<ExportTableKey>>(new Set());
  const [isPending, startTransition] = useTransition();

  function toggle(key: ExportTableKey, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(
      new Set<ExportTableKey>(
        EXPORT_GROUPS.flatMap((group) => group.tables.map((table) => table.key)),
      ),
    );
  }

  function clearAll() {
    setSelected(new Set());
  }

  function handleExport() {
    if (selected.size === 0) {
      toast.error("Select at least one table to export.");
      return;
    }

    startTransition(async () => {
      const result = await exportHouseholdTablesCsvAction(householdId, {
        tables: Array.from(selected),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const downloadable = result.data.files.filter(
        (file) => file.rowCount > 0,
      );
      for (const file of downloadable) {
        downloadCsvFile(file.filename, file.csv);
      }

      const emptyLabels = result.data.files
        .filter((file) => file.rowCount === 0)
        .map((file) => file.label);

      const messages: string[] = [];
      if (downloadable.length > 0) {
        messages.push(
          `Downloaded ${downloadable.length} CSV file${downloadable.length === 1 ? "" : "s"}.`,
        );
      }
      if (emptyLabels.length > 0) {
        messages.push(`No rows for: ${emptyLabels.join(", ")}.`);
      }
      if (result.data.failedTables.length > 0) {
        messages.push(
          `Couldn't read: ${result.data.failedTables.join(", ")}. Try again shortly.`,
        );
      }

      const summary = messages.join(" ");
      if (downloadable.length === 0) {
        toast.warning(summary || "No data to export for the selected tables.");
      } else if (emptyLabels.length > 0 || result.data.failedTables.length > 0) {
        toast.warning(summary);
      } else {
        toast.success(summary);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Choose which data to export as separate CSV files — useful for
          opening in a spreadsheet rather than the full JSON dump above.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            Clear
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EXPORT_GROUPS.map((group) => (
          <fieldset key={group.key} className="space-y-1.5">
            <legend className="text-sm font-medium">{group.label}</legend>
            {group.tables.map((table) => (
              <label
                key={table.key}
                className="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(table.key)}
                  onChange={(event) => toggle(table.key, event.target.checked)}
                  className="border-input size-4 rounded"
                />
                {table.label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleExport}
        disabled={isPending || selected.size === 0}
      >
        {isPending
          ? "Preparing CSV files…"
          : `Export selected as CSV${selected.size > 0 ? ` (${selected.size})` : ""}`}
      </Button>
    </div>
  );
}
