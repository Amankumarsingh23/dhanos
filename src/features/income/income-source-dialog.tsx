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
import { minorUnitExponent } from "@/lib/money/currency";
import {
  INCOME_FREQUENCY_LABELS,
  INCOME_SOURCE_TYPE_LABELS,
  incomeSourceInputSchema,
  type IncomeSourceInput,
} from "@/lib/validation/income-sources";
import { createIncomeSourceAction, updateIncomeSourceAction } from "./actions";
import type { IncomeSourceRow } from "./queries";

export type SelectOption = { id: string; label: string };

type IncomeSourceDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  source?: IncomeSourceRow | null;
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  categories: SelectOption[];
  onSaved?: () => void;
};

const SOURCE_TYPE_OPTIONS = Object.entries(INCOME_SOURCE_TYPE_LABELS) as [
  keyof typeof INCOME_SOURCE_TYPE_LABELS,
  string,
][];
const FREQUENCY_OPTIONS = Object.entries(INCOME_FREQUENCY_LABELS) as [
  keyof typeof INCOME_FREQUENCY_LABELS,
  string,
][];

function toDefaultValues(source?: IncomeSourceRow | null): IncomeSourceInput {
  return {
    name: source?.name ?? "",
    sourceType:
      (source?.source_type as IncomeSourceInput["sourceType"]) ?? "salary",
    institutionId: source?.institution_id ?? null,
    personId: source?.person_id ?? null,
    expectedAmount:
      source && source.expected_amount_minor_units !== null
        ? (
            source.expected_amount_minor_units /
            10 ** minorUnitExponent(source.currency_code)
          ).toString()
        : "",
    currencyCode: source?.currency_code ?? "INR",
    frequency:
      (source?.frequency as IncomeSourceInput["frequency"]) ?? "monthly",
    expectedDayOfMonth: source?.expected_day_of_month ?? null,
    expectedPaymentDateRule: source?.expected_payment_date_rule ?? null,
    receivingAccountId: source?.receiving_account_id ?? "",
    categoryId: source?.category_id ?? null,
    startDate: source?.start_date ?? "",
    endDate: source?.end_date ?? null,
    taxWithholdingExpected: source?.tax_withholding_expected ?? false,
    taxWithholdingNotes: source?.tax_withholding_notes ?? null,
    isActive: source?.is_active ?? true,
    notes: source?.notes ?? null,
  };
}

/**
 * Create/edit dialog for an income source — the *expectation* only.
 * Nothing here writes a transaction; see record-income-dialog.tsx for the
 * actual-receipt flow (PROMPT 11 acceptance criterion "Source setup does
 * not itself create income").
 */
export function IncomeSourceDialog({
  householdId,
  open,
  onOpenChange,
  source,
  institutions,
  people,
  accounts,
  categories,
  onSaved,
}: IncomeSourceDialogProps) {
  const isEditing = Boolean(source);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<IncomeSourceInput>({
    resolver: zodResolver(incomeSourceInputSchema),
    defaultValues: toDefaultValues(source),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(source));
    }
  }, [open, source, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const frequency = watch("frequency");
  const needsDayOfMonth =
    frequency !== "weekly" &&
    frequency !== "biweekly" &&
    frequency !== "irregular";
  const taxWithholdingExpected = watch("taxWithholdingExpected");

  function onSubmit(values: IncomeSourceInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateIncomeSourceAction(householdId, source!.id, values)
        : await createIncomeSourceAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(
        isEditing ? "Income source updated" : "Income source added",
      );
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleAccountChange(accountId: string) {
    setValue("receivingAccountId", accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit income source" : "Add income source"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this source's details. Adding or editing a source never records income by itself."
              : "Declare an expected income stream. This only sets up the expectation — record an actual receipt separately from the source's page."}
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
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sourceType">Type</Label>
              <NativeSelect id="sourceType" {...register("sourceType")}>
                {SOURCE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.sourceType?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personId">Person earning (optional)</Label>
              <NativeSelect id="personId" {...register("personId")}>
                <option value="">Unassigned</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="institutionId">
              Institution / employer / client (optional)
            </Label>
            <NativeSelect id="institutionId" {...register("institutionId")}>
              <option value="">None</option>
              {institutions.map((institution) => (
                <option key={institution.id} value={institution.id}>
                  {institution.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="receivingAccountId">Receiving account</Label>
              <NativeSelect
                id="receivingAccountId"
                aria-invalid={!!errors.receivingAccountId}
                value={watch("receivingAccountId")}
                onChange={(event) => handleAccountChange(event.target.value)}
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.receivingAccountId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="categoryId">Default category (optional)</Label>
              <NativeSelect id="categoryId" {...register("categoryId")}>
                <option value="">None</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expectedAmount">Expected amount (optional)</Label>
              <Input
                id="expectedAmount"
                inputMode="decimal"
                placeholder="No fixed amount"
                aria-invalid={!!errors.expectedAmount}
                {...register("expectedAmount")}
              />
              <FormErrorMessage message={errors.expectedAmount?.message} />
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
              <Label htmlFor="frequency">Frequency</Label>
              <NativeSelect id="frequency" {...register("frequency")}>
                {FREQUENCY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.frequency?.message} />
            </div>
            {needsDayOfMonth && (
              <div className="space-y-1.5">
                <Label htmlFor="expectedDayOfMonth">
                  Expected day of month
                </Label>
                <Input
                  id="expectedDayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  aria-invalid={!!errors.expectedDayOfMonth}
                  {...register("expectedDayOfMonth", { valueAsNumber: true })}
                />
                <FormErrorMessage
                  message={errors.expectedDayOfMonth?.message}
                />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedPaymentDateRule">
              Expected payment date rule (optional)
            </Label>
            <Input
              id="expectedPaymentDateRule"
              placeholder="e.g. last working day of the month"
              {...register("expectedPaymentDateRule")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                aria-invalid={!!errors.startDate}
                {...register("startDate")}
              />
              <FormErrorMessage message={errors.startDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                aria-invalid={!!errors.endDate}
                {...register("endDate")}
              />
              <FormErrorMessage message={errors.endDate?.message} />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input size-4 rounded"
                {...register("taxWithholdingExpected")}
              />
              Tax withholding expected (e.g. TDS)
            </label>
            {taxWithholdingExpected && (
              <Input
                placeholder="Notes on withholding, e.g. rate or authority"
                {...register("taxWithholdingNotes")}
              />
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="border-input size-4 rounded"
              {...register("isActive")}
            />
            Active
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
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
                  : "Add source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
