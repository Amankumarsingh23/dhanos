"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DownloadIcon, PlusIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  EXPENSE_RECURRING_FREQUENCY_LABELS,
  expenseInputSchema,
  type ExpenseInput,
} from "@/lib/validation/expenses";
import { TRANSACTION_STATUS_LABELS } from "@/lib/validation/transactions";
import {
  attachExpenseReceiptAction,
  createExpenseAction,
  getExpenseReceiptUrlAction,
  removeExpenseReceiptAction,
  updateExpenseAction,
} from "./actions";
import type {
  ExpenseAttachmentRecord,
  ExpenseRow,
  ExpenseSplitRecord,
} from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type CategoryOption = { id: string; name: string; categoryKind: string };
export type PersonOption = { id: string; name: string };

type ExpenseDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  expense?: ExpenseRow | null;
  existingSplits?: ExpenseSplitRecord[];
  existingReceipts?: ExpenseAttachmentRecord[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  onSaved?: () => void;
};

const STATUS_OPTIONS = Object.entries(TRANSACTION_STATUS_LABELS).filter(
  ([value]) => value !== "cancelled",
) as [keyof typeof TRANSACTION_STATUS_LABELS, string][];

const FREQUENCY_OPTIONS = Object.entries(
  EXPENSE_RECURRING_FREQUENCY_LABELS,
) as [keyof typeof EXPENSE_RECURRING_FREQUENCY_LABELS, string][];

function toDefaultValues(
  expense?: ExpenseRow | null,
  existingSplits?: ExpenseSplitRecord[],
): ExpenseInput {
  return {
    amount: expense
      ? (
          expense.amount_minor_units /
          10 ** minorUnitExponent(expense.currency_code)
        ).toString()
      : "",
    currencyCode: expense?.currency_code ?? "INR",
    transactionDate: expense?.transaction_date ?? "",
    accountId: expense?.account_id ?? "",
    categoryId: expense?.category_id ?? null,
    counterparty: expense?.counterparty ?? null,
    relatedPersonId: expense?.related_person_id ?? null,
    description: expense?.description ?? null,
    status: (expense?.status as ExpenseInput["status"]) ?? "cleared",
    isPlanned: expense?.is_planned ?? true,
    isRecurring: Boolean(expense?.recurring_rule_id),
    recurringFrequency: null,
    recurringIntervalCount: 1,
    splits: existingSplits?.map((split) => ({
      categoryId: split.category_id,
      amount: (
        split.amount_minor_units /
        10 ** minorUnitExponent(expense?.currency_code ?? "INR")
      ).toString(),
      notes: split.notes,
    })),
  };
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create/edit dialog for an expense — amount, date, account, category (or a
 * split across categories), merchant/counterparty, person, planned vs
 * unplanned, one-time vs recurring, notes, and receipts. See PROMPT 12's
 * required-fields list. Marking an expense recurring for the first time
 * creates a minimal recurring_rules row (see createExpenseAction); an
 * already-recurring expense can only be unlinked here, not have its
 * cadence edited — changing a rule's schedule is out of this dialog's
 * scope (no Recurring Rules management feature exists yet).
 */
export function ExpenseDialog({
  householdId,
  open,
  onOpenChange,
  expense,
  existingSplits,
  existingReceipts,
  accounts,
  categories,
  people,
  onSaved,
}: ExpenseDialogProps) {
  const isEditing = Boolean(expense);
  const alreadyRecurring = Boolean(expense?.recurring_rule_id);
  const [formError, setFormError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(Boolean(existingSplits?.length));
  const [receipts, setReceipts] = useState<ExpenseAttachmentRecord[]>(
    existingReceipts ?? [],
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseInputSchema),
    defaultValues: toDefaultValues(expense, existingSplits),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "splits" });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(expense, existingSplits));
      setSplitMode(Boolean(existingSplits?.length));
      setReceipts(existingReceipts ?? []);
    }
    // existingSplits/existingReceipts are fresh array references each render; only re-seed on open/expense change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const accountId = watch("accountId");
  const isRecurring = watch("isRecurring");

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.categoryKind === "expense"),
    [categories],
  );

  function onSubmit(values: ExpenseInput) {
    setFormError(null);
    const payload: ExpenseInput = {
      ...values,
      splits: splitMode ? values.splits : undefined,
      categoryId: splitMode ? null : values.categoryId,
      recurringFrequency: values.isRecurring ? values.recurringFrequency : null,
      recurringIntervalCount: values.isRecurring
        ? (values.recurringIntervalCount ?? 1)
        : null,
    };
    startTransition(async () => {
      const result = isEditing
        ? await updateExpenseAction(householdId, expense!.id, payload)
        : await createExpenseAction(householdId, payload);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Expense updated" : "Expense added");
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

  async function handleReceiptUpload(file: File) {
    if (!expense) {
      return;
    }
    setIsUploading(true);
    try {
      const browserSupabase = createBrowserClient();
      const path = `${householdId}/transactions/${expense.id}/${crypto.randomUUID()}-${file.name}`;
      const uploadResult = await browserSupabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadResult.error) {
        toast.error("Could not upload the receipt. Please try again.");
        return;
      }

      const result = await attachExpenseReceiptAction(householdId, {
        transactionId: expense.id,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setReceipts((prev) => [result.data, ...prev]);
      toast.success("Receipt attached");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleReceiptView(attachmentId: string) {
    const result = await getExpenseReceiptUrlAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  async function handleReceiptRemove(attachmentId: string) {
    const result = await removeExpenseReceiptAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setReceipts((prev) => prev.filter((r) => r.id !== attachmentId));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit expense" : "Add expense"}
          </DialogTitle>
          <DialogDescription>
            Record money spent from an account.
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
              <Label htmlFor="accountId">Account</Label>
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="counterparty">Merchant / counterparty</Label>
              <Input id="counterparty" {...register("counterparty")} />
            </div>
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
          </div>

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
                {expenseCategories.map((category) => (
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
                      {expenseCategories.map((category) => (
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
                  Split amounts must add up to exactly the expense total.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input size-4 rounded"
                  {...register("isPlanned")}
                />
                Planned / budgeted for
              </label>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            {alreadyRecurring ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Recurring</Badge>
                  <span className="text-muted-foreground text-xs">
                    This expense is linked to a recurring rule.
                  </span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    checked={!isRecurring}
                    onChange={(event) =>
                      setValue("isRecurring", !event.target.checked)
                    }
                  />
                  Stop recurring (make this a one-time expense)
                </label>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("isRecurring")}
                  />
                  Recurring expense
                </label>
                {isRecurring && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="recurringFrequency">Frequency</Label>
                      <NativeSelect
                        id="recurringFrequency"
                        {...register("recurringFrequency")}
                      >
                        <option value="">Choose a frequency</option>
                        {FREQUENCY_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </NativeSelect>
                      <FormErrorMessage
                        message={errors.recurringFrequency?.message}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="recurringIntervalCount">
                        Every N cycles
                      </Label>
                      <Input
                        id="recurringIntervalCount"
                        type="number"
                        min={1}
                        max={365}
                        {...register("recurringIntervalCount", {
                          valueAsNumber: true,
                        })}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Notes (optional)</Label>
            <Input id="description" {...register("description")} />
          </div>

          <div className="space-y-2">
            <Label>Receipt</Label>
            {!expense ? (
              <p className="text-muted-foreground text-xs">
                Save the expense first, then come back here to attach a receipt.
              </p>
            ) : (
              <div className="space-y-2">
                {receipts.length > 0 && (
                  <ul className="space-y-1.5">
                    {receipts.map((receipt) => (
                      <li
                        key={receipt.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate">
                          {receipt.file_name}
                          {receipt.size_bytes ? (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {formatFileSize(receipt.size_bytes)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReceiptView(receipt.id)}
                            aria-label={`View ${receipt.file_name}`}
                          >
                            <DownloadIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReceiptRemove(receipt.id)}
                            aria-label={`Remove ${receipt.file_name}`}
                          >
                            <XIcon />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="border-input hover:bg-accent/50 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                  <UploadIcon className="size-4" />
                  {isUploading ? "Uploading…" : "Upload a receipt"}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={isUploading}
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void handleReceiptUpload(file);
                      }
                    }}
                  />
                </label>
              </div>
            )}
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
                  : "Add expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
