"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportHouseholdDataAction } from "./actions";

/**
 * Settings > Data > Export, JSON format (PROMPT 40, rate-limited and
 * owner/admin-gated by PROMPT 42 — see exportHouseholdDataAction). No
 * amount is reformatted or reinterpreted here; every value downloaded is
 * exactly what's stored, plus an explicit schemaVersion and money/date
 * format notes (see src/features/settings/export/build.ts).
 */
export function ExportDataButton({ householdId }: { householdId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportHouseholdDataAction(householdId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `dhanos-export-${result.data.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      if (result.data.failedTables.length > 0) {
        toast.warning(
          `Export downloaded, but these tables couldn't be read and are empty in the file: ${result.data.failedTables.join(", ")}. Try again shortly.`,
        );
      } else if (result.data.truncatedTables.length > 0) {
        toast.warning(
          `Export downloaded, but truncated for: ${result.data.truncatedTables.join(", ")} (10,000-row cap per table).`,
        );
      } else {
        toast.success("Export downloaded");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleExport}
      disabled={isPending}
    >
      {isPending ? "Preparing export…" : "Export all data (JSON)"}
    </Button>
  );
}
