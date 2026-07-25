"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { archiveHouseholdAction } from "./actions";

type ArchiveHouseholdDialogProps = {
  householdId: string;
  householdName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * PROMPT 40's one "dangerous action" — safe by construction (only ever sets
 * households.deleted_at, never a hard delete — see archiveHouseholdAction).
 * Owner-only (enforced server-side; this dialog is only ever rendered for
 * an owner) and requires typing the household's exact current name, the
 * same "deliberate confirmation" shape as monthly closing's
 * ReopenClosingDialog.
 */
export function ArchiveHouseholdDialog({
  householdId,
  householdName,
  open,
  onOpenChange,
}: ArchiveHouseholdDialogProps) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setConfirmName("");
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await archiveHouseholdAction(householdId, {
        confirmName,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Household archived");
      handleOpenChange(false);
      router.push("/household-archived");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive {householdName}?</DialogTitle>
          <DialogDescription>
            Nothing is deleted — every account, transaction, and record
            stays exactly as it is. This just makes the household
            unreachable through the normal app for every member (including
            you) until support restores it. Type the household&rsquo;s
            exact name to confirm.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="confirmName">Household name</Label>
            <Input
              id="confirmName"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={householdName}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={isPending || confirmName !== householdName}
            >
              {isPending ? "Archiving…" : "Archive household"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
