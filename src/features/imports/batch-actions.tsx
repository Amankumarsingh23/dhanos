"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { commitImportBatchAction, rollbackImportBatchAction } from "./actions";
import type { ImportBatchRecord } from "./queries";

export function BatchActions({
  householdId,
  batch,
  canWrite,
  canManage,
}: {
  householdId: string;
  batch: ImportBatchRecord;
  /** owner/admin/editor — same WRITE_ROLES gate as the Server Action itself. */
  canWrite: boolean;
  /** owner/admin only — rollback is deliberately stricter, mirroring the Settings dangerous-action pattern. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rollbackOpen, setRollbackOpen] = useState(false);

  function handleConfirm() {
    startTransition(async () => {
      const result = await commitImportBatchAction(householdId, {
        importBatchId: batch.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Imported ${result.data.importedCount} row(s)${result.data.rejectedCount > 0 ? `, ${result.data.rejectedCount} rejected` : ""}.`,
      );
      router.refresh();
    });
  }

  function handleRollback() {
    startTransition(async () => {
      const result = await rollbackImportBatchAction(householdId, {
        importBatchId: batch.id,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Import rolled back — its transactions were cancelled.");
      router.refresh();
    });
  }

  if (batch.status === "ready") {
    if (!canWrite) {
      return (
        <p className="text-muted-foreground text-xs">
          Only an owner, admin, or editor can confirm this import.
        </p>
      );
    }
    return (
      <Button type="button" onClick={handleConfirm} disabled={isPending}>
        {isPending ? "Importing…" : "Confirm import"}
      </Button>
    );
  }

  if (batch.status === "completed" && batch.import_type === "transactions") {
    if (!canManage) {
      return (
        <p className="text-muted-foreground text-xs">
          Only an owner or admin can roll back a completed import.
        </p>
      );
    }
    return (
      <>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setRollbackOpen(true)}
          disabled={isPending}
        >
          Roll back this import
        </Button>
        <ConfirmDialog
          open={rollbackOpen}
          onOpenChange={setRollbackOpen}
          title="Roll back this import?"
          description="Every transaction this import created will be marked cancelled (never deleted — its history stays visible). This does not undo edits you've made to those transactions since."
          confirmLabel="Roll back"
          destructive
          onConfirm={handleRollback}
        />
      </>
    );
  }

  if (batch.status === "completed") {
    return (
      <p className="text-muted-foreground text-xs">
        Balance and valuation snapshots are append-only history — this
        import can&rsquo;t be rolled back, only corrected with a new,
        separately-dated entry.
      </p>
    );
  }

  if (batch.status === "rolled_back") {
    return (
      <p className="text-muted-foreground text-xs">
        Rolled back on{" "}
        {batch.rolled_back_at
          ? new Date(batch.rolled_back_at).toLocaleString()
          : "an earlier date"}
        .
      </p>
    );
  }

  return null;
}
