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
import { recordPremiumPaymentAction } from "./actions";
import type { InsurancePolicyRow } from "./queries";

type CategoryOption = {
  id: string;
  label: string;
  classification: string | null;
};

type RecordPremiumPaymentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policy: InsurancePolicyRow;
  categories: CategoryOption[];
  onSaved?: () => void;
};

/**
 * Records a premium payment — a plain `kind = 'expense'` transaction
 * (PROMPT 25: "premium payment creates a cash transaction"), categorized
 * under the household's protection-classification category by default so
 * it shows up in Expenses/the dashboard's "insurance premiums" figure like
 * any other real spending, distinguishable by category rather than a
 * separate transaction kind.
 */
export function RecordPremiumPaymentDialog({
  householdId,
  open,
  onOpenChange,
  policy,
  categories,
  onSaved,
}: RecordPremiumPaymentDialogProps) {
  const defaultCategoryId =
    categories.find((c) => c.classification === "protection")?.id ??
    categories[0]?.id ??
    "";

  const [paymentDate, setPaymentDate] = useState(() =>
    toIsoDateString(new Date()),
  );
  const [amount, setAmount] = useState(() =>
    String(policy.premium_amount_minor_units / 100),
  );
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
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
      const result = await recordPremiumPaymentAction(householdId, {
        policyId: policy.id,
        categoryId,
        paymentDate,
        amount,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Premium payment recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record premium payment</DialogTitle>
          <DialogDescription>
            Writes an expense transaction against {policy.paymentAccountName} —
            usual premium is{" "}
            {formatMoney({
              amountMinorUnits: policy.premium_amount_minor_units,
              currencyCode: policy.currency_code,
            })}
            .
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
              <Label htmlFor="premium-payment-date">Payment date</Label>
              <Input
                id="premium-payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="premium-payment-amount">Amount</Label>
              <Input
                id="premium-payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="premium-payment-category">Category</Label>
            <NativeSelect
              id="premium-payment-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="premium-payment-notes">Notes (optional)</Label>
            <Input
              id="premium-payment-notes"
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
              {isPending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
