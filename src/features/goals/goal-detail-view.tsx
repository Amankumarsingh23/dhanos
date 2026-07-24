"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  GOAL_FLEXIBILITY_LABELS,
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_TYPE_LABELS,
  type GoalFlexibility,
  type GoalPriority,
  type GoalStatus,
  type GoalType,
} from "@/lib/validation/goals";
import type { GoalOnTrackStatus } from "@/lib/calculations/goals";
import {
  addGoalFundingSourceAction,
  addGoalResponsiblePersonAction,
  removeGoalFundingSourceAction,
  removeGoalResponsiblePersonAction,
  setGoalStatusAction,
} from "./actions";
import {
  GoalDialog,
  type AccountOption,
  type InvestmentHoldingOption,
  type PersonOption,
} from "./goal-dialog";
import type { GoalRow } from "./queries";

type GoalDetailViewProps = {
  householdId: string;
  goal: GoalRow;
  accounts: AccountOption[];
  investmentHoldings: InvestmentHoldingOption[];
  people: PersonOption[];
};

const ON_TRACK_LABELS: Record<GoalOnTrackStatus, string> = {
  funded: "Funded",
  on_track: "On track",
  needs_contribution: "Needs contribution",
  overdue: "Overdue",
};

function onTrackBadgeVariant(
  status: GoalOnTrackStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "funded" || status === "on_track") return "secondary";
  if (status === "overdue") return "destructive";
  return "outline";
}

function statusBadgeVariant(
  status: GoalStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "achieved") return "secondary";
  if (status === "abandoned") return "destructive";
  return "outline";
}

export function GoalDetailView({
  householdId,
  goal,
  accounts,
  investmentHoldings,
  people,
}: GoalDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isSourcePending, startSourceTransition] = useTransition();
  const [isPersonPending, startPersonTransition] = useTransition();

  const [newSourceType, setNewSourceType] = useState<
    "account" | "investment_holding"
  >("account");
  const [newSourceId, setNewSourceId] = useState("");
  const [newSourcePercentage, setNewSourcePercentage] = useState("100");
  const [newPersonId, setNewPersonId] = useState("");

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: goal.currency_code });

  function handleStatusChange(status: GoalStatus) {
    startStatusTransition(async () => {
      const result = await setGoalStatusAction(householdId, {
        goalId: goal.id,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Marked ${GOAL_STATUS_LABELS[status].toLowerCase()}`);
      router.refresh();
    });
  }

  function handleAddFundingSource() {
    if (!newSourceId) {
      toast.error("Select an account or investment first.");
      return;
    }
    startSourceTransition(async () => {
      const result = await addGoalFundingSourceAction(householdId, {
        goalId: goal.id,
        fundingSource: {
          sourceType: newSourceType,
          accountId: newSourceType === "account" ? newSourceId : null,
          investmentHoldingId:
            newSourceType === "investment_holding" ? newSourceId : null,
          allocationPercentage: Number(newSourcePercentage) || 100,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Funding source added");
      setNewSourceId("");
      setNewSourcePercentage("100");
      router.refresh();
    });
  }

  function handleRemoveFundingSource(goalFundingSourceId: string) {
    startSourceTransition(async () => {
      const result = await removeGoalFundingSourceAction(householdId, {
        goalId: goal.id,
        goalFundingSourceId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Funding source removed");
      router.refresh();
    });
  }

  function handleAddResponsiblePerson() {
    if (!newPersonId) {
      toast.error("Select a person first.");
      return;
    }
    startPersonTransition(async () => {
      const result = await addGoalResponsiblePersonAction(householdId, {
        goalId: goal.id,
        personId: newPersonId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Responsible person added");
      setNewPersonId("");
      router.refresh();
    });
  }

  function handleRemoveResponsiblePerson(goalResponsiblePersonId: string) {
    startPersonTransition(async () => {
      const result = await removeGoalResponsiblePersonAction(householdId, {
        goalId: goal.id,
        goalResponsiblePersonId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Responsible person removed");
      router.refresh();
    });
  }

  const availableAccounts = accounts.filter(
    (account) =>
      !goal.fundingSources.some(
        (source) =>
          source.sourceType === "account" && source.sourceId === account.id,
      ),
  );
  const availableHoldings = investmentHoldings.filter(
    (holding) =>
      !goal.fundingSources.some(
        (source) =>
          source.sourceType === "investment_holding" &&
          source.sourceId === holding.id,
      ),
  );
  const availablePeople = people.filter(
    (person) => !goal.responsiblePeople.some((rp) => rp.personId === person.id),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {goal.name}
              <Badge variant={statusBadgeVariant(goal.status as GoalStatus)}>
                {GOAL_STATUS_LABELS[goal.status as GoalStatus]}
              </Badge>
              <Badge variant={onTrackBadgeVariant(goal.onTrackStatus)}>
                {ON_TRACK_LABELS[goal.onTrackStatus]}
              </Badge>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {GOAL_TYPE_LABELS[goal.goal_type as GoalType]} ·{" "}
              {GOAL_PRIORITY_LABELS[goal.priority as GoalPriority]} priority ·{" "}
              {GOAL_FLEXIBILITY_LABELS[goal.flexibility as GoalFlexibility]}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Edit
              </DropdownMenuItem>
              {goal.status !== "active" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("active")}
                >
                  Mark active
                </DropdownMenuItem>
              )}
              {goal.status !== "paused" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("paused")}
                >
                  Mark paused
                </DropdownMenuItem>
              )}
              {goal.status !== "achieved" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("achieved")}
                >
                  Mark achieved
                </DropdownMenuItem>
              )}
              {goal.status !== "abandoned" && (
                <DropdownMenuItem
                  disabled={isStatusPending}
                  onClick={() => handleStatusChange("abandoned")}
                >
                  Mark abandoned
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Target (today's value)"
              value={money(goal.target_amount_minor_units)}
            />
            <Field
              label="Target (inflation-adjusted)"
              value={money(goal.funding.nominalTargetAmountMinorUnits)}
            />
            <Field
              label="Target date"
              value={formatDisplayDate(goal.target_date)}
            />
            <Field
              label="Months remaining"
              value={String(goal.funding.monthsRemaining)}
            />
            <Field
              label="Currently saved"
              value={money(goal.currentSavedAmountMinorUnits)}
            />
            <Field
              label="Funding gap"
              value={money(goal.fundingGapMinorUnits)}
            />
            <Field
              label="Required monthly contribution"
              value={money(goal.funding.requiredMonthlyContributionMinorUnits)}
            />
            <Field
              label="Projected value at target date"
              value={money(goal.funding.projectedCurrentAmountGrowthMinorUnits)}
            />
          </dl>
          <div className="bg-muted/40 mt-4 rounded-lg border p-3 text-xs">
            <p className="font-medium">Assumptions used in these figures</p>
            <p className="text-muted-foreground mt-1">
              Inflation: {(goal.annual_inflation_rate * 100).toFixed(1)}%/year ·
              Expected return: {(goal.annual_expected_return * 100).toFixed(1)}
              %/year — a planning assumption only, never a guarantee. The
              projected value and &ldquo;on track&rdquo; status assume this
              return is actually achieved.
            </p>
          </div>
          {(goal.excludedCurrencyMismatchCount > 0 ||
            goal.missingValueCount > 0) && (
            <p className="text-muted-foreground mt-2 text-xs">
              {goal.excludedCurrencyMismatchCount > 0 &&
                `${goal.excludedCurrencyMismatchCount} funding source(s) excluded from "currently saved" due to a currency mismatch. `}
              {goal.missingValueCount > 0 &&
                `${goal.missingValueCount} funding source(s) have no current value yet and count as ₹0 until one is recorded.`}
            </p>
          )}
          {goal.notes && (
            <div className="mt-4 border-t pt-4">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p className="text-sm">{goal.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Funding sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goal.fundingSources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No linked accounts or investments yet — only the manually entered
              saved amount counts toward this goal.
            </p>
          ) : (
            <div className="divide-border divide-y text-sm">
              {goal.fundingSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="font-medium">
                      {source.sourceName}{" "}
                      <span className="text-muted-foreground font-normal">
                        (
                        {source.sourceType === "account"
                          ? "Account"
                          : "Investment"}
                        )
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {source.allocationPercentage}% allocated to this goal
                      {source.currentValueMinorUnits !== null &&
                        ` — current value ${formatMoney({ amountMinorUnits: source.currentValueMinorUnits, currencyCode: source.currencyCode })}`}
                    </p>
                    {source.isOverAllocated && (
                      <p className="text-destructive text-xs">
                        Over-allocated: this source totals{" "}
                        {source.totalAllocationAcrossGoals}% allocated across
                        all goals linking to it.
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSourcePending}
                    onClick={() => handleRemoveFundingSource(source.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Type</label>
              <NativeSelect
                className="w-36"
                value={newSourceType}
                onChange={(event) => {
                  setNewSourceType(
                    event.target.value as "account" | "investment_holding",
                  );
                  setNewSourceId("");
                }}
              >
                <option value="account">Account</option>
                <option value="investment_holding">Investment</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Source</label>
              <NativeSelect
                className="w-48"
                value={newSourceId}
                onChange={(event) => setNewSourceId(event.target.value)}
              >
                <option value="">Select…</option>
                {(newSourceType === "account"
                  ? availableAccounts
                  : availableHoldings
                ).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                Allocation %
              </label>
              <Input
                className="w-24"
                type="number"
                min={1}
                max={100}
                value={newSourcePercentage}
                onChange={(event) => setNewSourcePercentage(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isSourcePending}
              onClick={handleAddFundingSource}
            >
              Add source
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Responsible people
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goal.responsiblePeople.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one specifically assigned yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {goal.responsiblePeople.map((person) => (
                <Badge key={person.id} variant="outline" className="gap-1.5">
                  {person.name}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    disabled={isPersonPending}
                    onClick={() => handleRemoveResponsiblePerson(person.id)}
                    aria-label={`Remove ${person.name}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 border-t pt-3">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">Person</label>
              <NativeSelect
                className="w-48"
                value={newPersonId}
                onChange={(event) => setNewPersonId(event.target.value)}
              >
                <option value="">Select…</option>
                {availablePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isPersonPending}
              onClick={handleAddResponsiblePerson}
            >
              Add person
            </Button>
          </div>
        </CardContent>
      </Card>

      <GoalDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        goal={goal}
        accounts={accounts}
        investmentHoldings={investmentHoldings}
        people={people}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
