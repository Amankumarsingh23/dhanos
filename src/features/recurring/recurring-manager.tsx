"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RepeatIcon,
} from "lucide-react";
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
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_RULE_KIND_LABELS,
  RECURRING_RULE_STATUS_LABELS,
  type RecurringFrequency,
  type RecurringRuleKind,
  type RecurringRuleStatus,
} from "@/lib/validation/recurring-rules";
import type { Page } from "@/lib/queries/pagination";
import {
  endRecurringRuleAction,
  generateDueOccurrencesAction,
  pauseRecurringRuleAction,
  resumeRecurringRuleAction,
} from "./actions";
import {
  RecurringRuleDialog,
  type AccountOption,
  type CategoryOption,
  type PersonOption,
} from "./recurring-rule-dialog";
import type { RecurringRuleRow } from "./queries";

type RecurringManagerProps = {
  householdId: string;
  rules: Page<RecurringRuleRow>;
  upcoming: RecurringRuleRow[];
  missed: RecurringRuleRow[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  filters: {
    search: string;
    kind: RecurringRuleKind | "";
    status: RecurringRuleStatus | "";
    accountId: string;
  };
};

const KIND_OPTIONS = Object.entries(RECURRING_RULE_KIND_LABELS) as [
  RecurringRuleKind,
  string,
][];
const STATUS_OPTIONS = Object.entries(RECURRING_RULE_STATUS_LABELS) as [
  RecurringRuleStatus,
  string,
][];

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

function RuleSummaryRow({ rule }: { rule: RecurringRuleRow }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-1 truncate">
        <Link href={`/app/recurring/${rule.id}`} className="hover:underline">
          {rule.name}
        </Link>
      </span>
      <span className="text-muted-foreground w-20 shrink-0">
        {rule.next_due_date
          ? formatDisplayDate(rule.next_due_date, "d MMM")
          : "—"}
      </span>
      <SensitiveAmount
        className="w-20 shrink-0 text-right"
        value={money(rule.currentAmountMinorUnits, rule.currency_code)}
      />
    </div>
  );
}

export function RecurringManager({
  householdId,
  rules,
  upcoming,
  missed,
  accounts,
  categories,
  people,
  filters,
}: RecurringManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isGenerating, setIsGenerating] = useState(false);

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringRuleRow | null>(null);
  const [pauseTarget, setPauseTarget] = useState<RecurringRuleRow | null>(null);
  const [endTarget, setEndTarget] = useState<RecurringRuleRow | null>(null);

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  async function handlePauseResumeConfirm() {
    if (!pauseTarget) return;
    const action =
      pauseTarget.status === "paused"
        ? resumeRecurringRuleAction
        : pauseRecurringRuleAction;
    const result = await action(householdId, {
      recurringRuleId: pauseTarget.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      pauseTarget.status === "paused" ? "Rule resumed" : "Rule paused",
    );
    router.refresh();
  }

  async function handleEndConfirm() {
    if (!endTarget) return;
    const result = await endRecurringRuleAction(householdId, {
      recurringRuleId: endTarget.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rule ended");
    router.refresh();
  }

  async function handleGenerateDue() {
    setIsGenerating(true);
    try {
      const result = await generateDueOccurrencesAction(householdId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.generatedCount > 0
          ? `Generated ${result.data.generatedCount} planned occurrence${result.data.generatedCount === 1 ? "" : "s"}`
          : "Nothing due for auto-create",
      );
      router.refresh();
    } finally {
      setIsGenerating(false);
    }
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Upcoming commitments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nothing due in the next couple of weeks.
              </p>
            ) : (
              upcoming
                .slice(0, 8)
                .map((rule) => <RuleSummaryRow key={rule.id} rule={rule} />)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {missed.length > 0 && (
                  <AlertTriangleIcon className="text-destructive size-4" />
                )}
                Missed commitments
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {missed.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing overdue.</p>
            ) : (
              missed
                .slice(0, 8)
                .map((rule) => <RuleSummaryRow key={rule.id} rule={rule} />)
            )}
          </CardContent>
        </Card>
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
            aria-label="Search recurring rules"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleGenerateDue}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating…" : "Generate due occurrences"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add rule
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Filter by kind"
          className="w-auto"
          value={filters.kind}
          onChange={(event) => updateParams({ kind: event.target.value })}
        >
          <option value="">All kinds</option>
          {KIND_OPTIONS.map(([value, label]) => (
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
          aria-label="Filter by account"
          className="w-auto"
          value={filters.accountId}
          onChange={(event) => updateParams({ account: event.target.value })}
        >
          <option value="">All accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {rules.rows.length === 0 ? (
        <EmptyState
          icon={RepeatIcon}
          title="No recurring rules yet"
          description="Set up a recurring SIP, salary, subscription, EMI, or premium — this only sets up the template, never records money by itself."
          action={<Button onClick={() => setCreateOpen(true)}>Add rule</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Frequency</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Next due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rules.rows.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/recurring/${rule.id}`}
                      className="hover:underline"
                    >
                      {rule.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        RECURRING_RULE_KIND_LABELS[
                          rule.kind as RecurringRuleKind
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 capitalize">
                    {
                      RECURRING_FREQUENCY_LABELS[
                        rule.frequency as RecurringFrequency
                      ]
                    }
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        rule.currentAmountMinorUnits,
                        rule.currency_code,
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {rule.next_due_date ? (
                      formatDisplayDate(rule.next_due_date)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          rule.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {
                          RECURRING_RULE_STATUS_LABELS[
                            rule.status as RecurringRuleStatus
                          ]
                        }
                      </Badge>
                      {rule.isMissed && (
                        <Badge variant="destructive">
                          <AlertTriangleIcon />
                          Missed
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {rule.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/recurring/${rule.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(rule)}>
                          Edit
                        </DropdownMenuItem>
                        {rule.status !== "ended" && (
                          <DropdownMenuItem
                            onClick={() => setPauseTarget(rule)}
                          >
                            {rule.status === "paused" ? "Resume" : "Pause"}
                          </DropdownMenuItem>
                        )}
                        {rule.status !== "ended" && (
                          <DropdownMenuItem onClick={() => setEndTarget(rule)}>
                            End
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(rules.page > 1 || rules.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={rules.page <= 1 || isPending}
            onClick={() => goToPage(rules.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {rules.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!rules.hasMore || isPending}
            onClick={() => goToPage(rules.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <RecurringRuleDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <RecurringRuleDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        rule={editTarget}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(pauseTarget)}
        onOpenChange={(open) => !open && setPauseTarget(null)}
        title={
          pauseTarget?.status === "paused"
            ? "Resume this rule?"
            : "Pause this rule?"
        }
        description={
          pauseTarget?.status === "paused"
            ? "Its schedule picks back up from the same next due date — nothing is fast-forwarded."
            : "Its next due date is frozen until resumed. Past records are preserved and unaffected."
        }
        confirmLabel={pauseTarget?.status === "paused" ? "Resume" : "Pause"}
        onConfirm={handlePauseResumeConfirm}
      />
      <ConfirmDialog
        open={Boolean(endTarget)}
        onOpenChange={(open) => !open && setEndTarget(null)}
        title="End this rule?"
        description={`${endTarget?.name} will stop generating or reminding about occurrences. Its history is preserved, never deleted.`}
        confirmLabel="End"
        destructive
        onConfirm={handleEndConfirm}
      />
    </div>
  );
}
