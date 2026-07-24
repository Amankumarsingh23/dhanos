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
import { TRANSACTION_STATUS_LABELS } from "@/lib/validation/transactions";
import {
  recordOccurrenceSchema,
  type RecordOccurrenceInput,
} from "@/lib/validation/recurring-rules";
import { recordOccurrenceAction } from "./actions";
import type { RecurringRuleRow } from "./queries";

type RecordOccurrenceDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRuleRow | null;
  onSaved?: () => void;
};

const STATUS_OPTIONS = (
  ["planned", "pending", "cleared", "reconciled"] as const
).map((value) => [value, TRANSACTION_STATUS_LABELS[value]] as const);

/**
 * Manually confirms/records the rule's current next occurrence — the
 * reminder_only path, or an early/late confirmation for any rule. Always
 * writes a real transaction (an explicit human action), then advances
 * next_due_date past it.
 */
export function RecordOccurrenceDialog({
  householdId,
  open,
  onOpenChange,
  rule,
  onSaved,
}: RecordOccurrenceDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecordOccurrenceInput>({
    resolver: zodResolver(recordOccurrenceSchema),
    defaultValues: {
      recurringRuleId: rule?.id ?? "",
      transactionDate: rule?.next_due_date ?? "",
      amount: "",
      status: "cleared",
      description: null,
    },
  });

  useEffect(() => {
    if (open && rule) {
      reset({
        recurringRuleId: rule.id,
        transactionDate: rule.next_due_date ?? "",
        amount: (
          rule.currentAmountMinorUnits /
          10 ** minorUnitExponent(rule.currency_code)
        ).toString(),
        status: "cleared",
        description: null,
      });
    }
  }, [open, rule, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: RecordOccurrenceInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await recordOccurrenceAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Occurrence recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!rule || !rule.next_due_date) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record occurrence for {rule.name}</DialogTitle>
          <DialogDescription>
            Confirms the occurrence due {formatDisplayDate(rule.next_due_date)}{" "}
            — writes a real transaction and advances the rule to its next due
            date.
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
          <input type="hidden" {...register("recurringRuleId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="occurrenceAmount">Amount</Label>
              <Input
                id="occurrenceAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FormErrorMessage message={errors.amount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occurrenceStatus">Status</Label>
              <NativeSelect id="occurrenceStatus" {...register("status")}>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occurrenceDescription">Notes (optional)</Label>
            <Input id="occurrenceDescription" {...register("description")} />
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
              {isPending ? "Saving…" : "Record occurrence"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
