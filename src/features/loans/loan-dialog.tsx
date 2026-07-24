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
import {
  LOAN_INTEREST_TYPE_LABELS,
  LOAN_TYPE_LABELS,
  loanInputSchema,
  type LoanInput,
} from "@/lib/validation/loans";
import { createLoanAction, updateLoanAction } from "./actions";
import type { LoanRow } from "./queries";

export type SelectOption = { id: string; label: string };

type LoanDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan?: LoanRow | null;
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  onSaved?: () => void;
};

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPE_LABELS) as [
  keyof typeof LOAN_TYPE_LABELS,
  string,
][];
const INTEREST_TYPE_OPTIONS = Object.entries(LOAN_INTEREST_TYPE_LABELS) as [
  keyof typeof LOAN_INTEREST_TYPE_LABELS,
  string,
][];

function toDefaultValues(loan?: LoanRow | null): LoanInput {
  return {
    name: loan?.name ?? "",
    loanType: (loan?.loan_type as LoanInput["loanType"]) ?? "personal",
    lenderInstitutionId: loan?.lender_institution_id ?? null,
    lenderPersonId: loan?.lender_person_id ?? null,
    borrowerPersonId: loan?.borrower_person_id ?? "",
    coBorrowerPersonId: loan?.co_borrower_person_id ?? null,
    originalPrincipal: loan
      ? String(loan.original_principal_minor_units / 100)
      : "",
    currencyCode: loan?.currency_code ?? "INR",
    annualInterestRatePercent: loan
      ? String(loan.annual_interest_rate * 100)
      : "",
    interestType: (loan?.interest_type as LoanInput["interestType"]) ?? "fixed",
    emiAmount:
      loan && loan.emi_amount_minor_units !== null
        ? String(loan.emi_amount_minor_units / 100)
        : "",
    startDate: loan?.start_date ?? "",
    repaymentStartDate: loan?.repayment_start_date ?? "",
    maturityDate: loan?.maturity_date ?? null,
    paymentAccountId: loan?.payment_account_id ?? "",
    collateral: loan?.collateral ?? null,
    notes: loan?.notes ?? null,
    educationalInstitutionId: loan?.educational_institution_id ?? null,
    course: loan?.course ?? null,
    studyStartDate: loan?.study_start_date ?? null,
    studyEndDate: loan?.study_end_date ?? null,
    moratorium: loan?.moratorium ?? false,
    moratoriumEndDate: loan?.moratorium_end_date ?? null,
    interestSubsidy: loan?.interest_subsidy ?? false,
    interestSubsidyNotes: loan?.interest_subsidy_notes ?? null,
  };
}

/**
 * Create/edit dialog for a loan's header fields. Status transitions
 * (disbursement, closing, defaulting, settling) are deliberately not
 * editable here — they go through their own dedicated actions
 * (record-payment-dialog.tsx, disburse-dialog.tsx) so a status change is
 * always an intentional, auditable event rather than a side effect of an
 * unrelated edit.
 */
export function LoanDialog({
  householdId,
  open,
  onOpenChange,
  loan,
  institutions,
  people,
  accounts,
  onSaved,
}: LoanDialogProps) {
  const isEditing = Boolean(loan);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<LoanInput>({
    resolver: zodResolver(loanInputSchema),
    defaultValues: toDefaultValues(loan),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(loan));
    }
  }, [open, loan, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const loanType = watch("loanType");
  const moratorium = watch("moratorium");
  const interestSubsidy = watch("interestSubsidy");
  const isEducation = loanType === "education";

  function onSubmit(values: LoanInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateLoanAction(householdId, loan!.id, values)
        : await createLoanAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Loan updated" : "Loan added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleAccountChange(accountId: string) {
    setValue("paymentAccountId", accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit loan" : "Add loan"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this loan's details. Disbursement and payments are recorded separately."
              : "Set up a loan's header details. Nothing is disbursed until you record a disbursement separately."}
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
              <Label htmlFor="loanType">Loan type</Label>
              <NativeSelect id="loanType" {...register("loanType")}>
                {LOAN_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lenderInstitutionId">
                Lender institution (bank/NBFC)
              </Label>
              <NativeSelect
                id="lenderInstitutionId"
                aria-invalid={!!errors.lenderInstitutionId}
                {...register("lenderInstitutionId")}
              >
                <option value="">None</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lenderPersonId">
                Lender person (family/informal)
              </Label>
              <NativeSelect id="lenderPersonId" {...register("lenderPersonId")}>
                <option value="">None</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.lenderInstitutionId?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="borrowerPersonId">Borrower</Label>
              <NativeSelect
                id="borrowerPersonId"
                aria-invalid={!!errors.borrowerPersonId}
                {...register("borrowerPersonId")}
              >
                <option value="">Select a borrower</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.borrowerPersonId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="coBorrowerPersonId">Co-borrower (optional)</Label>
              <NativeSelect
                id="coBorrowerPersonId"
                {...register("coBorrowerPersonId")}
              >
                <option value="">None</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="originalPrincipal">Original principal</Label>
              <Input
                id="originalPrincipal"
                inputMode="decimal"
                aria-invalid={!!errors.originalPrincipal}
                {...register("originalPrincipal")}
              />
              <FormErrorMessage message={errors.originalPrincipal?.message} />
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
              <Label htmlFor="paymentAccountId">Payment account</Label>
              <NativeSelect
                id="paymentAccountId"
                aria-invalid={!!errors.paymentAccountId}
                value={watch("paymentAccountId")}
                onChange={(event) => handleAccountChange(event.target.value)}
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
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
                {INTEREST_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emiAmount">EMI (optional)</Label>
              <Input
                id="emiAmount"
                inputMode="decimal"
                placeholder="Not yet determined"
                {...register("emiAmount")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
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
              <Label htmlFor="repaymentStartDate">Repayment start date</Label>
              <Input
                id="repaymentStartDate"
                type="date"
                aria-invalid={!!errors.repaymentStartDate}
                {...register("repaymentStartDate")}
              />
              <FormErrorMessage message={errors.repaymentStartDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maturityDate">Maturity date (optional)</Label>
              <Input
                id="maturityDate"
                type="date"
                aria-invalid={!!errors.maturityDate}
                {...register("maturityDate")}
              />
              <FormErrorMessage message={errors.maturityDate?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="collateral">Collateral (optional)</Label>
            <Input id="collateral" {...register("collateral")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          {isEducation && (
            <div className="space-y-4 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Education loan details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="educationalInstitutionId">
                    Educational institution
                  </Label>
                  <NativeSelect
                    id="educationalInstitutionId"
                    {...register("educationalInstitutionId")}
                  >
                    <option value="">None</option>
                    {institutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>
                        {institution.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="course">Course</Label>
                  <Input id="course" {...register("course")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="studyStartDate">Study start date</Label>
                  <Input
                    id="studyStartDate"
                    type="date"
                    {...register("studyStartDate")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="studyEndDate">Study end date</Label>
                  <Input
                    id="studyEndDate"
                    type="date"
                    aria-invalid={!!errors.studyEndDate}
                    {...register("studyEndDate")}
                  />
                  <FormErrorMessage message={errors.studyEndDate?.message} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input size-4 rounded"
                  {...register("moratorium")}
                />
                Moratorium period applies
              </label>
              {moratorium && (
                <div className="space-y-1.5">
                  <Label htmlFor="moratoriumEndDate">Moratorium end date</Label>
                  <Input
                    id="moratoriumEndDate"
                    type="date"
                    aria-invalid={!!errors.moratoriumEndDate}
                    {...register("moratoriumEndDate")}
                  />
                  <FormErrorMessage
                    message={errors.moratoriumEndDate?.message}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-input size-4 rounded"
                  {...register("interestSubsidy")}
                />
                Interest subsidy scheme applies
              </label>
              {interestSubsidy && (
                <Input
                  placeholder="Notes on the subsidy scheme"
                  {...register("interestSubsidyNotes")}
                />
              )}
            </div>
          )}

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
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add loan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
