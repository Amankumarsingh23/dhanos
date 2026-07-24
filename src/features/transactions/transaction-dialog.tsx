"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
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
  GENERAL_FORM_TRANSACTION_KINDS,
  TRANSACTION_KIND_LABELS,
  TRANSACTION_STATUS_LABELS,
  transactionInputSchema,
  type TransactionInput,
  type TransactionKind,
} from "@/lib/validation/transactions";
import { createTransactionAction, updateTransactionAction } from "./actions";
import type { TransactionRow, TransactionSplitRecord } from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type CategoryOption = { id: string; name: string; categoryKind: string };
export type PersonOption = { id: string; name: string };

type TransactionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  transaction?: TransactionRow | null;
  existingSplits?: TransactionSplitRecord[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  onSaved?: () => void;
};

const STATUS_OPTIONS = Object.entries(TRANSACTION_STATUS_LABELS) as [
  keyof typeof TRANSACTION_STATUS_LABELS,
  string,
][];

/** Which category_kind a transaction kind's category picker should be filtered to — a soft hint, not enforced by the schema. */
const KIND_TO_CATEGORY_KIND: Record<TransactionKind, string> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
  investment_contribution: "investment",
  investment_withdrawal: "investment",
  loan_disbursement: "debt",
  loan_payment: "debt",
  lending_disbursement: "debt",
  lending_repayment: "debt",
  liability_incurred: "debt",
  liability_payment: "debt",
  refund: "income",
  adjustment: "other",
};

function toDefaultValues(
  transaction?: TransactionRow | null,
  existingSplits?: TransactionSplitRecord[],
): TransactionInput {
  return {
    kind: (transaction?.kind as TransactionInput["kind"]) ?? "expense",
    amount: transaction
      ? (
          transaction.amount_minor_units /
          10 ** minorUnitExponent(transaction.currency_code)
        ).toString()
      : "",
    currencyCode: transaction?.currency_code ?? "INR",
    transactionDate: transaction?.transaction_date ?? "",
    accountId: transaction?.account_id ?? "",
    transferAccountId: transaction?.transfer_account_id ?? null,
    categoryId: transaction?.category_id ?? null,
    counterparty: transaction?.counterparty ?? null,
    description: transaction?.description ?? null,
    status: (transaction?.status as TransactionInput["status"]) ?? "cleared",
    sourceType:
      (transaction?.source_type as TransactionInput["sourceType"]) ?? "manual",
    relatedPersonId: transaction?.related_person_id ?? null,
    splits: existingSplits?.map((split) => ({
      categoryId: split.category_id,
      amount: (
        split.amount_minor_units /
        10 ** minorUnitExponent(transaction?.currency_code ?? "INR")
      ).toString(),
      notes: split.notes,
    })),
  };
}

/**
 * Create/edit dialog for a general transaction — income, expense, transfer,
 * or the investment/loan/lending contribution kinds. Refund and adjustment
 * have their own dedicated flows (see refund-dialog.tsx and
 * record_account_balance_correction) and aren't offered here. See PROMPT
 * 10, "Transaction features."
 */
export function TransactionDialog({
  householdId,
  open,
  onOpenChange,
  transaction,
  existingSplits,
  accounts,
  categories,
  people,
  onSaved,
}: TransactionDialogProps) {
  const isEditing = Boolean(transaction);
  const [formError, setFormError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(Boolean(existingSplits?.length));
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<TransactionInput>({
    resolver: zodResolver(transactionInputSchema),
    defaultValues: toDefaultValues(transaction, existingSplits),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "splits" });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(transaction, existingSplits));
      setSplitMode(Boolean(existingSplits?.length));
    }
    // existingSplits is a fresh array reference each render; only re-seed on open/transaction change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const kind = watch("kind");
  const accountId = watch("accountId");
  const isTransfer = kind === "transfer";

  const relevantCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.categoryKind === KIND_TO_CATEGORY_KIND[kind],
      ),
    [categories, kind],
  );

  function onSubmit(values: TransactionInput) {
    setFormError(null);
    const payload: TransactionInput = {
      ...values,
      splits: splitMode ? values.splits : undefined,
      transferAccountId: isTransfer ? values.transferAccountId : null,
      categoryId: splitMode ? null : values.categoryId,
    };
    startTransition(async () => {
      const result = isEditing
        ? await updateTransactionAction(householdId, transaction!.id, payload)
        : await createTransactionAction(householdId, payload);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Transaction updated" : "Transaction added");
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
            {isEditing ? "Edit transaction" : "Add transaction"}
          </DialogTitle>
          <DialogDescription>
            {isTransfer
              ? "A transfer moves money between two owned accounts — never counted as income or expense."
              : "Record money in or out of an account."}
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
              <Label htmlFor="kind">Kind</Label>
              <NativeSelect id="kind" {...register("kind")}>
                {GENERAL_FORM_TRANSACTION_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {TRANSACTION_KIND_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.kind?.message} />
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
              <FormErrorMessage message={errors.status?.message} />
            </div>
          </div>

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
              <Label htmlFor="accountId">
                {isTransfer ? "From account" : "Account"}
              </Label>
              <NativeSelect
                id="accountId"
                aria-invalid={!!errors.accountId}
                value={accountId}
                onChange={(event) => handleAccountChange(event.target.value)}
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.accountId?.message} />
            </div>
            {isTransfer && (
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
                        {account.name}
                      </option>
                    ))}
                </NativeSelect>
                <FormErrorMessage message={errors.transferAccountId?.message} />
              </div>
            )}
            {!isTransfer && (
              <div className="space-y-1.5">
                <Label htmlFor="relatedPersonId">Person (optional)</Label>
                <NativeSelect
                  id="relatedPersonId"
                  {...register("relatedPersonId")}
                >
                  <option value="">Unassigned</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          {!isTransfer && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Category</Label>
                <label className="text-muted-foreground flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    checked={splitMode}
                    onChange={(event) => {
                      setSplitMode(event.target.checked);
                      if (event.target.checked && fields.length === 0) {
                        append({ categoryId: "", amount: "", notes: null });
                      }
                    }}
                  />
                  Split across categories
                </label>
              </div>
              {!splitMode ? (
                <NativeSelect id="categoryId" {...register("categoryId")}>
                  <option value="">Uncategorized</option>
                  {relevantCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-start gap-2">
                      <NativeSelect
                        className="flex-1"
                        aria-label={`Split ${index + 1} category`}
                        {...register(`splits.${index}.categoryId` as const)}
                      >
                        <option value="">Category</option>
                        {relevantCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </NativeSelect>
                      <Input
                        className="w-28"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`Split ${index + 1} amount`}
                        {...register(`splits.${index}.amount` as const)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 1}
                        aria-label={`Remove split ${index + 1}`}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      append({ categoryId: "", amount: "", notes: null })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    Add split
                  </Button>
                  <p className="text-muted-foreground text-xs">
                    Split amounts must add up to exactly the transaction total.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="counterparty">Counterparty (optional)</Label>
              <Input id="counterparty" {...register("counterparty")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currencyCode">Currency</Label>
              <Input
                id="currencyCode"
                maxLength={3}
                aria-invalid={!!errors.currencyCode}
                {...register("currencyCode")}
              />
              <FormErrorMessage message={errors.currencyCode?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
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
                  : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
