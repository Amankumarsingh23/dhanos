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
import { toIsoDateString } from "@/lib/dates";
import {
  balanceCorrectionSchema,
  type BalanceCorrectionInput,
} from "@/lib/validation/accounts";
import { recordBalanceCorrectionAction } from "./actions";
import type { AccountRow } from "./queries";

type BalanceCorrectionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRow | null;
  onSaved?: () => void;
};

/**
 * The manual-correction flow from PROMPT 9's "Balance rules": the user
 * states what the account's balance actually is (from a statement, say),
 * and the Server Action reconciles it via recordBalanceCorrectionAction —
 * always a new snapshot, plus an adjustment transaction when the confirmed
 * figure differs from what the ledger currently implies. Never a silent
 * edit of the calculated balance.
 */
export function BalanceCorrectionDialog({
  householdId,
  open,
  onOpenChange,
  account,
  onSaved,
}: BalanceCorrectionDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BalanceCorrectionInput>({
    resolver: zodResolver(balanceCorrectionSchema),
    defaultValues: {
      accountId: account?.id ?? "",
      asOfDate: toIsoDateString(new Date()),
      confirmedBalance: "",
      notes: null,
    },
  });

  useEffect(() => {
    if (open && account) {
      reset({
        accountId: account.id,
        asOfDate: toIsoDateString(new Date()),
        confirmedBalance: "",
        notes: null,
      });
    }
  }, [open, account, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: BalanceCorrectionInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await recordBalanceCorrectionAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success(
        result.data.adjustmentTransactionId
          ? "Balance confirmed and an adjustment transaction was recorded"
          : "Balance confirmed — it already matched the ledger",
      );
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!account) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct balance for {account.name}</DialogTitle>
          <DialogDescription>
            Currently calculated at {formatMoney(account.currentBalance)}.
            Confirming a different figure records a dated snapshot and, if
            needed, an adjustment transaction — the calculated balance is never
            edited directly.
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
          <input type="hidden" {...register("accountId")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="asOfDate">As of date</Label>
              <Input
                id="asOfDate"
                type="date"
                aria-invalid={!!errors.asOfDate}
                {...register("asOfDate")}
              />
              <FormErrorMessage message={errors.asOfDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmedBalance">Confirmed balance</Label>
              <Input
                id="confirmedBalance"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.confirmedBalance}
                {...register("confirmedBalance")}
              />
              <FormErrorMessage message={errors.confirmedBalance?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correctionNotes">Notes (optional)</Label>
            <Input id="correctionNotes" {...register("notes")} />
            <FormErrorMessage message={errors.notes?.message} />
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
              {isPending ? "Saving…" : "Confirm balance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
