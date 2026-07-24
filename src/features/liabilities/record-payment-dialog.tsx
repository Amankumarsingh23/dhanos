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
import { recordLiabilityPaymentAction } from "./actions";
import type { LiabilityRow } from "./queries";

type RecordPaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability: LiabilityRow;
  onSaved?: () => void;
};

/**
 * Records one payment, split into principal/interest — "payment history
 * remains auditable" (PROMPT 24 acceptance criterion) starts here: every
 * payment is a new, permanent row via record_liability_payment. A
 * principal component that would push the liability below zero outstanding
 * surfaces an inline confirmation rather than silently writing a negative
 * balance or being hard-rejected.
 */
export function RecordPaymentDialog({
  householdId,
  open,
  onOpenChange,
  liability,
  onSaved,
}: RecordPaymentDialogProps) {
  const [paymentDate, setPaymentDate] = useState(() =>
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
      const result = await recordLiabilityPaymentAction(householdId, {
        liabilityId: liability.id,
        paymentDate,
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

      toast.success("Payment recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Outstanding balance:{" "}
            {formatMoney({
              amountMinorUnits: liability.outstandingMinorUnits,
              currencyCode: liability.currency_code,
            })}
            . Recording a payment writes a linked transaction against{" "}
            {liability.paymentAccountName}.
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
                  currencyCode: liability.currency_code,
                })}
                . Submit again to record it as an explicit excess payment — the
                liability will be treated as fully paid, and the extra amount
                will be recorded separately.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Payment date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-principal">Principal</Label>
              <Input
                id="payment-principal"
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
              <Label htmlFor="payment-interest">
                Interest (tracked separately from principal)
              </Label>
              <Input
                id="payment-interest"
                inputMode="decimal"
                value={interestComponent}
                onChange={(event) => setInterestComponent(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Notes (optional)</Label>
            <Input
              id="payment-notes"
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
                  ? "Confirm excess payment"
                  : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
