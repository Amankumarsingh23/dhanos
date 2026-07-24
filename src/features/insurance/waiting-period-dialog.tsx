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
import { toIsoDateString } from "@/lib/dates";
import { createWaitingPeriodAction } from "./actions";

type WaitingPeriodDialogProps = {
  householdId: string;
  policyId: string;
  policyStartDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
};

export function WaitingPeriodDialog({
  householdId,
  policyId,
  policyStartDate,
  open,
  onOpenChange,
  onSaved,
}: WaitingPeriodDialogProps) {
  const [label, setLabel] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [startsFrom, setStartsFrom] = useState(policyStartDate);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setLabel("");
      setDurationMonths("");
      setStartsFrom(policyStartDate || toIsoDateString(new Date()));
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await createWaitingPeriodAction(householdId, {
        policyId,
        label,
        durationMonths,
        startsFrom,
        notes: null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Waiting period added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add waiting period</DialogTitle>
          <DialogDescription>
            Its milestone date (when the waiting period ends) is computed
            automatically from the start date and duration.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="waiting-period-label">Label</Label>
            <Input
              id="waiting-period-label"
              placeholder="e.g. Pre-existing conditions"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="waiting-period-starts-from">Starts from</Label>
              <Input
                id="waiting-period-starts-from"
                type="date"
                value={startsFrom}
                onChange={(event) => setStartsFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="waiting-period-duration">Duration (months)</Label>
              <Input
                id="waiting-period-duration"
                inputMode="numeric"
                value={durationMonths}
                onChange={(event) => setDurationMonths(event.target.value)}
              />
            </div>
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add waiting period"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
