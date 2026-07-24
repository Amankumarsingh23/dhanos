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
import { formatMoney } from "@/lib/money";
import { minorUnitExponent } from "@/lib/money/currency";
import { toIsoDateString } from "@/lib/dates";
import {
  scheduleAmountChangeSchema,
  type ScheduleAmountChangeInput,
} from "@/lib/validation/recurring-rules";
import { scheduleAmountChangeAction } from "./actions";
import type { RecurringRuleRow } from "./queries";

type AmountChangeDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRuleRow | null;
  onSaved?: () => void;
};

/**
 * Schedules a future amount change for a recurring rule — PROMPT 14
 * "amount change from a particular date." Never edits the rule's current
 * amount in place: this always creates a new, dated schedule entry, and
 * an occurrence already generated keeps its own independently-stored
 * amount forever regardless of later changes.
 */
export function AmountChangeDialog({
  householdId,
  open,
  onOpenChange,
  rule,
  onSaved,
}: AmountChangeDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ScheduleAmountChangeInput>({
    resolver: zodResolver(scheduleAmountChangeSchema),
    defaultValues: {
      recurringRuleId: rule?.id ?? "",
      effectiveDate: toIsoDateString(new Date()),
      newAmount: "",
    },
  });

  useEffect(() => {
    if (open && rule) {
      reset({
        recurringRuleId: rule.id,
        effectiveDate: rule.next_due_date ?? toIsoDateString(new Date()),
        newAmount: (
          rule.currentAmountMinorUnits /
          10 ** minorUnitExponent(rule.currency_code)
        ).toString(),
      });
    }
  }, [open, rule, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: ScheduleAmountChangeInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await scheduleAmountChangeAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Amount change scheduled");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!rule) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change amount for {rule.name}</DialogTitle>
          <DialogDescription>
            Current amount:{" "}
            {formatMoney({
              amountMinorUnits: rule.currentAmountMinorUnits,
              currencyCode: rule.currency_code,
            })}
            . This never rewrites an occurrence already generated — only
            occurrences on or after the effective date use the new amount.
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
              <Label htmlFor="newAmount">New amount</Label>
              <Input
                id="newAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.newAmount}
                {...register("newAmount")}
              />
              <FormErrorMessage message={errors.newAmount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">Effective from</Label>
              <Input
                id="effectiveDate"
                type="date"
                aria-invalid={!!errors.effectiveDate}
                {...register("effectiveDate")}
              />
              <FormErrorMessage message={errors.effectiveDate?.message} />
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
              {isPending ? "Saving…" : "Schedule change"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
