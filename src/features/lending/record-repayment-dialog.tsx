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
import { formatMoney } from "@/lib/money";
import { toIsoDateString } from "@/lib/dates";
import { recordLendingRepaymentAction } from "./actions";
import type { LendingRow } from "./queries";

type RecordRepaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lending: LendingRow;
  onSaved?: () => void;
};

/**
 * Records one repayment, split into principal/interest (PROMPT 23: "each
 * repayment should create a linked account transaction, principal and
 * interest breakdown, outstanding update, and activity event" — this
 * dialog is the entry point for that whole chain via
 * record_lending_repayment). A principal component that would push the
 * lending below zero outstanding surfaces an inline confirmation rather
 * than silently writing a negative balance or being hard-rejected.
 */
export function RecordRepaymentDialog({
  householdId,
  open,
  onOpenChange,
  lending,
  onSaved,
}: RecordRepaymentDialogProps) {
  const [repaymentDate, setRepaymentDate] = useState(() =>
    toIsoDateString(new Date()),
  );
  const [principalComponent, setPrincipalComponent] = useState("");
  const [interestComponent, setInterestComponent] = useState("0");
  const [notes, setNotes] = useState("");
  const [confirmExcess, setConfirmExcess] = useState(false);
  const [excessWarning, setExcessWarning] = useState<{
    outstandingMinorUnits: number;
    excessAmountMinorUnits: number;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setExcessWarning(null);
      setConfirmExcess(false);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await recordLendingRepaymentAction(householdId, {
        lendingId: lending.id,
        repaymentDate,
        principalComponent: principalComponent || "0",
        interestComponent: interestComponent || "0",
        confirmExcess,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (result.data.kind === "excess_warning") {
        setExcessWarning(result.data);
        setConfirmExcess(true);
        return;
      }

      toast.success("Repayment recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record repayment</DialogTitle>
          <DialogDescription>
            Outstanding balance:{" "}
            {formatMoney({
              amountMinorUnits: lending.outstandingMinorUnits,
              currencyCode: lending.currency_code,
            })}
            . Recording a repayment writes a linked transaction against{" "}
            {lending.sourceAccountName}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {excessWarning && (
            <Alert variant="destructive">
              <AlertDescription>
                This principal component exceeds the outstanding balance by{" "}
                {formatMoney({
                  amountMinorUnits: excessWarning.excessAmountMinorUnits,
                  currencyCode: lending.currency_code,
                })}
                . Submit again to record it as an explicit excess repayment —
                the lending will be treated as fully recovered, and the extra
                amount will be recorded separately.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="repayment-date">Repayment date</Label>
              <Input
                id="repayment-date"
                type="date"
                value={repaymentDate}
                onChange={(event) => setRepaymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repayment-principal">Principal</Label>
              <Input
                id="repayment-principal"
                inputMode="decimal"
                value={principalComponent}
                onChange={(event) => {
                  setPrincipalComponent(event.target.value);
                  setExcessWarning(null);
                  setConfirmExcess(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repayment-interest">
                Interest (tracked separately from principal)
              </Label>
              <Input
                id="repayment-interest"
                inputMode="decimal"
                value={interestComponent}
                onChange={(event) => setInterestComponent(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repayment-notes">Notes (optional)</Label>
            <Input
              id="repayment-notes"
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
              {isPending
                ? "Recording…"
                : excessWarning
                  ? "Confirm excess repayment"
                  : "Record repayment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
