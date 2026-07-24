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
import { recordLoanPaymentAction } from "./actions";
import type { LoanRow } from "./queries";

type RecordPaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: LoanRow;
  onSaved?: () => void;
};

/**
 * Records one EMI/loan payment, split into principal/interest/fee/penalty
 * (PROMPT 21: "each paid EMI should produce a loan-payment record"). A
 * principal component that would push the loan below zero outstanding
 * surfaces an inline confirmation rather than silently writing a negative
 * balance or being hard-rejected (PROMPT 21 acceptance criterion).
 */
export function RecordPaymentDialog({
  householdId,
  open,
  onOpenChange,
  loan,
  onSaved,
}: RecordPaymentDialogProps) {
  const [paymentDate, setPaymentDate] = useState(() =>
    toIsoDateString(new Date()),
  );
  const [principalComponent, setPrincipalComponent] = useState("");
  const [interestComponent, setInterestComponent] = useState("");
  const [feeComponent, setFeeComponent] = useState("0");
  const [penaltyComponent, setPenaltyComponent] = useState("0");
  const [notes, setNotes] = useState("");
  const [confirmOverpayment, setConfirmOverpayment] = useState(false);
  const [overpaymentWarning, setOverpaymentWarning] = useState<{
    outstandingMinorUnits: number;
    overpaymentAmountMinorUnits: number;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setOverpaymentWarning(null);
      setConfirmOverpayment(false);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await recordLoanPaymentAction(householdId, {
        loanId: loan.id,
        paymentDate,
        principalComponent: principalComponent || "0",
        interestComponent: interestComponent || "0",
        feeComponent: feeComponent || "0",
        penaltyComponent: penaltyComponent || "0",
        confirmOverpayment,
        notes: notes.trim() || null,
      });

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      if (result.data.kind === "overpayment_warning") {
        setOverpaymentWarning(result.data);
        setConfirmOverpayment(true);
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
              amountMinorUnits: loan.outstandingMinorUnits,
              currencyCode: loan.currency_code,
            })}
            . Recording a payment writes a linked transaction against{" "}
            {loan.paymentAccountName}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {overpaymentWarning && (
            <Alert variant="destructive">
              <AlertDescription>
                This principal component exceeds the outstanding balance by{" "}
                {formatMoney({
                  amountMinorUnits:
                    overpaymentWarning.overpaymentAmountMinorUnits,
                  currencyCode: loan.currency_code,
                })}
                . Submit again to record it as an explicit overpayment — the
                loan will be treated as fully repaid, and the extra amount will
                be recorded separately.
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
                  setOverpaymentWarning(null);
                  setConfirmOverpayment(false);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-interest">Interest</Label>
              <Input
                id="payment-interest"
                inputMode="decimal"
                value={interestComponent}
                onChange={(event) => setInterestComponent(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-fee">Fee</Label>
              <Input
                id="payment-fee"
                inputMode="decimal"
                value={feeComponent}
                onChange={(event) => setFeeComponent(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-penalty">Penalty</Label>
              <Input
                id="payment-penalty"
                inputMode="decimal"
                value={penaltyComponent}
                onChange={(event) => setPenaltyComponent(event.target.value)}
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
                : overpaymentWarning
                  ? "Confirm overpayment"
                  : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
