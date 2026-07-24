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
  CATEGORIES_BY_SOURCE,
  LIABILITY_CATEGORY_LABELS,
  LIABILITY_CERTAINTY_LABELS,
  LIABILITY_DOCUMENTATION_STATUS_LABELS,
  LIABILITY_INSTALLMENT_FREQUENCY_LABELS,
  LIABILITY_INTEREST_TYPE_LABELS,
  LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS,
  LIABILITY_SOURCE_LABELS,
  createLiabilitySchema,
  type CreateLiabilityInput,
  type LiabilitySource,
} from "@/lib/validation/liabilities";
import { createLiabilityAction, updateLiabilityAction } from "./actions";
import type { LiabilityRow } from "./queries";

export type SelectOption = { id: string; label: string };

type LiabilityDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability?: LiabilityRow | null;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  onSaved?: () => void;
};

const SOURCE_OPTIONS = Object.entries(LIABILITY_SOURCE_LABELS) as [
  LiabilitySource,
  string,
][];
const DOCUMENTATION_OPTIONS = Object.entries(
  LIABILITY_DOCUMENTATION_STATUS_LABELS,
) as [keyof typeof LIABILITY_DOCUMENTATION_STATUS_LABELS, string][];
const CERTAINTY_OPTIONS = Object.entries(LIABILITY_CERTAINTY_LABELS) as [
  keyof typeof LIABILITY_CERTAINTY_LABELS,
  string,
][];
const INTEREST_TYPE_OPTIONS = Object.entries(
  LIABILITY_INTEREST_TYPE_LABELS,
) as [keyof typeof LIABILITY_INTEREST_TYPE_LABELS, string][];
const SCHEDULE_TYPE_OPTIONS = Object.entries(
  LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS,
) as [keyof typeof LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS, string][];
const INSTALLMENT_FREQUENCY_OPTIONS = Object.entries(
  LIABILITY_INSTALLMENT_FREQUENCY_LABELS,
) as [keyof typeof LIABILITY_INSTALLMENT_FREQUENCY_LABELS, string][];

function toDefaultValues(
  liability?: LiabilityRow | null,
): CreateLiabilityInput {
  return {
    name: liability?.name ?? "",
    liabilitySource:
      (liability?.liability_source as CreateLiabilityInput["liabilitySource"]) ??
      "informal_borrowing",
    category:
      (liability?.category as CreateLiabilityInput["category"]) ?? "family",
    counterpartyPersonId: liability?.counterparty_person_id ?? null,
    counterpartyInstitutionId: liability?.counterparty_institution_id ?? null,
    amount: liability ? String(liability.amount_minor_units / 100) : "",
    currencyCode: liability?.currency_code ?? "INR",
    startDate: liability?.start_date ?? "",
    dueDate: liability?.due_date ?? null,
    chargesInterest: liability?.charges_interest ?? false,
    annualInterestRatePercent:
      liability?.annual_interest_rate !== null &&
      liability?.annual_interest_rate !== undefined
        ? String(liability.annual_interest_rate * 100)
        : "",
    interestType:
      (liability?.interest_type as CreateLiabilityInput["interestType"]) ??
      null,
    repaymentScheduleType:
      (liability?.repayment_schedule_type as CreateLiabilityInput["repaymentScheduleType"]) ??
      "lump_sum",
    installmentAmount:
      liability && liability.installment_amount_minor_units !== null
        ? String(liability.installment_amount_minor_units / 100)
        : "",
    installmentFrequency:
      (liability?.installment_frequency as CreateLiabilityInput["installmentFrequency"]) ??
      null,
    documentationStatus:
      (liability?.documentation_status as CreateLiabilityInput["documentationStatus"]) ??
      "none",
    certainty:
      (liability?.certainty as CreateLiabilityInput["certainty"]) ??
      "confirmed",
    paymentAccountId: liability?.payment_account_id ?? "",
    receivingAccountId: liability?.receiving_account_id ?? null,
    receivedDate: liability?.received_date ?? null,
    notes: liability?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a liability's terms. Unlike loans/lending, this
 * covers two conceptually different things (informal borrowing and general
 * obligations — PROMPT 24), so the borrower's receiving side is entirely
 * optional and only offered for `liabilitySource = 'informal_borrowing'`.
 * The amount, start date, and any receiving account are fixed once
 * recorded (create_liability) since they're already reflected in the
 * one-time liability_incurred transaction, if any.
 */
export function LiabilityDialog({
  householdId,
  open,
  onOpenChange,
  liability,
  people,
  institutions,
  accounts,
  onSaved,
}: LiabilityDialogProps) {
  const isEditing = Boolean(liability);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateLiabilityInput>({
    resolver: zodResolver(createLiabilitySchema),
    defaultValues: toDefaultValues(liability),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(liability));
    }
  }, [open, liability, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const liabilitySource = watch("liabilitySource");
  const chargesInterest = watch("chargesInterest");
  const repaymentScheduleType = watch("repaymentScheduleType");
  const receivingAccountId = watch("receivingAccountId");
  const categoryOptions = CATEGORIES_BY_SOURCE[liabilitySource];

  function onSubmit(values: CreateLiabilityInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && liability
          ? await updateLiabilityAction(householdId, liability.id, values)
          : await createLiabilityAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Liability updated" : "Liability recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleSourceChange(source: LiabilitySource) {
    setValue("liabilitySource", source);
    setValue(
      "category",
      source === "informal_borrowing" ? "family" : "unpaid_tax",
    );
    if (source === "general_obligation") {
      setValue("receivingAccountId", null);
      setValue("receivedDate", null);
    }
  }

  function handleReceivingAccountChange(accountId: string) {
    setValue("receivingAccountId", accountId || null);
    setValue("receivedDate", accountId ? watch("startDate") : null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit liability" : "Add liability"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this liability's terms. The amount, start date, and any receiving account are fixed once recorded."
              : "Informal borrowing (family/friend/employer advance/business borrowing) or a general obligation (tax/bill/contract/guarantee) — never a consumption expense on its own."}
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
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FormErrorMessage message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liabilitySource">Liability source</Label>
              <NativeSelect
                id="liabilitySource"
                value={liabilitySource}
                onChange={(event) =>
                  handleSourceChange(event.target.value as LiabilitySource)
                }
              >
                {SOURCE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <NativeSelect
              id="category"
              aria-invalid={!!errors.category}
              {...register("category")}
            >
              {categoryOptions.map((value) => (
                <option key={value} value={value}>
                  {LIABILITY_CATEGORY_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage message={errors.category?.message} />
          </div>

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="counterpartyPersonId">
                Counterparty person (lender/payee)
              </Label>
              <NativeSelect
                id="counterpartyPersonId"
                {...register("counterpartyPersonId")}
              >
                <option value="">None</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counterpartyInstitutionId">
                Counterparty institution
              </Label>
              <NativeSelect
                id="counterpartyInstitutionId"
                {...register("counterpartyInstitutionId")}
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

          {isEditing && liability ? (
            <dl className="grid gap-4 rounded-lg border p-3 sm:grid-cols-3">
              <Field
                label="Amount"
                value={formatMoney({
                  amountMinorUnits: liability.amount_minor_units,
                  currencyCode: liability.currency_code,
                })}
              />
              <Field
                label="Start date"
                value={formatDisplayDate(liability.start_date)}
              />
              <Field
                label="Received into"
                value={liability.receivingAccountName ?? "No cash received"}
              />
            </dl>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    aria-invalid={!!errors.amount}
                    {...register("amount")}
                  />
                  <FormErrorMessage message={errors.amount?.message} />
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
                  <Label htmlFor="startDate">Start date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    aria-invalid={!!errors.startDate}
                    {...register("startDate")}
                  />
                  <FormErrorMessage message={errors.startDate?.message} />
                </div>
              </div>
              {liabilitySource === "informal_borrowing" && (
                <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="receivingAccountId">
                      Received into (optional — only if cash actually moved)
                    </Label>
                    <NativeSelect
                      id="receivingAccountId"
                      value={receivingAccountId ?? ""}
                      onChange={(event) =>
                        handleReceivingAccountChange(event.target.value)
                      }
                    >
                      <option value="">No cash received</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <FormErrorMessage
                      message={errors.receivingAccountId?.message}
                    />
                  </div>
                  {receivingAccountId && (
                    <div className="space-y-1.5">
                      <Label htmlFor="receivedDate">Date received</Label>
                      <Input
                        id="receivedDate"
                        type="date"
                        aria-invalid={!!errors.receivedDate}
                        {...register("receivedDate")}
                      />
                      <FormErrorMessage
                        message={errors.receivedDate?.message}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="documentationStatus">Documentation status</Label>
              <NativeSelect
                id="documentationStatus"
                {...register("documentationStatus")}
              >
                {DOCUMENTATION_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certainty">Certainty</Label>
              <NativeSelect id="certainty" {...register("certainty")}>
                {CERTAINTY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="paymentAccountId">
              Payment account (where a payment would come from)
            </Label>
            <NativeSelect
              id="paymentAccountId"
              aria-invalid={!!errors.paymentAccountId}
              {...register("paymentAccountId")}
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </NativeSelect>
            <FormErrorMessage message={errors.paymentAccountId?.message} />
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
              <div className="grid gap-4 sm:grid-cols-2">
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
              This liability charges interest
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
                  : "Add liability"}
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
