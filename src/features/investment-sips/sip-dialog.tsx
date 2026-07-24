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
  CREATE_NEW_OPTION_VALUE,
  INVESTMENT_SIP_STATUS_LABELS,
  SIP_FREQUENCY_LABELS,
  investmentSipInputSchema,
  type InvestmentSipInput,
  type SipFrequency,
} from "@/lib/validation/investment-sips";
import {
  INVESTMENT_ASSET_CLASS_LABELS,
  type InvestmentAssetClass,
} from "@/lib/validation/investments";
import { createSipAction, updateSipAction } from "./actions";
import type {
  InvestmentAccountRecord,
  InvestmentAssetRecord,
  InvestmentSipRow,
} from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type InstitutionOption = { id: string; name: string };

type SipDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  sip?: InvestmentSipRow | null;
  assets: InvestmentAssetRecord[];
  platforms: InvestmentAccountRecord[];
  institutions: InstitutionOption[];
  contributionAccounts: AccountOption[];
  defaultCurrencyCode: string;
  onSaved?: () => void;
};

const FREQUENCY_OPTIONS = Object.entries(SIP_FREQUENCY_LABELS) as [
  SipFrequency,
  string,
][];
const ASSET_CLASS_OPTIONS = Object.entries(INVESTMENT_ASSET_CLASS_LABELS) as [
  InvestmentAssetClass,
  string,
][];
const INITIAL_STATUS_OPTIONS = (["planned", "active"] as const).map(
  (value) => [value, INVESTMENT_SIP_STATUS_LABELS[value]] as const,
);

function toDefaultValues(
  sip: InvestmentSipRow | null | undefined,
  defaultCurrencyCode: string,
): InvestmentSipInput {
  return {
    name: sip?.name ?? "",
    investmentAssetId: "",
    newAssetName: null,
    newAssetClass: null,
    investmentAccountId: "",
    newPlatformName: null,
    newPlatformInstitutionId: null,
    provider: sip?.provider ?? null,
    contributionAmount: sip
      ? (
          sip.contribution_amount_minor_units /
          10 ** minorUnitExponent(sip.currency_code)
        ).toString()
      : "",
    currencyCode: sip?.currency_code ?? defaultCurrencyCode,
    frequency: (sip?.frequency as SipFrequency) ?? "monthly",
    intervalCount: sip?.interval_count ?? 1,
    startDate: sip?.start_date ?? "",
    endDate: sip?.end_date ?? null,
    contributionAccountId: sip?.contribution_account_id ?? "",
    expectedDurationMonths: sip?.expected_duration_months ?? null,
    initialStatus: "planned",
    notes: sip?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a SIP (PROMPT 17). The investment asset and
 * platform fields each offer every existing row plus a "+ create new"
 * option — there is no dedicated management UI for investment_assets/
 * investment_accounts yet (PROMPT 16 was schema-only), so this dialog is
 * where a household's first ones typically get created, resolved
 * server-side in createSipAction/updateSipAction.
 */
export function SipDialog({
  householdId,
  open,
  onOpenChange,
  sip,
  assets,
  platforms,
  institutions,
  contributionAccounts,
  defaultCurrencyCode,
  onSaved,
}: SipDialogProps) {
  const isEditing = Boolean(sip);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InvestmentSipInput>({
    resolver: zodResolver(investmentSipInputSchema),
    defaultValues: toDefaultValues(sip, defaultCurrencyCode),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(sip, defaultCurrencyCode));
    }
  }, [open, sip, defaultCurrencyCode, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const investmentAssetId = watch("investmentAssetId");
  const investmentAccountId = watch("investmentAccountId");
  const frequency = watch("frequency");
  const isNewAsset = investmentAssetId === CREATE_NEW_OPTION_VALUE;
  const isNewPlatform = investmentAccountId === CREATE_NEW_OPTION_VALUE;

  function onSubmit(values: InvestmentSipInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && sip
          ? await updateSipAction(householdId, sip.id, values)
          : await createSipAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "SIP updated" : "SIP added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit SIP" : "Add SIP"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Changes apply going forward — every contribution already recorded keeps its own amount, regardless of what you change here."
              : "A recurring investment plan — contributions are generated against it, never a single mutable value."}
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
              placeholder="e.g. PhonePe Daily Gold"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investmentAssetId">Investment asset</Label>
            <NativeSelect
              id="investmentAssetId"
              aria-invalid={!!errors.investmentAssetId}
              {...register("investmentAssetId")}
            >
              <option value="">Select an asset</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} (
                  {INVESTMENT_ASSET_CLASS_LABELS[
                    asset.asset_class as InvestmentAssetClass
                  ] ?? asset.asset_class}
                  )
                </option>
              ))}
              <option value={CREATE_NEW_OPTION_VALUE}>
                + Create new asset
              </option>
            </NativeSelect>
            <FormErrorMessage message={errors.investmentAssetId?.message} />
          </div>
          {isNewAsset && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newAssetName">New asset name</Label>
                <Input
                  id="newAssetName"
                  placeholder="e.g. Digital Gold"
                  aria-invalid={!!errors.newAssetName}
                  {...register("newAssetName")}
                />
                <FormErrorMessage message={errors.newAssetName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newAssetClass">Asset class</Label>
                <NativeSelect id="newAssetClass" {...register("newAssetClass")}>
                  <option value="">Select a class</option>
                  {ASSET_CLASS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="investmentAccountId">Platform</Label>
            <NativeSelect
              id="investmentAccountId"
              aria-invalid={!!errors.investmentAccountId}
              {...register("investmentAccountId")}
            >
              <option value="">Select a platform</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
              <option value={CREATE_NEW_OPTION_VALUE}>
                + Create new platform
              </option>
            </NativeSelect>
            <FormErrorMessage message={errors.investmentAccountId?.message} />
          </div>
          {isNewPlatform && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="newPlatformName">New platform name</Label>
                <Input
                  id="newPlatformName"
                  placeholder="e.g. PhonePe"
                  aria-invalid={!!errors.newPlatformName}
                  {...register("newPlatformName")}
                />
                <FormErrorMessage message={errors.newPlatformName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPlatformInstitutionId">
                  Institution (optional)
                </Label>
                <NativeSelect
                  id="newPlatformInstitutionId"
                  {...register("newPlatformInstitutionId")}
                >
                  <option value="">None</option>
                  {institutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="provider">Provider (optional)</Label>
            <Input
              id="provider"
              placeholder="e.g. HDFC Mutual Fund"
              {...register("provider")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contributionAmount">Contribution amount</Label>
              <Input
                id="contributionAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.contributionAmount}
                {...register("contributionAmount")}
              />
              <FormErrorMessage message={errors.contributionAmount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currencyCode">Currency</Label>
              <Input
                id="currencyCode"
                placeholder="INR"
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
            <div className="space-y-1.5">
              <Label htmlFor="intervalCount">
                {frequency === "custom" ? "Every N days" : "Every N cycles"}
              </Label>
              <Input
                id="intervalCount"
                type="number"
                min={1}
                max={365}
                aria-invalid={!!errors.intervalCount}
                {...register("intervalCount", { valueAsNumber: true })}
              />
              <FormErrorMessage message={errors.intervalCount?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                disabled={isEditing}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contributionAccountId">
                Contribution account
              </Label>
              <NativeSelect
                id="contributionAccountId"
                aria-invalid={!!errors.contributionAccountId}
                {...register("contributionAccountId")}
              >
                <option value="">Select an account</option>
                {contributionAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage
                message={errors.contributionAccountId?.message}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedDurationMonths">
                Expected duration, months (optional)
              </Label>
              <Input
                id="expectedDurationMonths"
                type="number"
                min={1}
                max={1200}
                {...register("expectedDurationMonths", {
                  valueAsNumber: true,
                  setValueAs: (value) =>
                    value === "" || Number.isNaN(value) ? null : value,
                })}
              />
            </div>
          </div>

          {!isEditing && (
            <div className="space-y-1.5">
              <Label htmlFor="initialStatus">Starting status</Label>
              <NativeSelect id="initialStatus" {...register("initialStatus")}>
                {INITIAL_STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                &ldquo;Planned&rdquo; if this hasn&apos;t started yet;
                &ldquo;Active&rdquo; if contributions begin right away.
              </p>
            </div>
          )}

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
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add SIP"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
