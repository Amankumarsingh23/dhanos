"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { minorUnitExponent } from "@/lib/money/currency";
import { toIsoDateString } from "@/lib/dates";
import {
  STAKING_SNAPSHOT_SOURCE_LABELS,
  recordStakingSnapshotSchema,
  type RecordStakingSnapshotInput,
  type StakingSnapshotSource,
} from "@/lib/validation/staking";
import { recordDailySnapshotAction } from "./actions";
import type { StakingPositionRow, StakingSnapshotRecord } from "./queries";

type DailySnapshotDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: StakingPositionRow | null;
  /** All current-revision snapshots for this position, oldest first — used to prefill opening value and detect an existing entry for the chosen date. */
  existingSnapshots: StakingSnapshotRecord[];
  onSaved?: () => void;
};

const SOURCE_OPTIONS = Object.entries(STAKING_SNAPSHOT_SOURCE_LABELS) as [
  StakingSnapshotSource,
  string,
][];

function toMajorUnits(amountMinorUnits: number, currencyCode: string): string {
  return (amountMinorUnits / 10 ** minorUnitExponent(currencyCode)).toString();
}

/**
 * Records one day's snapshot — or, if a snapshot already exists for the
 * chosen date, a versioned adjustment (PROMPT 19). The reward is derived
 * server-side from the closing-value equation, so this form only ever
 * asks for the four numbers a household would naturally know: opening
 * (prefilled from the prior day), contribution, withdrawal, fee, and the
 * closing value they actually see on the platform.
 */
export function DailySnapshotDialog({
  householdId,
  open,
  onOpenChange,
  position,
  existingSnapshots,
  onSaved,
}: DailySnapshotDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = toIsoDateString(new Date());

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecordStakingSnapshotInput>({
    resolver: zodResolver(recordStakingSnapshotSchema),
    defaultValues: {
      stakingPositionId: position?.id ?? "",
      snapshotDate: today,
      openingValue: "",
      contribution: "0",
      withdrawal: "0",
      fee: "0",
      closingValue: "",
      manuallyConfirmed: true,
      source: "manual",
      notes: null,
      adjustmentReason: null,
    },
  });

  const snapshotDate = watch("snapshotDate");

  const existingForDate = useMemo(
    () =>
      existingSnapshots.find((s) => s.snapshot_date === snapshotDate) ?? null,
    [existingSnapshots, snapshotDate],
  );

  const priorSnapshot = useMemo(() => {
    const before = existingSnapshots.filter(
      (s) => s.snapshot_date < snapshotDate,
    );
    return before[before.length - 1] ?? null;
  }, [existingSnapshots, snapshotDate]);

  useEffect(() => {
    if (open && position) {
      reset({
        stakingPositionId: position.id,
        snapshotDate: today,
        openingValue: position.latestSnapshot
          ? toMajorUnits(
              position.latestSnapshot.closing_value_minor_units,
              position.currency_code,
            )
          : toMajorUnits(
              position.opening_principal_minor_units,
              position.currency_code,
            ),
        contribution: "0",
        withdrawal: "0",
        fee: "0",
        closingValue: "",
        manuallyConfirmed: true,
        source: "manual",
        notes: null,
        adjustmentReason: null,
      });
    }
  }, [open, position, today, reset]);

  // Re-prefill the opening value whenever the chosen date changes, from
  // whatever the prior day's closing value is (or the position's own
  // opening principal if this is the very first entry).
  useEffect(() => {
    if (!position) return;
    const opening = priorSnapshot
      ? priorSnapshot.closing_value_minor_units
      : position.opening_principal_minor_units;
    setValue("openingValue", toMajorUnits(opening, position.currency_code));
  }, [priorSnapshot, position, setValue]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: RecordStakingSnapshotInput) {
    setFormError(null);
    if (existingForDate && !values.adjustmentReason?.trim()) {
      setFormError(
        "A snapshot already exists for this date — explain the adjustment before saving.",
      );
      return;
    }
    startTransition(async () => {
      const result = await recordDailySnapshotAction(householdId, values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success(
        existingForDate ? "Adjustment recorded" : "Snapshot recorded",
      );
      handleOpenChange(false);
      onSaved?.();
    });
  }

  if (!position) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record daily snapshot for {position.name}</DialogTitle>
          <DialogDescription>
            Reward is calculated automatically from the closing value you enter
            — never overwrites a prior day&apos;s snapshot.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" {...register("stakingPositionId")} />
          <div className="space-y-1.5">
            <Label htmlFor="snapshotDate">Date</Label>
            <Input
              id="snapshotDate"
              type="date"
              max={today}
              aria-invalid={!!errors.snapshotDate}
              {...register("snapshotDate")}
            />
            <FormErrorMessage message={errors.snapshotDate?.message} />
            {existingForDate && (
              <p className="text-muted-foreground text-xs">
                A snapshot already exists for this date (closing{" "}
                {formatMoney({
                  amountMinorUnits: existingForDate.closing_value_minor_units,
                  currencyCode: position.currency_code,
                })}
                ) — saving here records an explained adjustment, not an
                overwrite.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="openingValue">Opening value</Label>
              <Input
                id="openingValue"
                inputMode="decimal"
                aria-invalid={!!errors.openingValue}
                {...register("openingValue")}
              />
              <FormErrorMessage message={errors.openingValue?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closingValue">Closing value</Label>
              <Input
                id="closingValue"
                inputMode="decimal"
                placeholder="What you see on the platform today"
                aria-invalid={!!errors.closingValue}
                {...register("closingValue")}
              />
              <FormErrorMessage message={errors.closingValue?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="contribution">Contribution</Label>
              <Input
                id="contribution"
                inputMode="decimal"
                {...register("contribution")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="withdrawal">Withdrawal</Label>
              <Input
                id="withdrawal"
                inputMode="decimal"
                {...register("withdrawal")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fee">Fee</Label>
              <Input id="fee" inputMode="decimal" {...register("fee")} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <NativeSelect id="source" {...register("source")}>
                {SOURCE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="manuallyConfirmed"
                type="checkbox"
                className="size-4"
                {...register("manuallyConfirmed")}
              />
              <Label htmlFor="manuallyConfirmed" className="font-normal">
                Manually confirmed
              </Label>
            </div>
          </div>

          {existingForDate && (
            <div className="space-y-1.5">
              <Label htmlFor="adjustmentReason">Adjustment reason</Label>
              <Input
                id="adjustmentReason"
                placeholder="e.g. Platform corrected the reward rate retroactively"
                aria-invalid={!!errors.adjustmentReason}
                {...register("adjustmentReason")}
              />
              <FormErrorMessage message={errors.adjustmentReason?.message} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="snapshotNotes">Notes (optional)</Label>
            <Input id="snapshotNotes" {...register("notes")} />
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
                : existingForDate
                  ? "Save adjustment"
                  : "Record snapshot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
