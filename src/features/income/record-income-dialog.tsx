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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { formatMoney } from "@/lib/money";
import { minorUnitExponent } from "@/lib/money/currency";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import {
  TRANSACTION_STATUS_LABELS,
  type TransactionStatus,
} from "@/lib/validation/transactions";
import {
  recordIncomeSchema,
  type RecordIncomeInput,
} from "@/lib/validation/income-sources";
import { recordIncomeAction } from "./actions";
import type { IncomeSourceRow } from "./queries";

type RecordIncomeDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: IncomeSourceRow | null;
  onSaved?: () => void;
};

const RECORD_STATUS_OPTIONS: [TransactionStatus, string][] = (
  ["planned", "pending", "cleared", "reconciled"] as const
).map((value) => [value, TRANSACTION_STATUS_LABELS[value]]);

/**
 * Records an actual receipt against an income source — the only flow that
 * creates a transaction (see recordIncomeAction). Surfaces a
 * duplicate-recurring-receipt warning rather than silently blocking or
 * silently allowing it — the user must explicitly confirm to proceed.
 */
export function RecordIncomeDialog({
  householdId,
  open,
  onOpenChange,
  source,
  onSaved,
}: RecordIncomeDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<
    | { id: string; transaction_date: string; amount_minor_units: number }[]
    | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<RecordIncomeInput>({
    resolver: zodResolver(recordIncomeSchema),
    defaultValues: {
      incomeSourceId: source?.id ?? "",
      amount: "",
      transactionDate: toIsoDateString(new Date()),
      status: "cleared",
      description: null,
      confirmDuplicate: false,
    },
  });

  useEffect(() => {
    if (open && source) {
      reset({
        incomeSourceId: source.id,
        amount: source.expected_amount_minor_units
          ? (
              source.expected_amount_minor_units /
              10 ** minorUnitExponent(source.currency_code)
            ).toString()
          : "",
        transactionDate: toIsoDateString(new Date()),
        status: "cleared",
        description: null,
        confirmDuplicate: false,
      });
    }
  }, [open, source, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
      setDuplicates(null);
    }
    onOpenChange(next);
  }

  async function submitValues(values: RecordIncomeInput) {
    const result = await recordIncomeAction(householdId, values);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.data.kind === "duplicate_warning") {
      setDuplicates(
        result.data.nearbyReceipts.map((t) => ({
          id: t.id,
          transaction_date: t.transaction_date,
          amount_minor_units: t.amount_minor_units,
        })),
      );
      return;
    }
    toast.success("Income recorded");
    handleOpenChange(false);
    onSaved?.();
  }

  function onSubmit(values: RecordIncomeInput) {
    setFormError(null);
    setDuplicates(null);
    startTransition(() => submitValues(values));
  }

  function onConfirmDuplicate() {
    setFormError(null);
    startTransition(() =>
      submitValues({ ...getValues(), confirmDuplicate: true }),
    );
  }

  if (!source) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record income from {source.name}</DialogTitle>
          <DialogDescription>
            Creates an income transaction against{" "}
            {source.accountName ?? "the receiving account"}.
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
          {duplicates && duplicates.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>This might already be recorded</AlertTitle>
              <AlertDescription>
                <p>
                  {duplicates
                    .map(
                      (d) =>
                        `${formatMoney({ amountMinorUnits: d.amount_minor_units, currencyCode: source.currency_code })} on ${formatDisplayDate(d.transaction_date)}`,
                    )
                    .join("; ")}{" "}
                  already recorded for this source nearby.
                </p>
              </AlertDescription>
            </Alert>
          )}
          <input type="hidden" {...register("incomeSourceId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recordAmount">Amount</Label>
              <Input
                id="recordAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FormErrorMessage message={errors.amount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recordDate">Date received</Label>
              <Input
                id="recordDate"
                type="date"
                aria-invalid={!!errors.transactionDate}
                {...register("transactionDate")}
              />
              <FormErrorMessage message={errors.transactionDate?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recordStatus">Status</Label>
            <NativeSelect id="recordStatus" {...register("status")}>
              {RECORD_STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="recordDescription">Description (optional)</Label>
            <Input id="recordDescription" {...register("description")} />
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
            {duplicates && duplicates.length > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={isPending}
                onClick={onConfirmDuplicate}
              >
                {isPending ? "Saving…" : "Record anyway"}
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Record income"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
