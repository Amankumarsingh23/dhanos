"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { formatDisplayDate } from "@/lib/dates";
import { minorUnitExponent } from "@/lib/money/currency";
import {
  recordSipContributionSchema,
  type RecordSipContributionInput,
} from "@/lib/validation/investment-sips";
import { recordSipContributionAction } from "./actions";
import type { InvestmentSipRow } from "./queries";

type RecordContributionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sip: InvestmentSipRow | null;
  onSaved?: () => void;
};

const STATUS_OPTIONS: [string, string][] = [
  ["cleared", "Cleared"],
  ["pending", "Pending"],
  ["planned", "Planned"],
];

/**
 * Records the SIP's current due occurrence — writes the investment
 * contribution record, its linked cash-flow transaction, and advances
 * next_due_date, all atomically (see recordSipContributionAction). See
 * PROMPT 17 "Contributions".
 */
export function RecordContributionDialog({
  householdId,
  open,
  onOpenChange,
  sip,
  onSaved,
}: RecordContributionDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecordSipContributionInput>({
    resolver: zodResolver(recordSipContributionSchema),
    defaultValues: {
      investmentSipId: sip?.id ?? "",
      occurrenceDate: sip?.next_due_date ?? "",
      amount: "",
      status: "cleared",
      notes: null,
    },
  });

  useEffect(() => {
    if (open && sip) {
      reset({
        investmentSipId: sip.id,
        occurrenceDate: sip.next_due_date ?? "",
        amount: (
          sip.contribution_amount_minor_units /
          10 ** minorUnitExponent(sip.currency_code)
        ).toString(),
        status: "cleared",
        notes: null,
      });
    }
  }, [open, sip, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: RecordSipContributionInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await recordSipContributionAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Contribution recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!sip || !sip.next_due_date) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record contribution for {sip.name}</DialogTitle>
          <DialogDescription>
            Confirms the occurrence due {formatDisplayDate(sip.next_due_date)} —
            writes the contribution record and its linked cash-flow transaction,
            and advances the SIP to its next due date.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" {...register("investmentSipId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contributionOccurrenceDate">Date</Label>
              <Input
                id="contributionOccurrenceDate"
                type="date"
                aria-invalid={!!errors.occurrenceDate}
                {...register("occurrenceDate")}
              />
              <FormErrorMessage message={errors.occurrenceDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contributionAmount">Amount</Label>
              <Input
                id="contributionAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FormErrorMessage message={errors.amount?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contributionStatus">Status</Label>
            <NativeSelect id="contributionStatus" {...register("status")}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contributionNotes">Notes (optional)</Label>
            <Input id="contributionNotes" {...register("notes")} />
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
              {isPending ? "Saving…" : "Record contribution"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
