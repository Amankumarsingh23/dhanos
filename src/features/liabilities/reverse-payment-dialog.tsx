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
import { reverseLiabilityPaymentAction } from "./actions";
import type { LiabilityPaymentRecord } from "./queries";

type ReversePaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: LiabilityPaymentRecord;
  onSaved?: () => void;
};

/**
 * Reverses a mis-entered payment *record* — never an edit/delete of the
 * append-only original. Explains clearly that the linked cash transaction
 * is untouched, same convention as loans'/lending's own reversal dialogs.
 */
export function ReversePaymentDialog({
  householdId,
  open,
  onOpenChange,
  payment,
  onSaved,
}: ReversePaymentDialogProps) {
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
      setFormError("Explain why this payment is being reversed.");
      return;
    }
    setFormError(null);
    startTransition(async () => {
      const result = await reverseLiabilityPaymentAction(householdId, {
        paymentId: payment.id,
        reversalReason,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Payment reversed");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse this payment?</DialogTitle>
          <DialogDescription>
            Reverses the{" "}
            {formatMoney({
              amountMinorUnits: payment.total_payment_minor_units,
              currencyCode: payment.currency_code,
            })}{" "}
            payment record dated {payment.payment_date} — it stays in the
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
              {isPending ? "Reversing…" : "Reverse payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
