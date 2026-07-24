"use client";

import { useState, useTransition } from "react";
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
import { reopenMonthlyClosingAction } from "./actions";

type ReopenClosingDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyClosingId: string;
  period: string;
  onReopened?: () => void;
};

/**
 * "Reopening requires deliberate confirmation" (PROMPT 33 acceptance
 * criterion) — a typed reason is always required, mirroring
 * liabilities'/lending's own reversal-reason dialogs, so reopening a
 * closed month is never a single accidental click.
 */
export function ReopenClosingDialog({
  householdId,
  open,
  onOpenChange,
  monthlyClosingId,
  period,
  onReopened,
}: ReopenClosingDialogProps) {
  const [reopenReason, setReopenReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setReopenReason("");
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reopenReason.trim()) {
      setFormError("Explain why this closing needs to be reopened.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await reopenMonthlyClosingAction(householdId, {
        monthlyClosingId,
        reopenReason,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Closing reopened");
      handleOpenChange(false);
      onReopened?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reopen {period}?</DialogTitle>
          <DialogDescription>
            Reopening lets you correct underlying data for this period. This
            closing&rsquo;s own record — including every figure already frozen —
            stays permanently visible; re-closing afterward creates a new,
            separately versioned report rather than overwriting this one.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">Why are you reopening this?</Label>
            <Input
              id="reopen-reason"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Reopening…" : "Reopen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
