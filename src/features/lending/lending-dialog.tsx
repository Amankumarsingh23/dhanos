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
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  LENDING_INSTALLMENT_FREQUENCY_LABELS,
  LENDING_INTEREST_TYPE_LABELS,
  LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS,
  LENDING_RISK_LEVEL_LABELS,
  createLendingSchema,
  type CreateLendingInput,
} from "@/lib/validation/lending";
import { createLendingAction, updateLendingAction } from "./actions";
import type { LendingRow } from "./queries";

export type SelectOption = { id: string; label: string };

type LendingDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lending?: LendingRow | null;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  onSaved?: () => void;
};

const INTEREST_TYPE_OPTIONS = Object.entries(LENDING_INTEREST_TYPE_LABELS) as [
  keyof typeof LENDING_INTEREST_TYPE_LABELS,
  string,
][];
const SCHEDULE_TYPE_OPTIONS = Object.entries(
  LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS,
) as [keyof typeof LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS, string][];
const INSTALLMENT_FREQUENCY_OPTIONS = Object.entries(
  LENDING_INSTALLMENT_FREQUENCY_LABELS,
) as [keyof typeof LENDING_INSTALLMENT_FREQUENCY_LABELS, string][];
const RISK_LEVEL_OPTIONS = Object.entries(LENDING_RISK_LEVEL_LABELS) as [
  keyof typeof LENDING_RISK_LEVEL_LABELS,
  string,
][];

function toDefaultValues(lending?: LendingRow | null): CreateLendingInput {
  return {
    name: lending?.name ?? "",
    borrowerPersonId: lending?.borrower_person_id ?? null,
    borrowerInstitutionId: lending?.borrower_institution_id ?? null,
    sourceAccountId: lending?.source_account_id ?? "",
    amountLent: lending ? String(lending.amount_lent_minor_units / 100) : "",
    currencyCode: lending?.currency_code ?? "INR",
    disbursedDate: lending?.disbursed_date ?? "",
    purpose: lending?.purpose ?? null,
    chargesInterest: lending?.charges_interest ?? false,
    annualInterestRatePercent:
      lending?.annual_interest_rate !== null &&
      lending?.annual_interest_rate !== undefined
        ? String(lending.annual_interest_rate * 100)
        : "",
    interestType:
      (lending?.interest_type as CreateLendingInput["interestType"]) ?? null,
    expectedRepaymentDate: lending?.expected_repayment_date ?? null,
    repaymentScheduleType:
      (lending?.repayment_schedule_type as CreateLendingInput["repaymentScheduleType"]) ??
      "lump_sum",
    installmentAmount:
      lending && lending.installment_amount_minor_units !== null
        ? String(lending.installment_amount_minor_units / 100)
        : "",
    installmentFrequency:
      (lending?.installment_frequency as CreateLendingInput["installmentFrequency"]) ??
      null,
    riskLevel:
      (lending?.risk_level as CreateLendingInput["riskLevel"]) ?? "medium",
    notes: lending?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a lending record. Unlike loans, there is no
 * separate disbursement step — amount lent, disbursed date, source
 * account, and currency are collected once at creation (create_lending)
 * and shown read-only afterward, since they're already reflected in the
 * one-time lending_disbursement transaction the RPC wrote alongside them.
 * Status transitions (repaid/delayed/disputed/written off) are deliberately
 * not editable here — see lending-detail-view.tsx.
 */
export function LendingDialog({
  householdId,
  open,
  onOpenChange,
  lending,
  people,
  institutions,
  accounts,
  onSaved,
}: LendingDialogProps) {
  const isEditing = Boolean(lending);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateLendingInput>({
    resolver: zodResolver(createLendingSchema),
    defaultValues: toDefaultValues(lending),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(lending));
    }
  }, [open, lending, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const chargesInterest = watch("chargesInterest");
  const repaymentScheduleType = watch("repaymentScheduleType");

  function onSubmit(values: CreateLendingInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && lending
          ? await updateLendingAction(householdId, lending.id, values)
          : await createLendingAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Lending updated" : "Lending recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleAccountChange(accountId: string) {
    setValue("sourceAccountId", accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit lending" : "Record money lent"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this lending's terms. The amount lent, source account, and disbursement date are fixed once recorded."
              : "Recording this writes a lending disbursement transaction immediately — it is never treated as a consumption expense."}
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

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="borrowerPersonId">Borrower person</Label>
              <NativeSelect
                id="borrowerPersonId"
                aria-invalid={!!errors.borrowerPersonId}
                {...register("borrowerPersonId")}
              >
                <option value="">None</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.borrowerPersonId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrowerInstitutionId">
                Borrower company/institution
              </Label>
              <NativeSelect
                id="borrowerInstitutionId"
                {...register("borrowerInstitutionId")}
              >
                <option value="">None</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {isEditing && lending ? (
            <dl className="grid gap-4 rounded-lg border p-3 sm:grid-cols-3">
              <Field
                label="Amount lent"
                value={formatMoney({
                  amountMinorUnits: lending.amount_lent_minor_units,
                  currencyCode: lending.currency_code,
                })}
              />
              <Field
                label="Disbursed date"
                value={formatDisplayDate(lending.disbursed_date)}
              />
              <Field label="Source account" value={lending.sourceAccountName} />
            </dl>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="amountLent">Amount lent</Label>
                <Input
                  id="amountLent"
                  inputMode="decimal"
                  aria-invalid={!!errors.amountLent}
                  {...register("amountLent")}
                />
                <FormErrorMessage message={errors.amountLent?.message} />
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
              <div className="space-y-1.5">
                <Label htmlFor="sourceAccountId">Source account</Label>
                <NativeSelect
                  id="sourceAccountId"
                  aria-invalid={!!errors.sourceAccountId}
                  value={watch("sourceAccountId")}
                  onChange={(event) => handleAccountChange(event.target.value)}
                >
                  <option value="">Select an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </NativeSelect>
                <FormErrorMessage message={errors.sourceAccountId?.message} />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="disbursedDate">Disbursement date</Label>
                <Input
                  id="disbursedDate"
                  type="date"
                  aria-invalid={!!errors.disbursedDate}
                  {...register("disbursedDate")}
                />
                <FormErrorMessage message={errors.disbursedDate?.message} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="purpose">Purpose (optional)</Label>
            <Input id="purpose" {...register("purpose")} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expectedRepaymentDate">
                Expected repayment date (optional)
              </Label>
              <Input
                id="expectedRepaymentDate"
                type="date"
                {...register("expectedRepaymentDate")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="riskLevel">Risk level</Label>
              <NativeSelect id="riskLevel" {...register("riskLevel")}>
                {RISK_LEVEL_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="repaymentScheduleType">Repayment schedule</Label>
              <NativeSelect
                id="repaymentScheduleType"
                {...register("repaymentScheduleType")}
              >
                {SCHEDULE_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {repaymentScheduleType === "installments" && (
              <div className="grid gap-4 sm:col-span-1 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="installmentAmount">Installment amount</Label>
                  <Input
                    id="installmentAmount"
                    inputMode="decimal"
                    aria-invalid={!!errors.installmentAmount}
                    {...register("installmentAmount")}
                  />
                  <FormErrorMessage
                    message={errors.installmentAmount?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="installmentFrequency">Frequency</Label>
                  <NativeSelect
                    id="installmentFrequency"
                    {...register("installmentFrequency")}
                  >
                    <option value="">Select</option>
                    {INSTALLMENT_FREQUENCY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input size-4 rounded"
                {...register("chargesInterest")}
              />
              This lending charges interest
            </label>
            {chargesInterest && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="annualInterestRatePercent">
                    Annual interest rate (% per year)
                  </Label>
                  <Input
                    id="annualInterestRatePercent"
                    inputMode="decimal"
                    aria-invalid={!!errors.annualInterestRatePercent}
                    {...register("annualInterestRatePercent")}
                  />
                  <FormErrorMessage
                    message={errors.annualInterestRatePercent?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="interestType">Interest type</Label>
                  <NativeSelect id="interestType" {...register("interestType")}>
                    <option value="">Select</option>
                    {INTEREST_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            )}
          </div>

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
                  : "Record lending"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
