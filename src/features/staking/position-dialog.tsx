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
  stakingPositionInputSchema,
  type StakingPositionInput,
} from "@/lib/validation/staking";
import {
  INVESTMENT_ASSET_CLASS_LABELS,
  type InvestmentAssetClass,
} from "@/lib/validation/investments";
import {
  createStakingPositionAction,
  updateStakingPositionAction,
} from "./actions";
import type {
  InvestmentAccountRecord,
  InvestmentAssetRecord,
} from "@/features/investment-sips/queries";
import type { StakingPositionRow } from "./queries";

export type InstitutionOption = { id: string; name: string };

type PositionDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  position?: StakingPositionRow | null;
  assets: InvestmentAssetRecord[];
  platforms: InvestmentAccountRecord[];
  institutions: InstitutionOption[];
  defaultCurrencyCode: string;
  onSaved?: () => void;
};

const ASSET_CLASS_OPTIONS = Object.entries(INVESTMENT_ASSET_CLASS_LABELS) as [
  InvestmentAssetClass,
  string,
][];

function toDefaultValues(
  position: StakingPositionRow | null | undefined,
  defaultCurrencyCode: string,
): StakingPositionInput {
  return {
    name: position?.name ?? "",
    investmentAssetId: "",
    newAssetName: null,
    newAssetClass: "staking",
    investmentAccountId: "",
    newPlatformName: null,
    newPlatformInstitutionId: null,
    openingPrincipal: position
      ? (
          position.opening_principal_minor_units /
          10 ** minorUnitExponent(position.currency_code)
        ).toString()
      : "",
    openingDate: position?.opening_date ?? "",
    currencyCode: position?.currency_code ?? defaultCurrencyCode,
    expectedDailyRatePercent:
      position?.expected_daily_rate != null
        ? (position.expected_daily_rate * 100).toString()
        : null,
    lockInEndDate: position?.lock_in_end_date ?? null,
    feeNotes: position?.fee_notes ?? null,
    riskNotes: position?.risk_notes ?? null,
    notes: position?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a staking/daily-growth position (PROMPT 19). The
 * asset/platform fields reuse the same "existing or + create new" pattern
 * as the SIP dialog (src/features/investment-sips/sip-dialog.tsx) — there
 * is still no dedicated management UI for investment_assets/
 * investment_accounts themselves.
 */
export function PositionDialog({
  householdId,
  open,
  onOpenChange,
  position,
  assets,
  platforms,
  institutions,
  defaultCurrencyCode,
  onSaved,
}: PositionDialogProps) {
  const isEditing = Boolean(position);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<StakingPositionInput>({
    resolver: zodResolver(stakingPositionInputSchema),
    defaultValues: toDefaultValues(position, defaultCurrencyCode),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(position, defaultCurrencyCode));
    }
  }, [open, position, defaultCurrencyCode, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const investmentAssetId = watch("investmentAssetId");
  const investmentAccountId = watch("investmentAccountId");
  const isNewAsset = investmentAssetId === CREATE_NEW_OPTION_VALUE;
  const isNewPlatform = investmentAccountId === CREATE_NEW_OPTION_VALUE;

  function onSubmit(values: StakingPositionInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && position
          ? await updateStakingPositionAction(householdId, position.id, values)
          : await createStakingPositionAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Position updated" : "Position added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit staking position" : "Add staking position"}
          </DialogTitle>
          <DialogDescription>
            A daily-tracked position — record a snapshot each day to build its
            actual value history.
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
              placeholder="e.g. ETH staking on Binance"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investmentAssetId">Asset</Label>
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
                  placeholder="e.g. Ethereum"
                  aria-invalid={!!errors.newAssetName}
                  {...register("newAssetName")}
                />
                <FormErrorMessage message={errors.newAssetName?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newAssetClass">Asset class</Label>
                <NativeSelect id="newAssetClass" {...register("newAssetClass")}>
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
                  placeholder="e.g. Binance"
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="openingPrincipal">Opening principal</Label>
              <Input
                id="openingPrincipal"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.openingPrincipal}
                {...register("openingPrincipal")}
              />
              <FormErrorMessage message={errors.openingPrincipal?.message} />
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
              <Label htmlFor="openingDate">Opening date</Label>
              <Input
                id="openingDate"
                type="date"
                disabled={isEditing}
                aria-invalid={!!errors.openingDate}
                {...register("openingDate")}
              />
              <FormErrorMessage message={errors.openingDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lockInEndDate">Lock-in end date (optional)</Label>
              <Input
                id="lockInEndDate"
                type="date"
                aria-invalid={!!errors.lockInEndDate}
                {...register("lockInEndDate")}
              />
              <FormErrorMessage message={errors.lockInEndDate?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expectedDailyRatePercent">
              Expected daily rate, % (optional)
            </Label>
            <Input
              id="expectedDailyRatePercent"
              inputMode="decimal"
              placeholder="e.g. 0.05 for 0.05%/day"
              {...register("expectedDailyRatePercent")}
            />
            <p className="text-muted-foreground text-xs">
              An assumption for the projection chart only — never shown as
              guaranteed, and never used to compute your actual balance.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="feeNotes">Fee structure (optional)</Label>
            <Input
              id="feeNotes"
              placeholder="e.g. 2% platform fee on rewards"
              {...register("feeNotes")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="riskNotes">Risk notes (optional)</Label>
            <Input id="riskNotes" {...register("riskNotes")} />
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
                  : "Add position"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
