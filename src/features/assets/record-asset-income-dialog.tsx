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
import { toIsoDateString } from "@/lib/dates";
import { recordAssetIncomeAction } from "./actions";
import type { SelectOption } from "./asset-dialog";

type RecordAssetIncomeDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  accounts: SelectOption[];
  onSaved?: () => void;
};

/**
 * Records asset-generated income (rent, etc.) as a real transaction —
 * PROMPT 28: "income generated links to cash flow." Writes a real
 * `kind = 'income'` row tagged with this asset, so it shows up in Cash
 * Flow/Income reporting like any other income, never just a note.
 */
export function RecordAssetIncomeDialog({
  householdId,
  open,
  onOpenChange,
  assetId,
  accounts,
  onSaved,
}: RecordAssetIncomeDialogProps) {
  const [incomeDate, setIncomeDate] = useState(() =>
    toIsoDateString(new Date()),
  );
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
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
      const result = await recordAssetIncomeAction(householdId, {
        assetId,
        accountId,
        amount,
        incomeDate,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Income recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record income</DialogTitle>
          <DialogDescription>
            Writes a real income transaction tagged to this asset — it will
            appear in Cash Flow and Income reporting like any other income.
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
              <Label htmlFor="asset-income-date">Date</Label>
              <Input
                id="asset-income-date"
                type="date"
                value={incomeDate}
                onChange={(event) => setIncomeDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-income-amount">Amount</Label>
              <Input
                id="asset-income-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-income-account">Deposited to account</Label>
            <NativeSelect
              id="asset-income-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asset-income-notes">Notes (optional)</Label>
            <Input
              id="asset-income-notes"
              placeholder="e.g. July rent"
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
              {isPending ? "Recording…" : "Record income"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
