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
  ACCOUNT_TYPE_LABELS,
  accountInputSchema,
  type AccountInput,
} from "@/lib/validation/accounts";
import { createAccountAction, updateAccountAction } from "./actions";
import type { AccountRow } from "./queries";

export type SelectOption = { id: string; label: string };

type AccountDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  account?: AccountRow | null;
  institutions: SelectOption[];
  people: SelectOption[];
  onSaved?: () => void;
};

const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS) as [
  keyof typeof ACCOUNT_TYPE_LABELS,
  string,
][];

function toDefaultValues(account?: AccountRow | null): AccountInput {
  return {
    name: account?.name ?? "",
    accountType:
      (account?.account_type as AccountInput["accountType"]) ?? "savings",
    institutionId: account?.institution_id ?? null,
    ownerPersonId: account?.owner_person_id ?? null,
    maskedIdentifier: account?.masked_identifier ?? null,
    currencyCode: account?.currency_code ?? "INR",
    openingBalance: account
      ? (
          account.opening_balance_minor_units /
          10 ** minorUnitExponent(account.currency_code)
        ).toString()
      : "0",
    openedDate: account?.opened_date ?? null,
    closedDate: account?.closed_date ?? null,
    isActive: account?.is_active ?? true,
    includeInNetWorth: account?.include_in_net_worth ?? true,
    notes: account?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a financial account. Lifecycle (closing/reopening)
 * is deliberately handled by its own confirmation flow in
 * accounts-manager.tsx, not this form — see closeAccountAction/
 * reopenAccountAction in ./actions.ts, mirroring how archiving is kept
 * separate from the edit form in the Institutions module.
 */
export function AccountDialog({
  householdId,
  open,
  onOpenChange,
  account,
  institutions,
  people,
  onSaved,
}: AccountDialogProps) {
  const isEditing = Boolean(account);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountInput>({
    resolver: zodResolver(accountInputSchema),
    defaultValues: toDefaultValues(account),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(account));
    }
  }, [open, account, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(values: AccountInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateAccountAction(householdId, account!.id, values)
        : await createAccountAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Account updated" : "Account added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit account" : "Add account"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update this account\'s details. Its balance is always calculated, never edited directly here — use "Correct balance" on the account page.'
              : "A bank account, wallet, deposit, or other holding. Opening balance is the starting point for its calculated balance, not the current one."}
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
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            <FormErrorMessage id="name-error" message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="accountType">Type</Label>
              <NativeSelect
                id="accountType"
                aria-invalid={!!errors.accountType}
                {...register("accountType")}
              >
                {ACCOUNT_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.accountType?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currencyCode">Currency</Label>
              <Input
                id="currencyCode"
                placeholder="INR"
                maxLength={3}
                aria-invalid={!!errors.currencyCode}
                {...register("currencyCode")}
              />
              <FormErrorMessage message={errors.currencyCode?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="institutionId">Institution (optional)</Label>
              <NativeSelect
                id="institutionId"
                aria-invalid={!!errors.institutionId}
                {...register("institutionId")}
              >
                <option value="">None (e.g. cash)</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.institutionId?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownerPersonId">Owner (optional)</Label>
              <NativeSelect
                id="ownerPersonId"
                aria-invalid={!!errors.ownerPersonId}
                {...register("ownerPersonId")}
              >
                <option value="">Unassigned</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.ownerPersonId?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="maskedIdentifier">
                Masked identifier (optional)
              </Label>
              <Input
                id="maskedIdentifier"
                placeholder="•••• 4821"
                aria-invalid={!!errors.maskedIdentifier}
                {...register("maskedIdentifier")}
              />
              <FormErrorMessage message={errors.maskedIdentifier?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="openedDate">Opened date (optional)</Label>
              <Input
                id="openedDate"
                type="date"
                aria-invalid={!!errors.openedDate}
                {...register("openedDate")}
              />
              <FormErrorMessage message={errors.openedDate?.message} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="openingBalance">
              Opening balance{account ? "" : " (0 if none)"}
            </Label>
            <Input
              id="openingBalance"
              inputMode="decimal"
              placeholder="0.00"
              aria-invalid={!!errors.openingBalance}
              aria-describedby="openingBalance-help"
              {...register("openingBalance")}
            />
            <p
              id="openingBalance-help"
              className="text-muted-foreground text-xs"
            >
              The balance as of the opened date — not the account&rsquo;s
              current balance, which is always calculated.
            </p>
            <FormErrorMessage message={errors.openingBalance?.message} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="border-input size-4 rounded"
              {...register("includeInNetWorth")}
            />
            Include in net worth
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
            <FormErrorMessage message={errors.notes?.message} />
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
                  : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
