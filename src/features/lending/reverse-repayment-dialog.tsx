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
import { reverseLendingRepaymentAction } from "./actions";
import type { LendingRepaymentRecord } from "./queries";

type ReverseRepaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repayment: LendingRepaymentRecord;
  onSaved?: () => void;
};

/**
 * Reverses a mis-entered repayment *record* — never an edit/delete of the
 * append-only original (docs/money-calculation-rules.md §3). Explains
 * clearly that the linked cash transaction is untouched, same convention as
 * loans' ReversePaymentDialog.
 */
export function ReverseRepaymentDialog({
  householdId,
  open,
  onOpenChange,
  repayment,
  onSaved,
}: ReverseRepaymentDialogProps) {
  const [reversalReason, setReversalReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setReversalReason("");
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!reversalReason.trim()) {
      setFormError("Explain why this repayment is being reversed.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await reverseLendingRepaymentAction(householdId, {
        repaymentId: repayment.id,
        reversalReason,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Repayment reversed");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse this repayment?</DialogTitle>
          <DialogDescription>
            Reverses the{" "}
            {formatMoney({
              amountMinorUnits: repayment.total_repayment_minor_units,
              currencyCode: repayment.currency_code,
            })}{" "}
            repayment record dated {repayment.repayment_date} — it stays in the
            history forever, alongside this reversal. This does not undo the
            linked cash transaction; correct that separately from Cash Flow if
            the money itself was also wrong.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="reversal-reason">Reason</Label>
            <Input
              id="reversal-reason"
              value={reversalReason}
              onChange={(event) => setReversalReason(event.target.value)}
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
              {isPending ? "Reversing…" : "Reverse repayment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
