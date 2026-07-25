"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  GOAL_PRIORITY_LABELS,
  GOAL_STATUS_LABELS,
  GOAL_TYPE_LABELS,
  type GoalPriority,
  type GoalStatus,
  type GoalType,
} from "@/lib/validation/goals";
import type { GoalOnTrackStatus } from "@/lib/calculations/goals";
import type { Page } from "@/lib/queries/pagination";
import type { GoalsOverview, GoalRow } from "./queries";
import { deleteGoalAction, setGoalStatusAction } from "./actions";
import {
  GoalDialog,
  type AccountOption,
  type InvestmentHoldingOption,
  type PersonOption,
} from "./goal-dialog";

type GoalsManagerProps = {
  householdId: string;
  currencyCode: string;
  goals: Page<GoalRow>;
  overview: GoalsOverview;
  accounts: AccountOption[];
  investmentHoldings: InvestmentHoldingOption[];
  people: PersonOption[];
  defaultAnnualInflationRate: number;
  defaultAnnualExpectedReturn: number;
  filters: {
    search: string;
    goalType: GoalType | "";
    status: GoalStatus | "";
    priority: GoalPriority | "";
  };
};

const GOAL_TYPE_OPTIONS = Object.entries(GOAL_TYPE_LABELS) as [
  GoalType,
  string,
][];
const STATUS_OPTIONS = Object.entries(GOAL_STATUS_LABELS) as [
  GoalStatus,
  string,
][];
const PRIORITY_OPTIONS = Object.entries(GOAL_PRIORITY_LABELS) as [
  GoalPriority,
  string,
][];

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

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

export function GoalsManager({
  householdId,
  currencyCode,
  goals,
  overview,
  accounts,
  investmentHoldings,
  people,
  defaultAnnualInflationRate,
  defaultAnnualExpectedReturn,
  filters,
}: GoalsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GoalRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    goal: GoalRow;
    nextStatus: GoalStatus;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GoalRow | null>(null);

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Any filter change resets to page 1 — but a call that's explicitly
    // setting the page itself (the Previous/Next buttons) must not have
    // that same value immediately deleted again (PROMPT 56 finding —
    // this unconditional delete silently broke every "Next" button in
    // the app: goToPage(n) calls updateParams({ page: String(n) }),
    // which set it, then this line deleted it again immediately after).
    if (!("page" in patch)) {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  async function handleStatusConfirm() {
    if (!statusTarget) return;
    const result = await setGoalStatusAction(householdId, {
      goalId: statusTarget.goal.id,
      status: statusTarget.nextStatus,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Marked ${GOAL_STATUS_LABELS[statusTarget.nextStatus].toLowerCase()}`,
    );
    setStatusTarget(null);
    router.refresh();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteGoalAction(householdId, {
      goalId: deleteTarget.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Goal removed");
    setDeleteTarget(null);
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total target (inflation-adjusted)"
          amount={money(overview.totalTargetMinorUnits, currencyCode)}
          caption={`${overview.goalCount} active goals`}
        />
        <SummaryCard
          title="Total saved toward goals"
          amount={money(overview.totalCurrentSavedMinorUnits, currencyCode)}
          caption="Manual + linked funding sources"
        />
        <SummaryCard
          title="Total funding gap"
          amount={money(overview.totalFundingGapMinorUnits, currencyCode)}
          caption="What's still needed, in nominal terms"
        />
        <SummaryCard
          title="Over-allocated sources"
          amount={String(overview.overAllocatedSourceCount)}
          caption="Linked to goals totalling over 100%"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(ON_TRACK_LABELS) as [GoalOnTrackStatus, string][]).map(
          ([status, label]) => (
            <Card key={status}>
              <CardHeader>
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {overview.byOnTrackStatus[status]}
                </p>
              </CardContent>
            </Card>
          ),
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 gap-2 sm:max-w-sm"
        >
          <Input
            placeholder="Search by name…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search goals"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add goal
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Filter by type"
          className="w-auto"
          value={filters.goalType}
          onChange={(event) => updateParams({ type: event.target.value })}
        >
          <option value="">All types</option>
          {GOAL_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by status"
          className="w-auto"
          value={filters.status}
          onChange={(event) => updateParams({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by priority"
          className="w-auto"
          value={filters.priority}
          onChange={(event) => updateParams({ priority: event.target.value })}
        >
          <option value="">All priorities</option>
          {PRIORITY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {goals.rows.length === 0 ? (
        <EmptyState
          icon={TargetIcon}
          title="No goals tracked yet"
          description="Set a target for an emergency fund, a home purchase, education, or any other major future need — funding-gap and required-contribution figures are computed automatically."
          action={<Button onClick={() => setCreateOpen(true)}>Add goal</Button>}
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Target date</th>
                <th className="px-4 py-2.5 font-medium">
                  Target (inflation-adj.)
                </th>
                <th className="px-4 py-2.5 font-medium">Saved</th>
                <th className="px-4 py-2.5 font-medium">Funding gap</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {goals.rows.map((goal) => (
                <tr key={goal.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/goals/${goal.id}`}
                      className="hover:underline"
                    >
                      {goal.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {GOAL_TYPE_LABELS[goal.goal_type as GoalType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatDisplayDate(goal.target_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        goal.funding.nominalTargetAmountMinorUnits,
                        goal.currency_code,
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        goal.currentSavedAmountMinorUnits,
                        goal.currency_code,
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        goal.fundingGapMinorUnits,
                        goal.currency_code,
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={onTrackBadgeVariant(goal.onTrackStatus)}>
                      {ON_TRACK_LABELS[goal.onTrackStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {goal.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/goals/${goal.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(goal)}>
                          Edit
                        </DropdownMenuItem>
                        {goal.status !== "paused" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ goal, nextStatus: "paused" })
                            }
                          >
                            Mark paused
                          </DropdownMenuItem>
                        )}
                        {goal.status !== "achieved" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ goal, nextStatus: "achieved" })
                            }
                          >
                            Mark achieved
                          </DropdownMenuItem>
                        )}
                        {goal.status !== "abandoned" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ goal, nextStatus: "abandoned" })
                            }
                          >
                            Mark abandoned
                          </DropdownMenuItem>
                        )}
                        {goal.status !== "active" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ goal, nextStatus: "active" })
                            }
                          >
                            Mark active
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDeleteTarget(goal)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(goals.page > 1 || goals.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={goals.page <= 1 || isPending}
            onClick={() => goToPage(goals.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {goals.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!goals.hasMore || isPending}
            onClick={() => goToPage(goals.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <GoalDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        investmentHoldings={investmentHoldings}
        people={people}
        defaultAnnualInflationRate={defaultAnnualInflationRate}
        defaultAnnualExpectedReturn={defaultAnnualExpectedReturn}
        onSaved={() => router.refresh()}
      />
      <GoalDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        goal={editTarget}
        accounts={accounts}
        investmentHoldings={investmentHoldings}
        people={people}
        defaultAnnualInflationRate={defaultAnnualInflationRate}
        defaultAnnualExpectedReturn={defaultAnnualExpectedReturn}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={`Mark ${statusTarget?.goal.name ?? ""} as ${statusTarget ? GOAL_STATUS_LABELS[statusTarget.nextStatus].toLowerCase() : ""}?`}
        description="This only updates the goal's own record. Its history and figures stay visible either way."
        confirmLabel="Confirm"
        onConfirm={handleStatusConfirm}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this goal?"
        description={`${deleteTarget?.name} and its funding-source/responsible-people links will be permanently removed. If you actually achieved or abandoned it, use "Mark achieved"/"Mark abandoned" instead to keep its history.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
