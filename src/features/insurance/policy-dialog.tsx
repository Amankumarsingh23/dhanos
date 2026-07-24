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
  POLICY_TYPE_LABELS,
  PREMIUM_FREQUENCY_LABELS,
  insurancePolicyFieldsSchema,
  type InsurancePolicyFieldsInput,
  type PolicyType,
} from "@/lib/validation/insurance";
import {
  createInsurancePolicyAction,
  renewInsurancePolicyAction,
  updateInsurancePolicyAction,
} from "./actions";
import type { InsurancePolicyRow } from "./queries";

export type SelectOption = { id: string; label: string };

type PolicyDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy?: InsurancePolicyRow | null;
  renewFrom?: InsurancePolicyRow | null;
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  onSaved?: () => void;
};

const POLICY_TYPE_OPTIONS = Object.entries(POLICY_TYPE_LABELS) as [
  PolicyType,
  string,
][];
const PREMIUM_FREQUENCY_OPTIONS = Object.entries(PREMIUM_FREQUENCY_LABELS) as [
  keyof typeof PREMIUM_FREQUENCY_LABELS,
  string,
][];

function toDefaultValues(
  source?: InsurancePolicyRow | null,
): InsurancePolicyFieldsInput {
  return {
    policyType: (source?.policy_type as PolicyType) ?? "health",
    name: source?.name ?? "",
    insurerInstitutionId: source?.insurer_institution_id ?? "",
    policyholderPersonId: source?.policyholder_person_id ?? "",
    insuredPersonIds: source?.insuredPeople.map((p) => p.id) ?? [],
    nomineePersonId: source?.nominee_person_id ?? null,
    maskedPolicyNumber: source?.masked_policy_number ?? null,
    coverageAmount: source
      ? String(source.coverage_amount_minor_units / 100)
      : "",
    currencyCode: source?.currency_code ?? "INR",
    premiumAmount: source
      ? String(source.premium_amount_minor_units / 100)
      : "",
    premiumFrequency:
      (source?.premium_frequency as InsurancePolicyFieldsInput["premiumFrequency"]) ??
      "yearly",
    startDate: source?.start_date ?? "",
    renewalDate: source?.renewal_date ?? null,
    expiryDate: source?.expiry_date ?? null,
    agentName: source?.agent_name ?? null,
    agentContact: source?.agent_contact ?? null,
    supportContact: source?.support_contact ?? null,
    claimContact: source?.claim_contact ?? null,
    notes: source?.notes ?? null,
    paymentAccountId: source?.payment_account_id ?? "",
    deductible:
      source && source.deductible_minor_units !== null
        ? String(source.deductible_minor_units / 100)
        : "",
    coPayPercent:
      source && source.co_pay_percentage !== null
        ? String(source.co_pay_percentage * 100)
        : "",
    roomRentRestriction: source?.room_rent_restriction ?? null,
    preExistingConditionsDeclared:
      source?.pre_existing_conditions_declared ?? null,
    waitingPeriods: source?.waiting_periods ?? null,
    networkHospitalNotes: source?.network_hospital_notes ?? null,
    cashlessAvailability: source?.cashless_availability ?? null,
    restorationBenefit: source?.restoration_benefit ?? null,
    noClaimBonus: source?.no_claim_bonus ?? null,
    opdCover: source?.opd_cover ?? null,
    consumablesCover: source?.consumables_cover ?? null,
    preHospitalizationDays:
      source && source.pre_hospitalization_days !== null
        ? String(source.pre_hospitalization_days)
        : "",
    postHospitalizationDays:
      source && source.post_hospitalization_days !== null
        ? String(source.post_hospitalization_days)
        : "",
    dayCareTreatment: source?.day_care_treatment ?? null,
    exclusionsSummary: source?.exclusions_summary ?? null,
  };
}

/**
 * Create/edit/renew dialog for an insurance policy — one shared form for
 * all three flows (PROMPT 25), since they collect the same field shape.
 * Renewing pre-fills from the policy being renewed but always writes a
 * brand-new row (create_insurance_policy with previousPolicyId set) —
 * the old period is never edited. Health-specific fields only render for
 * policyType = 'health'.
 */
export function PolicyDialog({
  householdId,
  open,
  onOpenChange,
  policy,
  renewFrom,
  people,
  institutions,
  accounts,
  onSaved,
}: PolicyDialogProps) {
  const isEditing = Boolean(policy);
  const isRenewing = Boolean(renewFrom);
  const source = policy ?? renewFrom ?? null;
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InsurancePolicyFieldsInput>({
    resolver: zodResolver(insurancePolicyFieldsSchema),
    defaultValues: toDefaultValues(source),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(source));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, policy, renewFrom, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const policyType = watch("policyType");
  const insuredPersonIds = watch("insuredPersonIds") ?? [];
  const isHealth = policyType === "health";

  function toggleInsuredPerson(personId: string) {
    const current = watch("insuredPersonIds") ?? [];
    setValue(
      "insuredPersonIds",
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
      { shouldValidate: true },
    );
  }

  function handleAccountChange(accountId: string) {
    setValue("paymentAccountId", accountId);
    const account = accounts.find((a) => a.id === accountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  function onSubmit(values: InsurancePolicyFieldsInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isRenewing && renewFrom
          ? await renewInsurancePolicyAction(householdId, renewFrom.id, values)
          : isEditing && policy
            ? await updateInsurancePolicyAction(householdId, policy.id, values)
            : await createInsurancePolicyAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(
        isRenewing
          ? "Policy renewed"
          : isEditing
            ? "Policy updated"
            : "Policy added",
      );
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isRenewing
              ? "Renew policy"
              : isEditing
                ? "Edit policy"
                : "Add insurance policy"}
          </DialogTitle>
          <DialogDescription>
            {isRenewing
              ? "This creates a new policy period linked back to the current one — the current period's own dates and terms are never overwritten."
              : "A tracking summary for your own records — not a legal interpretation of the actual policy document. Refer to the official policy for exact terms."}
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
              <Label htmlFor="name">Policy name</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FormErrorMessage message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="policyType">Policy type</Label>
              <NativeSelect id="policyType" {...register("policyType")}>
                {POLICY_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="insurerInstitutionId">Insurer</Label>
              <NativeSelect
                id="insurerInstitutionId"
                aria-invalid={!!errors.insurerInstitutionId}
                {...register("insurerInstitutionId")}
              >
                <option value="">Select an insurer</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage
                message={errors.insurerInstitutionId?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="policyholderPersonId">Policyholder</Label>
              <NativeSelect
                id="policyholderPersonId"
                aria-invalid={!!errors.policyholderPersonId}
                {...register("policyholderPersonId")}
              >
                <option value="">Select a policyholder</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage
                message={errors.policyholderPersonId?.message}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Insured people</Label>
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {people.map((person) => (
                <label
                  key={person.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    checked={insuredPersonIds.includes(person.id)}
                    onChange={() => toggleInsuredPerson(person.id)}
                  />
                  {person.label}
                </label>
              ))}
            </div>
            <FormErrorMessage message={errors.insuredPersonIds?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nomineePersonId">Nominee (optional)</Label>
              <NativeSelect
                id="nomineePersonId"
                {...register("nomineePersonId")}
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
              <Label htmlFor="maskedPolicyNumber">Policy number (masked)</Label>
              <Input
                id="maskedPolicyNumber"
                placeholder="e.g. XXXX-XXXX-4821"
                {...register("maskedPolicyNumber")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="coverageAmount">Coverage amount</Label>
              <Input
                id="coverageAmount"
                inputMode="decimal"
                aria-invalid={!!errors.coverageAmount}
                {...register("coverageAmount")}
              />
              <FormErrorMessage message={errors.coverageAmount?.message} />
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="premiumAmount">Premium amount</Label>
              <Input
                id="premiumAmount"
                inputMode="decimal"
                aria-invalid={!!errors.premiumAmount}
                {...register("premiumAmount")}
              />
              <FormErrorMessage message={errors.premiumAmount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="premiumFrequency">Premium frequency</Label>
              <NativeSelect
                id="premiumFrequency"
                {...register("premiumFrequency")}
              >
                {PREMIUM_FREQUENCY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
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
              <Label htmlFor="renewalDate">Renewal date (optional)</Label>
              <Input
                id="renewalDate"
                type="date"
                aria-invalid={!!errors.renewalDate}
                {...register("renewalDate")}
              />
              <FormErrorMessage message={errors.renewalDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Expiry date (optional)</Label>
              <Input
                id="expiryDate"
                type="date"
                aria-invalid={!!errors.expiryDate}
                {...register("expiryDate")}
              />
              <FormErrorMessage message={errors.expiryDate?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agentName">Agent name (optional)</Label>
              <Input id="agentName" {...register("agentName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agentContact">Agent contact (optional)</Label>
              <Input id="agentContact" {...register("agentContact")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supportContact">Support contact (optional)</Label>
              <Input id="supportContact" {...register("supportContact")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="claimContact">Claim contact (optional)</Label>
              <Input id="claimContact" {...register("claimContact")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          {isHealth && (
            <div className="space-y-4 rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Health policy details</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="deductible">Deductible (optional)</Label>
                  <Input
                    id="deductible"
                    inputMode="decimal"
                    {...register("deductible")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="coPayPercent">Co-pay % (optional)</Label>
                  <Input
                    id="coPayPercent"
                    inputMode="decimal"
                    {...register("coPayPercent")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="roomRentRestriction">
                    Room rent restriction (optional)
                  </Label>
                  <Input
                    id="roomRentRestriction"
                    {...register("roomRentRestriction")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="preExistingConditionsDeclared">
                    Pre-existing conditions declared (optional)
                  </Label>
                  <Input
                    id="preExistingConditionsDeclared"
                    {...register("preExistingConditionsDeclared")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="waitingPeriods">
                    Waiting periods (optional)
                  </Label>
                  <Input id="waitingPeriods" {...register("waitingPeriods")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="networkHospitalNotes">
                    Network-hospital notes (optional)
                  </Label>
                  <Input
                    id="networkHospitalNotes"
                    {...register("networkHospitalNotes")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="noClaimBonus">
                    No-claim bonus (optional)
                  </Label>
                  <Input id="noClaimBonus" {...register("noClaimBonus")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="preHospitalizationDays">
                    Pre-hospitalization days (optional)
                  </Label>
                  <Input
                    id="preHospitalizationDays"
                    inputMode="numeric"
                    {...register("preHospitalizationDays")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postHospitalizationDays">
                    Post-hospitalization days (optional)
                  </Label>
                  <Input
                    id="postHospitalizationDays"
                    inputMode="numeric"
                    {...register("postHospitalizationDays")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="exclusionsSummary">
                    Exclusions summary (optional)
                  </Label>
                  <Input
                    id="exclusionsSummary"
                    {...register("exclusionsSummary")}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("cashlessAvailability")}
                  />
                  Cashless availability
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("restorationBenefit")}
                  />
                  Restoration benefit
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("opdCover")}
                  />
                  OPD cover
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("consumablesCover")}
                  />
                  Consumables cover
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="border-input size-4 rounded"
                    {...register("dayCareTreatment")}
                  />
                  Day-care treatment
                </label>
              </div>
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
              {isPending
                ? "Saving…"
                : isRenewing
                  ? "Renew policy"
                  : isEditing
                    ? "Save changes"
                    : "Add policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
