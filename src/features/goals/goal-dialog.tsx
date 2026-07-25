"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
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
  GOAL_FLEXIBILITY_LABELS,
  GOAL_PRIORITY_LABELS,
  GOAL_TYPE_LABELS,
  createGoalSchema,
  updateGoalSchema,
  type CreateGoalInput,
  type GoalFlexibility,
  type GoalPriority,
  type GoalType,
} from "@/lib/validation/goals";
import { createGoalAction, updateGoalAction } from "./actions";
import type { GoalRow } from "./queries";

export type AccountOption = { id: string; name: string; currencyCode: string };
export type InvestmentHoldingOption = {
  id: string;
  name: string;
  currencyCode: string;
};
export type PersonOption = { id: string; name: string };

type GoalDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present in edit mode; omitted/null for create. Responsible people and funding sources are only set at creation — manage them afterward from the detail page. */
  goal?: GoalRow | null;
  accounts: AccountOption[];
  investmentHoldings: InvestmentHoldingOption[];
  people: PersonOption[];
  /** Household defaults (Settings — PROMPT 40) prefilling a *new* goal's assumption fields only; an existing goal's own stored assumption always wins, so an edit-only call site can omit these. */
  defaultAnnualInflationRate?: number;
  defaultAnnualExpectedReturn?: number;
  onSaved?: () => void;
};

const FALLBACK_ANNUAL_INFLATION_RATE = 0.06;
const FALLBACK_ANNUAL_EXPECTED_RETURN = 0;

const GOAL_TYPE_OPTIONS = Object.entries(GOAL_TYPE_LABELS) as [
  GoalType,
  string,
][];
const PRIORITY_OPTIONS = Object.entries(GOAL_PRIORITY_LABELS) as [
  GoalPriority,
  string,
][];
const FLEXIBILITY_OPTIONS = Object.entries(GOAL_FLEXIBILITY_LABELS) as [
  GoalFlexibility,
  string,
][];

function toDecimalString(
  amountMinorUnits: number,
  currencyCode: string,
): string {
  return (amountMinorUnits / 10 ** minorUnitExponent(currencyCode)).toString();
}

function toDefaultValues(
  goal: GoalRow | null | undefined,
  defaultAnnualInflationRate: number,
  defaultAnnualExpectedReturn: number,
): CreateGoalInput {
  return {
    name: goal?.name ?? "",
    goalType: (goal?.goal_type as GoalType) ?? "emergency_fund",
    targetAmount: goal
      ? toDecimalString(goal.target_amount_minor_units, goal.currency_code)
      : "",
    currencyCode: goal?.currency_code ?? "INR",
    targetDate: goal?.target_date ?? "",
    manualCurrentSavedAmount: goal
      ? toDecimalString(
          goal.manual_current_saved_amount_minor_units,
          goal.currency_code,
        )
      : "",
    annualInflationRate: goal?.annual_inflation_rate ?? defaultAnnualInflationRate,
    annualExpectedReturn: goal?.annual_expected_return ?? defaultAnnualExpectedReturn,
    priority: (goal?.priority as GoalPriority) ?? "medium",
    flexibility: (goal?.flexibility as GoalFlexibility) ?? "somewhat_flexible",
    notes: goal?.notes ?? null,
    responsiblePersonIds: [],
    fundingSources: [],
  };
}

/**
 * Create/edit dialog for a financial goal (PROMPT 30). Both inflation and
 * expected-return assumptions are always required, visible fields — never
 * a hidden default the household didn't see — and the create form lets a
 * household attach its initial responsible people and funding sources
 * atomically (via create_goal); editing an existing goal only touches its
 * own scalar fields, since changing funding sources/responsible people
 * afterward goes through dedicated add/remove actions on the detail page.
 */
export function GoalDialog({
  householdId,
  open,
  onOpenChange,
  goal,
  accounts,
  investmentHoldings,
  people,
  defaultAnnualInflationRate = FALLBACK_ANNUAL_INFLATION_RATE,
  defaultAnnualExpectedReturn = FALLBACK_ANNUAL_EXPECTED_RETURN,
  onSaved,
}: GoalDialogProps) {
  const isEditing = Boolean(goal);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateGoalInput>({
    resolver: zodResolver(isEditing ? updateGoalSchema : createGoalSchema),
    defaultValues: toDefaultValues(
      goal,
      defaultAnnualInflationRate,
      defaultAnnualExpectedReturn,
    ),
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "fundingSources",
  });

  useEffect(() => {
    if (open) {
      reset(
        toDefaultValues(
          goal,
          defaultAnnualInflationRate,
          defaultAnnualExpectedReturn,
        ),
      );
    }
  }, [open, goal, reset, defaultAnnualInflationRate, defaultAnnualExpectedReturn]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const responsiblePersonIds = watch("responsiblePersonIds") ?? [];

  function toggleResponsiblePerson(personId: string) {
    const current = watch("responsiblePersonIds") ?? [];
    setValue(
      "responsiblePersonIds",
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  }

  function onSubmit(values: CreateGoalInput) {
    setFormError(null);
    startTransition(async () => {
      const result = isEditing
        ? await updateGoalAction(householdId, goal!.id, values)
        : await createGoalAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Goal updated" : "Goal added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit goal" : "Add goal"}</DialogTitle>
          <DialogDescription>
            Target amount is in today&rsquo;s purchasing power — DhanOS inflates
            it forward to the target date using your own inflation assumption.
            Expected return is a planning assumption, never a guarantee.
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
              placeholder="e.g. Emergency fund, House down payment"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FormErrorMessage message={errors.name?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goalType">Type</Label>
              <NativeSelect id="goalType" {...register("goalType")}>
                {GOAL_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.goalType?.message} />
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
              <Label htmlFor="targetAmount">
                Target amount (today&rsquo;s value)
              </Label>
              <Input
                id="targetAmount"
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={!!errors.targetAmount}
                {...register("targetAmount")}
              />
              <FormErrorMessage message={errors.targetAmount?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetDate">Target date</Label>
              <Input
                id="targetDate"
                type="date"
                aria-invalid={!!errors.targetDate}
                {...register("targetDate")}
              />
              <FormErrorMessage message={errors.targetDate?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manualCurrentSavedAmount">
              Already saved, untracked (optional — cash not in a linked account)
            </Label>
            <Input
              id="manualCurrentSavedAmount"
              inputMode="decimal"
              placeholder="0.00"
              {...register("manualCurrentSavedAmount")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="annualInflationRate">
                Inflation assumption (annual, decimal — e.g. 0.06 for 6%)
              </Label>
              <Input
                id="annualInflationRate"
                type="number"
                step="0.01"
                aria-invalid={!!errors.annualInflationRate}
                {...register("annualInflationRate", { valueAsNumber: true })}
              />
              <FormErrorMessage message={errors.annualInflationRate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="annualExpectedReturn">
                Expected return assumption (annual, decimal)
              </Label>
              <Input
                id="annualExpectedReturn"
                type="number"
                step="0.01"
                aria-invalid={!!errors.annualExpectedReturn}
                {...register("annualExpectedReturn", { valueAsNumber: true })}
              />
              <FormErrorMessage
                message={errors.annualExpectedReturn?.message}
              />
              <p className="text-muted-foreground text-xs">
                A planning assumption only — returns are never guaranteed.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <NativeSelect id="priority" {...register("priority")}>
                {PRIORITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flexibility">Flexibility</Label>
              <NativeSelect id="flexibility" {...register("flexibility")}>
                {FLEXIBILITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {!isEditing && (
            <>
              <div className="space-y-2">
                <Label>Responsible people (optional)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {people.map((person) => (
                    <label
                      key={person.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="border-input size-4 rounded"
                        checked={responsiblePersonIds.includes(person.id)}
                        onChange={() => toggleResponsiblePerson(person.id)}
                      />
                      {person.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <Label>Funding sources (optional)</Label>
                {fields.map((field, index) => {
                  const sourceType = watch(
                    `fundingSources.${index}.sourceType`,
                  );
                  return (
                    <div
                      key={field.id}
                      className="flex flex-wrap items-start gap-2"
                    >
                      <NativeSelect
                        className="w-36"
                        aria-label={`Funding source ${index + 1} type`}
                        {...register(`fundingSources.${index}.sourceType`)}
                      >
                        <option value="account">Account</option>
                        <option value="investment_holding">Investment</option>
                      </NativeSelect>
                      {sourceType === "account" ? (
                        <NativeSelect
                          className="flex-1"
                          aria-label={`Funding source ${index + 1} account`}
                          {...register(`fundingSources.${index}.accountId`)}
                        >
                          <option value="">Select an account</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <NativeSelect
                          className="flex-1"
                          aria-label={`Funding source ${index + 1} investment`}
                          {...register(
                            `fundingSources.${index}.investmentHoldingId`,
                          )}
                        >
                          <option value="">Select an investment</option>
                          {investmentHoldings.map((holding) => (
                            <option key={holding.id} value={holding.id}>
                              {holding.name}
                            </option>
                          ))}
                        </NativeSelect>
                      )}
                      <Input
                        className="w-24"
                        type="number"
                        step="1"
                        min={1}
                        max={100}
                        placeholder="% "
                        aria-label={`Funding source ${index + 1} allocation percentage`}
                        {...register(
                          `fundingSources.${index}.allocationPercentage`,
                          { valueAsNumber: true },
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => remove(index)}
                        aria-label={`Remove funding source ${index + 1}`}
                      >
                        <XIcon />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      sourceType: "account",
                      accountId: "",
                      investmentHoldingId: null,
                      allocationPercentage: 100,
                    })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Add funding source
                </Button>
                <p className="text-muted-foreground text-xs">
                  A source can fund more than one goal — allocations across
                  goals are always shown, never hidden, wherever it appears.
                </p>
              </div>
            </>
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
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
