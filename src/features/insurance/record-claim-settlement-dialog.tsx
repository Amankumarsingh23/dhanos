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
import { recordClaimSettlementAction } from "./claims-actions";
import type { InsuranceClaimRow } from "./claims-queries";

type AccountOption = { id: string; label: string };

type RecordClaimSettlementDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: InsuranceClaimRow;
  accounts: AccountOption[];
  onSaved?: () => void;
};

/**
 * Records what the insurer actually paid out — always via
 * record_insurance_claim_settlement (PROMPT 26), so the resulting
 * transaction is a real, once-only kind = insurance_claim_settlement row,
 * never plain income. Prefills from approved_amount_minor_units when set
 * (the insurer's decision), falling back to claimed_amount_minor_units.
 */
export function RecordClaimSettlementDialog({
  householdId,
  open,
  onOpenChange,
  claim,
  accounts,
  onSaved,
}: RecordClaimSettlementDialogProps) {
  const defaultAmountMinorUnits =
    claim.approved_amount_minor_units ?? claim.claimed_amount_minor_units;

  const [settledDate, setSettledDate] = useState(() =>
    toIsoDateString(new Date()),
  );
  const [settledAmount, setSettledAmount] = useState(() =>
    String(defaultAmountMinorUnits / 100),
  );
  const [settledAccountId, setSettledAccountId] = useState(
    accounts[0]?.id ?? "",
  );
  const [description, setDescription] = useState("");
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
      const result = await recordClaimSettlementAction(householdId, {
        claimId: claim.id,
        policyId: claim.policy_id,
        settledAccountId,
        settledAmount,
        settledDate,
        description: description.trim() || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success("Claim settlement recorded");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record claim settlement</DialogTitle>
          <DialogDescription>
            Writes a dedicated settlement transaction — never counted as income
            in cash-flow reporting.{" "}
            {claim.approved_amount_minor_units !== null && (
              <>
                Insurer approved{" "}
                {formatMoney({
                  amountMinorUnits: claim.approved_amount_minor_units,
                  currencyCode: claim.currency_code,
                })}
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
              <Label htmlFor="settled-date">Settlement date</Label>
              <Input
                id="settled-date"
                type="date"
                value={settledDate}
                onChange={(event) => setSettledDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settled-amount">Amount received</Label>
              <Input
                id="settled-amount"
                inputMode="decimal"
                value={settledAmount}
                onChange={(event) => setSettledAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settled-account">Deposited to account</Label>
            <NativeSelect
              id="settled-account"
              value={settledAccountId}
              onChange={(event) => setSettledAccountId(event.target.value)}
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
            <Label htmlFor="settled-description">Notes (optional)</Label>
            <Input
              id="settled-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
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
              {isPending ? "Recording…" : "Record settlement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
