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
import { NativeSelect } from "@/components/forms/native-select";
import { saveCalculatorScenarioAction } from "./actions";
import type { CalculatorType } from "@/lib/validation/calculators";

export type AccountLinkOption = { id: string; label: string };

type SaveScenarioDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calculatorType: CalculatorType;
  /** The exact form values that produced `outputs` — frozen as-is into the saved row. */
  inputs: Record<string, unknown>;
  /** The computed result shown to the user at the moment they clicked Save. */
  outputs: Record<string, unknown>;
  linkAccounts?: AccountLinkOption[];
  onSaved?: () => void;
};

/**
 * The only place this feature ever writes to the database — PROMPT 20:
 * "Do not save a scenario unless user explicitly chooses Save." Both
 * `inputs` and `outputs` are frozen at save time; reopening a saved
 * scenario later never silently reflects a since-changed formula.
 */
export function SaveScenarioDialog({
  householdId,
  open,
  onOpenChange,
  calculatorType,
  inputs,
  outputs,
  linkAccounts = [],
  onSaved,
}: SaveScenarioDialogProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a name for this scenario.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await saveCalculatorScenarioAction(householdId, {
        calculatorType,
        name,
        inputs,
        outputs,
        linkedAccountId: linkedAccountId || null,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success("Scenario saved");
      setName("");
      setNotes("");
      setLinkedAccountId("");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save scenario</DialogTitle>
          <DialogDescription>
            Saves exactly what&apos;s shown now — the inputs and the projected
            result — so you can come back to it later. This never happens
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="scenario-name">Name</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Retirement at 55"
              autoFocus
            />
          </div>
          {linkAccounts.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="scenario-linked-account">
                Link to an account (optional)
              </Label>
              <NativeSelect
                id="scenario-linked-account"
                value={linkedAccountId}
                onChange={(event) => setLinkedAccountId(event.target.value)}
              >
                <option value="">None</option>
                {linkAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="scenario-notes">Notes (optional)</Label>
            <Input
              id="scenario-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save scenario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
