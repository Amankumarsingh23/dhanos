"use client";

import { useState, useTransition } from "react";
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
import { NativeSelect } from "@/components/forms/native-select";
import { formatMoney } from "@/lib/money";
import { toIsoDateString } from "@/lib/dates";
import {
  VALUATION_CONFIDENCE_LABELS,
  VALUATION_SOURCE_LABELS,
  type ValuationConfidence,
  type ValuationSource,
} from "@/lib/validation/assets";
import { recordAssetValuationAction } from "./actions";
import type { AssetRow } from "./queries";

type RecordValuationDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetRow;
  onSaved?: () => void;
};

const VALUATION_SOURCE_OPTIONS = Object.entries(VALUATION_SOURCE_LABELS) as [
  ValuationSource,
  string,
][];
const VALUATION_CONFIDENCE_OPTIONS = Object.entries(
  VALUATION_CONFIDENCE_LABELS,
) as [ValuationConfidence, string][];

/**
 * Records a new asset_valuation_snapshots row — never edits the asset row
 * or any prior snapshot (PROMPT 27: "asset values use snapshots").
 */
export function RecordValuationDialog({
  householdId,
  open,
  onOpenChange,
  asset,
  onSaved,
}: RecordValuationDialogProps) {
  const [asOfDate, setAsOfDate] = useState(() => toIsoDateString(new Date()));
  const [value, setValue] = useState(() =>
    asset.latestValueMinorUnits !== null
      ? String(asset.latestValueMinorUnits / 100)
      : "",
  );
  const [source, setSource] = useState<ValuationSource>("manual");
  const [confidence, setConfidence] =
    useState<ValuationConfidence>("unverified");
  const [appraiser, setAppraiser] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await recordAssetValuationAction(householdId, {
        assetId: asset.id,
        value,
        asOfDate,
        source,
        confidence,
        appraiser: appraiser.trim() || null,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Valuation recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record valuation</DialogTitle>
          <DialogDescription>
            Adds a new dated value — the previous value stays in the history
            unchanged.{" "}
            {asset.latestValueMinorUnits !== null && (
              <>
                Current:{" "}
                {formatMoney({
                  amountMinorUnits: asset.latestValueMinorUnits,
                  currencyCode: asset.currency_code,
                })}
                {asset.latestValuationDate &&
                  ` as of ${asset.latestValuationDate}`}
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valuation-as-of-date">As of date</Label>
              <Input
                id="valuation-as-of-date"
                type="date"
                value={asOfDate}
                onChange={(event) => setAsOfDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valuation-value">Value</Label>
              <Input
                id="valuation-value"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valuation-source">Source</Label>
              <NativeSelect
                id="valuation-source"
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as ValuationSource)
                }
              >
                {VALUATION_SOURCE_OPTIONS.map(([optionValue, label]) => (
                  <option key={optionValue} value={optionValue}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valuation-confidence">Confidence</Label>
              <NativeSelect
                id="valuation-confidence"
                value={confidence}
                onChange={(event) =>
                  setConfidence(event.target.value as ValuationConfidence)
                }
              >
                {VALUATION_CONFIDENCE_OPTIONS.map(([optionValue, label]) => (
                  <option key={optionValue} value={optionValue}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {confidence !== "verified" && (
            <p className="text-muted-foreground text-xs">
              Anything short of &ldquo;Verified&rdquo; is labeled an estimate
              everywhere this value is shown.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="valuation-appraiser">Appraiser (optional)</Label>
            <Input
              id="valuation-appraiser"
              placeholder="Named appraiser or agency"
              value={appraiser}
              onChange={(event) => setAppraiser(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valuation-notes">Notes (optional)</Label>
            <Input
              id="valuation-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
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
              {isPending ? "Recording…" : "Record valuation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
