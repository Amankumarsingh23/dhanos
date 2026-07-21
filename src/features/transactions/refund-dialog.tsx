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
  refundInputSchema,
  type RefundInput,
} from "@/lib/validation/transactions";
import { recordRefundAction } from "./actions";
import type { TransactionRow } from "./queries";

type RefundDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The expense transaction being refunded. */
  transaction: TransactionRow | null;
  /** Already refunded against this transaction, in minor units — caps the new refund amount. */
  alreadyRefundedMinorUnits: number;
  onSaved?: () => void;
};

/**
 * Records a refund against an expense — always a new kind = 'refund' row
 * referencing the original (see recordRefundAction), never an edit of the
 * original expense. See PROMPT 10 acceptance criterion "Refund handling is
 * traceable."
 */
export function RefundDialog({
  householdId,
  open,
  onOpenChange,
  transaction,
  alreadyRefundedMinorUnits,
  onSaved,
}: RefundDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RefundInput>({
    resolver: zodResolver(refundInputSchema),
    defaultValues: {
      originalTransactionId: transaction?.id ?? "",
      amount: "",
      transactionDate: toIsoDateString(new Date()),
      description: null,
    },
  });

  useEffect(() => {
    if (open && transaction) {
      reset({
        originalTransactionId: transaction.id,
        amount: "",
        transactionDate: toIsoDateString(new Date()),
        description: null,
      });
    }
  }, [open, transaction, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: RefundInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await recordRefundAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Refund recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!transaction) {
    return null;
  }

  const remaining = transaction.amount_minor_units - alreadyRefundedMinorUnits;
  const exponent = minorUnitExponent(transaction.currency_code);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund transaction</DialogTitle>
          <DialogDescription>
            {alreadyRefundedMinorUnits > 0
              ? `Already refunded ${formatMoney({ amountMinorUnits: alreadyRefundedMinorUnits, currencyCode: transaction.currency_code })} of ${formatMoney({ amountMinorUnits: transaction.amount_minor_units, currencyCode: transaction.currency_code })}. Up to ${formatMoney({ amountMinorUnits: remaining, currencyCode: transaction.currency_code })} remains refundable.`
              : `Up to ${formatMoney({ amountMinorUnits: remaining, currencyCode: transaction.currency_code })} is refundable.`}
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
          <input type="hidden" {...register("originalTransactionId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="refundAmount">Refund amount</Label>
              <Input
                id="refundAmount"
                inputMode="decimal"
                placeholder={(remaining / 10 ** exponent).toString()}
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FormErrorMessage message={errors.amount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refundDate">Date</Label>
              <Input
                id="refundDate"
                type="date"
                aria-invalid={!!errors.transactionDate}
                {...register("transactionDate")}
              />
              <FormErrorMessage message={errors.transactionDate?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refundDescription">Description (optional)</Label>
            <Input id="refundDescription" {...register("description")} />
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
              {isPending ? "Saving…" : "Record refund"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
