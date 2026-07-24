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
  DRAIN_COST_FREQUENCY_LABELS,
  DRAIN_TYPE_LABELS,
  DRAIN_USAGE_FREQUENCY_LABELS,
  moneyDrainFieldsSchema,
  type DrainCostFrequency,
  type DrainType,
  type DrainUsageFrequency,
  type MoneyDrainFieldsInput,
} from "@/lib/validation/money-drains";
import { createMoneyDrainAction, updateMoneyDrainAction } from "./actions";
import type { MoneyDrainRow } from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type AssetOption = { id: string; name: string };
export type RecurringRuleOption = {
  id: string;
  name: string;
  currencyCode: string;
};

type MoneyDrainDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  drain?: MoneyDrainRow | null;
  accounts: AccountOption[];
  assets: AssetOption[];
  recurringRules: RecurringRuleOption[];
  onSaved?: () => void;
};

const DRAIN_TYPE_OPTIONS = Object.entries(DRAIN_TYPE_LABELS) as [
  DrainType,
  string,
][];
const COST_FREQUENCY_OPTIONS = Object.entries(DRAIN_COST_FREQUENCY_LABELS) as [
  DrainCostFrequency,
  string,
][];
const USAGE_FREQUENCY_OPTIONS = Object.entries(
  DRAIN_USAGE_FREQUENCY_LABELS,
) as [DrainUsageFrequency, string][];

function toDecimalString(
  amountMinorUnits: number | null,
  currencyCode: string,
): string {
  if (amountMinorUnits === null) {
    return "";
  }
  return (amountMinorUnits / 10 ** minorUnitExponent(currencyCode)).toString();
}

function toDefaultValues(drain?: MoneyDrainRow | null): MoneyDrainFieldsInput {
  return {
    item: drain?.item ?? "",
    drainType: (drain?.drain_type as DrainType) ?? "subscription",
    costFrequency: (drain?.cost_frequency as DrainCostFrequency) ?? "monthly",
    costAmount: drain
      ? toDecimalString(drain.cost_amount_minor_units, drain.currency_code)
      : "",
    currencyCode: drain?.currency_code ?? "INR",
    currentValue: drain
      ? toDecimalString(drain.current_value_minor_units, drain.currency_code)
      : null,
    usageFrequency:
      (drain?.usage_frequency as DrainUsageFrequency) ?? "monthly",
    isEssential: drain?.is_essential ?? false,
    cancellationTerms: drain?.cancellation_terms ?? null,
    nextRenewalDate: drain?.next_renewal_date ?? null,
    linkedAccountId: drain?.linked_account_id ?? null,
    linkedAssetId: drain?.linked_asset_id ?? null,
    linkedRecurringRuleId: drain?.linked_recurring_rule_id ?? null,
    notes: drain?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a money drain (PROMPT 29): item, type, cost +
 * cadence, current value, usage frequency, essential classification,
 * cancellation terms, next renewal, and optional links to an account,
 * asset, or recurring rule. Usage frequency is always presented as the
 * household's own estimate — never inferred — see the caption under that
 * field ("estimated usage is visibly user-entered," PROMPT 29 acceptance
 * criterion).
 */
export function MoneyDrainDialog({
  householdId,
  open,
  onOpenChange,
  drain,
  accounts,
  assets,
  recurringRules,
  onSaved,
}: MoneyDrainDialogProps) {
  const isEditing = Boolean(drain);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MoneyDrainFieldsInput>({
    resolver: zodResolver(moneyDrainFieldsSchema),
    defaultValues: toDefaultValues(drain),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(drain));
    }
  }, [open, drain, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: MoneyDrainFieldsInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateMoneyDrainAction(householdId, drain!.id, values)
        : await createMoneyDrainAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Money drain updated" : "Money drain added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit money drain" : "Add money drain"}
          </DialogTitle>
          <DialogDescription>
            Track a subscription, membership, vehicle, rented space, gadget, or
            other recurring cost — this never writes a transaction on its own.
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
            <Label htmlFor="item">Item</Label>
            <Input
              id="item"
              placeholder="e.g. Netflix, Gym membership, Car"
              aria-invalid={!!errors.item}
              {...register("item")}
            />
            <FormErrorMessage message={errors.item?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="drainType">Type</Label>
              <NativeSelect id="drainType" {...register("drainType")}>
                {DRAIN_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.drainType?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currencyCode">Currency</Label>
              <Input
                id="currencyCode"
                maxLength={3}
                className="uppercase"
                aria-invalid={!!errors.currencyCode}
                {...register("currencyCode")}
              />
              <FormErrorMessage message={errors.currencyCode?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="costFrequency">Cost frequency</Label>
              <NativeSelect id="costFrequency" {...register("costFrequency")}>
                {COST_FREQUENCY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.costFrequency?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="costAmount">Cost per occurrence</Label>
              <Input
                id="costAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.costAmount}
                {...register("costAmount")}
              />
              <FormErrorMessage message={errors.costAmount?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="currentValue">
              Current value (optional — for a depreciating item)
            </Label>
            <Input
              id="currentValue"
              inputMode="decimal"
              placeholder="0.00"
              {...register("currentValue")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="usageFrequency">How often do you use it?</Label>
            <NativeSelect id="usageFrequency" {...register("usageFrequency")}>
              {USAGE_FREQUENCY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              Your own estimate — DhanOS never measures actual usage.
            </p>
            <FormErrorMessage message={errors.usageFrequency?.message} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="border-input size-4 rounded"
              {...register("isEssential")}
            />
            Essential (not discretionary)
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nextRenewalDate">Next renewal (optional)</Label>
              <Input
                id="nextRenewalDate"
                type="date"
                {...register("nextRenewalDate")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedAccountId">Paid from (optional)</Label>
              <NativeSelect
                id="linkedAccountId"
                {...register("linkedAccountId")}
              >
                <option value="">Not linked</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="linkedAssetId">Linked asset (optional)</Label>
              <NativeSelect id="linkedAssetId" {...register("linkedAssetId")}>
                <option value="">Not linked</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedRecurringRuleId">
                Linked recurring rule (optional)
              </Label>
              <NativeSelect
                id="linkedRecurringRuleId"
                {...register("linkedRecurringRuleId")}
              >
                <option value="">Not linked</option>
                {recurringRules.map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-muted-foreground text-xs">
                Linking keeps this item connected to its real transactions.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cancellationTerms">
              Cancellation terms (optional)
            </Label>
            <Input
              id="cancellationTerms"
              placeholder="e.g. 30-day notice, no refund"
              {...register("cancellationTerms")}
            />
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
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add drain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
