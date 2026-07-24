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
import { minorUnitExponent } from "@/lib/money/currency";
import { recordLoanDisbursementAction } from "./actions";
import type { LoanRow } from "./queries";

type DisburseDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: LoanRow;
  onSaved?: () => void;
};

/**
 * Records a loan's one-time disbursement — always a `loan_disbursement`
 * transaction, never income (PROMPT 21 acceptance criterion). Separate
 * from the edit dialog so disbursing is always a deliberate, single
 * action.
 */
export function DisburseDialog({
  householdId,
  open,
  onOpenChange,
  loan,
  onSaved,
}: DisburseDialogProps) {
  const [amount, setAmount] = useState(() =>
    String(
      loan.original_principal_minor_units /
        10 ** minorUnitExponent(loan.currency_code),
    ),
  );
  const [disbursementDate, setDisbursementDate] = useState(loan.start_date);
  const [notes, setNotes] = useState("");
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
    setFormError(null);
    startTransition(async () => {
      const result = await recordLoanDisbursementAction(householdId, {
        loanId: loan.id,
        disbursementDate,
        amount,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Disbursement recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record disbursement</DialogTitle>
          <DialogDescription>
            Writes a loan disbursement transaction into{" "}
            {loan.paymentAccountName} — this is never treated as income.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="disburse-amount">Disbursed amount</Label>
            <Input
              id="disburse-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disburse-date">Disbursement date</Label>
            <Input
              id="disburse-date"
              type="date"
              value={disbursementDate}
              onChange={(event) => setDisbursementDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disburse-notes">Notes (optional)</Label>
            <Input
              id="disburse-notes"
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
              {isPending ? "Recording…" : "Record disbursement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
