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
import {
  AUTO_CREATE_MODE_LABELS,
  RECURRING_FREQUENCY_LABELS,
  RECURRING_RULE_KIND_LABELS,
  recurringRuleInputSchema,
  type RecurringFrequency,
  type RecurringRuleInput,
} from "@/lib/validation/recurring-rules";
import {
  createRecurringRuleAction,
  updateRecurringRuleAction,
} from "./actions";
import type { RecurringRuleRow } from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type CategoryOption = { id: string; name: string; categoryKind: string };
export type PersonOption = { id: string; name: string };

type RecurringRuleDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. */
  rule?: RecurringRuleRow | null;
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  onSaved?: () => void;
};

const KIND_OPTIONS = Object.entries(RECURRING_RULE_KIND_LABELS) as [
  keyof typeof RECURRING_RULE_KIND_LABELS,
  string,
][];
const FREQUENCY_OPTIONS = Object.entries(RECURRING_FREQUENCY_LABELS) as [
  RecurringFrequency,
  string,
][];
const AUTO_CREATE_OPTIONS = Object.entries(AUTO_CREATE_MODE_LABELS) as [
  keyof typeof AUTO_CREATE_MODE_LABELS,
  string,
][];

/** category_kind a given rule kind's category picker should show — a soft UI filter, mirrors KIND_TO_CATEGORY_KIND in transaction-dialog.tsx. */
const KIND_TO_CATEGORY_KIND: Record<string, string> = {
  income: "income",
  expense: "expense",
  transfer: "transfer",
  investment_contribution: "investment",
  investment_withdrawal: "investment",
  loan_disbursement: "debt",
  loan_payment: "debt",
  lending_disbursement: "debt",
  lending_repayment: "debt",
};

function toDefaultValues(rule?: RecurringRuleRow | null): RecurringRuleInput {
  return {
    name: rule?.name ?? "",
    kind: (rule?.kind as RecurringRuleInput["kind"]) ?? "expense",
    amount: rule
      ? (
          rule.amount_minor_units /
          10 ** minorUnitExponent(rule.currency_code)
        ).toString()
      : "",
    currencyCode: rule?.currency_code ?? "INR",
    accountId: rule?.account_id ?? "",
    transferAccountId: rule?.transfer_account_id ?? null,
    categoryId: rule?.category_id ?? null,
    counterparty: rule?.counterparty ?? null,
    relatedPersonId: rule?.related_person_id ?? null,
    frequency: (rule?.frequency as RecurringFrequency) ?? "monthly",
    intervalCount: rule?.interval_count ?? 1,
    startDate: rule?.start_date ?? "",
    endDate: rule?.end_date ?? null,
    autoCreateMode:
      (rule?.auto_create_mode as RecurringRuleInput["autoCreateMode"]) ??
      "reminder_only",
    reminderLeadDays: rule?.reminder_lead_days ?? 3,
    notes: rule?.notes ?? null,
  };
}

/**
 * Create/edit dialog for a recurring rule's template — name, kind,
 * account/category/counterparty/person, frequency, start/end date,
 * auto-create and reminder behavior. Amount is only set here at
 * creation; editing an existing rule's amount goes through the dedicated
 * "Change amount" flow (see amount-change-dialog.tsx) so a future change
 * is always an explicit, dated schedule entry, never a silent overwrite
 * of the template. See PROMPT 14.
 */
export function RecurringRuleDialog({
  householdId,
  open,
  onOpenChange,
  rule,
  accounts,
  categories,
  people,
  onSaved,
}: RecurringRuleDialogProps) {
  const isEditing = Boolean(rule);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecurringRuleInput>({
    resolver: zodResolver(recurringRuleInputSchema),
    defaultValues: toDefaultValues(rule),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaultValues(rule));
    }
  }, [open, rule, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const kind = watch("kind");
  const frequency = watch("frequency");
  const accountId = watch("accountId");
  const isTransfer = kind === "transfer";

  const relevantCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.categoryKind === KIND_TO_CATEGORY_KIND[kind],
      ),
    [categories, kind],
  );

  function onSubmit(values: RecurringRuleInput) {
    setFormError(null);
    const payload: RecurringRuleInput = {
      ...values,
      transferAccountId: isTransfer ? values.transferAccountId : null,
    };
    startTransition(async () => {
      const result = isEditing
        ? await updateRecurringRuleAction(householdId, rule!.id, payload)
        : await createRecurringRuleAction(householdId, payload);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(
        isEditing ? "Recurring rule updated" : "Recurring rule added",
      );
      handleOpenChange(false);
      onSaved?.();
    });
  }

  function handleAccountChange(nextAccountId: string) {
    setValue("accountId", nextAccountId);
    const account = accounts.find((a) => a.id === nextAccountId);
    if (account) {
      setValue("currencyCode", account.currencyCode);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit recurring rule" : "Add recurring rule"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Template changes apply to future occurrences only. Use “Change amount” to schedule a new amount from a future date."
              : "A template later occurrences are generated or reminded from."}
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
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="kind">Kind</Label>
              <NativeSelect id="kind" {...register("kind")}>
                {KIND_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.kind?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              {isEditing ? (
                <Input
                  value={formatMoney({
                    amountMinorUnits: rule!.amount_minor_units,
                    currencyCode: rule!.currency_code,
                  })}
                  disabled
                  readOnly
                />
              ) : (
                <>
                  <Input
                    id="amount"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={!!errors.amount}
                    {...register("amount")}
                  />
                  <FormErrorMessage message={errors.amount?.message} />
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="accountId">
                {isTransfer ? "From account" : "Account"}
              </Label>
              <NativeSelect
                id="accountId"
                aria-invalid={!!errors.accountId}
                value={accountId}
                onChange={(event) => handleAccountChange(event.target.value)}
              >
                <option value="">Select an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.accountId?.message} />
            </div>
            {isTransfer ? (
              <div className="space-y-1.5">
                <Label htmlFor="transferAccountId">To account</Label>
                <NativeSelect
                  id="transferAccountId"
                  aria-invalid={!!errors.transferAccountId}
                  {...register("transferAccountId")}
                >
                  <option value="">Select an account</option>
                  {accounts
                    .filter((account) => account.id !== accountId)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </NativeSelect>
                <FormErrorMessage message={errors.transferAccountId?.message} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="categoryId">Category (optional)</Label>
                <NativeSelect id="categoryId" {...register("categoryId")}>
                  <option value="">Uncategorized</option>
                  {relevantCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="counterparty">
                Merchant / counterparty (optional)
              </Label>
              <Input id="counterparty" {...register("counterparty")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relatedPersonId">Person (optional)</Label>
              <NativeSelect
                id="relatedPersonId"
                {...register("relatedPersonId")}
              >
                <option value="">Unassigned</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </NativeSelect>
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

          <div className="space-y-1.5">
            <Label htmlFor="autoCreateMode">When an occurrence is due</Label>
            <NativeSelect id="autoCreateMode" {...register("autoCreateMode")}>
              {AUTO_CREATE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              Auto-created occurrences are always recorded as “planned,” never
              as already paid.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminderLeadDays">Remind me N days before</Label>
            <Input
              id="reminderLeadDays"
              type="number"
              min={0}
              max={60}
              {...register("reminderLeadDays", { valueAsNumber: true })}
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
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
