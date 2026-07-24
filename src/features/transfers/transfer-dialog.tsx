"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { minorUnitExponent } from "@/lib/money/currency";
import {
  TRANSACTION_STATUS_LABELS,
  type TransactionStatus,
} from "@/lib/validation/transactions";
import {
  transferInputSchema,
  type TransferInput,
} from "@/lib/validation/transfers";
import { createTransferAction, updateTransferAction } from "./actions";
import type { TransferRow } from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };

type TransferDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  transfer?: TransferRow | null;
  accounts: AccountOption[];
  onSaved?: () => void;
};

const STATUS_OPTIONS = Object.entries(TRANSACTION_STATUS_LABELS).filter(
  ([value]) => value !== "cancelled",
) as [TransactionStatus, string][];

function toDefaultValues(transfer?: TransferRow | null): TransferInput {
  return {
    amount: transfer
      ? (
          transfer.amount_minor_units /
          10 ** minorUnitExponent(transfer.currency_code)
        ).toString()
      : "",
    currencyCode: transfer?.currency_code ?? "INR",
    transactionDate: transfer?.transaction_date ?? "",
    accountId: transfer?.account_id ?? "",
    transferAccountId: transfer?.transfer_account_id ?? "",
    feeAmount:
      transfer?.transfer_fee_minor_units != null
        ? (
            transfer.transfer_fee_minor_units /
            10 ** minorUnitExponent(transfer.currency_code)
          ).toString()
        : "",
    destinationAmount: "",
    exchangeRate:
      transfer?.exchange_rate != null ? String(transfer.exchange_rate) : "",
    status: (transfer?.status as TransferInput["status"]) ?? "cleared",
    description: transfer?.description ?? null,
  };
}

/**
 * The one user-facing form for transfers (PROMPT 13): source/destination
 * account, amount, optional fee, status, notes, and — only when the
 * selected accounts' currencies differ — an explicit converted amount and
 * exchange rate. This app never looks up or invents an exchange rate; the
 * cross-currency section only ever reflects what the user typed.
 */
export function TransferDialog({
  householdId,
  open,
  onOpenChange,
  transfer,
  accounts,
  onSaved,
}: TransferDialogProps) {
  const isEditing = Boolean(transfer);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TransferInput>({
    resolver: zodResolver(transferInputSchema),
    defaultValues: toDefaultValues(transfer),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(transfer));
    }
  }, [open, transfer, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const accountId = watch("accountId");
  const transferAccountId = watch("transferAccountId");

  const sourceAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );
  const destinationAccount = useMemo(
    () => accounts.find((a) => a.id === transferAccountId),
    [accounts, transferAccountId],
  );
  const isCrossCurrency = Boolean(
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currencyCode !== destinationAccount.currencyCode,
  );

  function onSubmit(values: TransferInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateTransferAction(householdId, transfer!.id, values)
        : await createTransferAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Transfer updated" : "Transfer added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleAccountChange(nextAccountId: string) {
    setValue("accountId", nextAccountId);
    const account = accounts.find((a) => a.id === nextAccountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit transfer" : "Add transfer"}
          </DialogTitle>
          <DialogDescription>
            Move money between two of your own accounts — never counted as
            income or expense.
          </DialogDescription>
        </DialogHeader>
        <form
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.amount}
                {...register("amount")}
              />
              <FormErrorMessage message={errors.amount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transactionDate">Date</Label>
              <Input
                id="transactionDate"
                type="date"
                aria-invalid={!!errors.transactionDate}
                {...register("transactionDate")}
              />
              <FormErrorMessage message={errors.transactionDate?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="accountId">From account</Label>
              <NativeSelect
                id="accountId"
                aria-invalid={!!errors.accountId}
                value={accountId}
                onChange={(event) => handleAccountChange(event.target.value)}
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.currencyCode})
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.accountId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transferAccountId">To account</Label>
              <NativeSelect
                id="transferAccountId"
                aria-invalid={!!errors.transferAccountId}
                {...register("transferAccountId")}
              >
                <option value="">Select an account</option>
                {accounts
                  .filter((account) => account.id !== accountId)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currencyCode})
                    </option>
                  ))}
              </NativeSelect>
              <FormErrorMessage message={errors.transferAccountId?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="feeAmount">Transfer fee (optional)</Label>
              <Input
                id="feeAmount"
                inputMode="decimal"
                placeholder="0.00"
                {...register("feeAmount")}
              />
              <p className="text-muted-foreground text-xs">
                Deducted from the source account only — never counted as an
                expense.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <NativeSelect id="status" {...register("status")}>
                {STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {isCrossCurrency && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">
                Different currencies — {sourceAccount?.currencyCode} →{" "}
                {destinationAccount?.currencyCode}
              </p>
              <p className="text-muted-foreground text-xs">
                Enter the amount actually credited to the destination account
                and the exchange rate you used — this app never looks up or
                assumes a rate for you.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="destinationAmount">
                    Amount received ({destinationAccount?.currencyCode})
                  </Label>
                  <Input
                    id="destinationAmount"
                    inputMode="decimal"
                    placeholder="0.00"
                    {...register("destinationAmount")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="exchangeRate">Exchange rate used</Label>
                  <Input
                    id="exchangeRate"
                    inputMode="decimal"
                    placeholder="e.g. 83.50"
                    {...register("exchangeRate")}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes (optional)</Label>
            <Input id="description" {...register("description")} />
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
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Add transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
