"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, WalletIcon } from "lucide-react";
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
  DRAIN_STATUS_LABELS,
  DRAIN_TYPE_LABELS,
  DRAIN_USAGE_FREQUENCY_LABELS,
  type DrainStatus,
  type DrainType,
  type DrainUsageFrequency,
} from "@/lib/validation/money-drains";
import type { Page } from "@/lib/queries/pagination";
import type { MoneyDrainsOverview } from "./queries";
import { setMoneyDrainStatusAction, deleteMoneyDrainAction } from "./actions";
import {
  MoneyDrainDialog,
  type AccountOption,
  type AssetOption,
  type RecurringRuleOption,
} from "./money-drain-dialog";
import type { MoneyDrainRow } from "./queries";

type MoneyDrainsManagerProps = {
  householdId: string;
  currencyCode: string;
  drains: Page<MoneyDrainRow>;
  overview: MoneyDrainsOverview;
  accounts: AccountOption[];
  assets: AssetOption[];
  recurringRules: RecurringRuleOption[];
  filters: {
    search: string;
    drainType: DrainType | "";
    status: DrainStatus | "";
    usageFrequency: DrainUsageFrequency | "";
  };
};

const DRAIN_TYPE_OPTIONS = Object.entries(DRAIN_TYPE_LABELS) as [
  DrainType,
  string,
][];
const STATUS_OPTIONS = Object.entries(DRAIN_STATUS_LABELS) as [
  DrainStatus,
  string,
][];
const USAGE_FREQUENCY_OPTIONS = Object.entries(
  DRAIN_USAGE_FREQUENCY_LABELS,
) as [DrainUsageFrequency, string][];

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

function AnalysisList({
  rows,
  emptyText,
}: {
  rows: MoneyDrainRow[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs">{emptyText}</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 8).map((row) => (
        <div key={row.id} className="flex items-center gap-2 text-xs">
          <span className="flex-1 truncate">{row.item}</span>
          <SensitiveAmount
            className="w-24 shrink-0 text-right"
            value={
              row.monthlyEquivalentMinorUnits !== null
                ? `${money(row.monthlyEquivalentMinorUnits, row.currency_code)}/mo`
                : "Irregular"
            }
          />
        </div>
      ))}
    </div>
  );
}

export function MoneyDrainsManager({
  householdId,
  currencyCode,
  drains,
  overview,
  accounts,
  assets,
  recurringRules,
  filters,
}: MoneyDrainsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MoneyDrainRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    drain: MoneyDrainRow;
    nextStatus: DrainStatus;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MoneyDrainRow | null>(null);

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
    const result = await setMoneyDrainStatusAction(householdId, {
      moneyDrainId: statusTarget.drain.id,
      status: statusTarget.nextStatus,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      `Marked ${DRAIN_STATUS_LABELS[statusTarget.nextStatus].toLowerCase()}`,
    );
    setStatusTarget(null);
    router.refresh();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteMoneyDrainAction(householdId, {
      moneyDrainId: deleteTarget.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Money drain removed");
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
          title="Total monthly drain"
          amount={money(overview.totals.totalMonthlyMinorUnits, currencyCode)}
          caption={
            overview.totals.irregularCostCount > 0
              ? `Excludes ${overview.totals.irregularCostCount} irregular-cost item${overview.totals.irregularCostCount === 1 ? "" : "s"}`
              : "Active items only"
          }
        />
        <SummaryCard
          title="Total annual drain"
          amount={money(overview.totals.totalAnnualMinorUnits, currencyCode)}
          caption="Sum of every item's own entered cadence"
        />
        <SummaryCard
          title="Essential / discretionary"
          amount={money(
            overview.totals.essentialMonthlyMinorUnits,
            currencyCode,
          )}
          caption={`Discretionary: ${money(overview.totals.discretionaryMonthlyMinorUnits, currencyCode)}/mo`}
        />
        <SummaryCard
          title="Maintenance burden"
          amount={money(
            overview.totals.maintenanceMonthlyMinorUnits,
            currencyCode,
          )}
          caption="Vehicles + maintenance-heavy assets"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Unused subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisList
              rows={overview.unused}
              emptyText="Nothing marked never/rarely used."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              High-cost, low-use
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisList
              rows={overview.highCostLowUse}
              emptyText="Nothing above your own average drain cost with low use."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Upcoming renewals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.upcomingRenewals.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nothing renewing in the next 30 days.
              </p>
            ) : (
              <div className="space-y-1.5">
                {overview.upcomingRenewals.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{row.item}</span>
                    <span className="text-muted-foreground w-20 shrink-0 text-right">
                      {row.next_renewal_date
                        ? formatDisplayDate(row.next_renewal_date, "d MMM")
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Depreciating assets linked
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overview.depreciatingAssetLinked.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No drain is linked to an asset yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {overview.depreciatingAssetLinked.slice(0, 8).map((row) => (
                  <div key={row.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate">{row.item}</span>
                    <span className="text-muted-foreground shrink-0">
                      {row.linkedAssetName ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
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
            placeholder="Search by item…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search money drains"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add drain
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Filter by type"
          className="w-auto"
          value={filters.drainType}
          onChange={(event) => updateParams({ type: event.target.value })}
        >
          <option value="">All types</option>
          {DRAIN_TYPE_OPTIONS.map(([value, label]) => (
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
          aria-label="Filter by usage"
          className="w-auto"
          value={filters.usageFrequency}
          onChange={(event) => updateParams({ usage: event.target.value })}
        >
          <option value="">All usage levels</option>
          {USAGE_FREQUENCY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {drains.rows.length === 0 ? (
        <EmptyState
          icon={WalletIcon}
          title="No money drains tracked yet"
          description="Track subscriptions, memberships, vehicles, rented space, gadgets, or other recurring costs — this never automatically cancels or charges anything."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add drain</Button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Cost</th>
                <th className="px-4 py-2.5 font-medium">
                  Usage (your estimate)
                </th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {drains.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/money-drains/${row.id}`}
                      className="hover:underline"
                    >
                      {row.item}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {DRAIN_TYPE_LABELS[row.drain_type as DrainType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={`${money(row.cost_amount_minor_units, row.currency_code)} / ${row.cost_frequency.replace("_", "-")}`}
                    />
                    {row.linkedRecurringRuleName && (
                      <p className="text-muted-foreground text-xs">
                        Linked to “{row.linkedRecurringRuleName}” — real current
                        amount:{" "}
                        {row.linkedRecurringRuleCurrentAmountMinorUnits !==
                        null ? (
                          <SensitiveAmount
                            value={money(
                              row.linkedRecurringRuleCurrentAmountMinorUnits,
                              row.currency_code,
                            )}
                          />
                        ) : (
                          "—"
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {DRAIN_USAGE_FREQUENCY_LABELS[
                      row.usage_frequency as DrainUsageFrequency
                    ] ?? row.usage_frequency}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        row.status === "active" ? "secondary" : "outline"
                      }
                    >
                      {DRAIN_STATUS_LABELS[row.status as DrainStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {row.item}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/money-drains/${row.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(row)}>
                          Edit
                        </DropdownMenuItem>
                        {row.status !== "paused" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({
                                drain: row,
                                nextStatus: "paused",
                              })
                            }
                          >
                            Mark paused
                          </DropdownMenuItem>
                        )}
                        {row.status !== "active" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({
                                drain: row,
                                nextStatus: "active",
                              })
                            }
                          >
                            Mark active
                          </DropdownMenuItem>
                        )}
                        {row.status !== "cancelled" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({
                                drain: row,
                                nextStatus: "cancelled",
                              })
                            }
                          >
                            Mark cancelled
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDeleteTarget(row)}>
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

      {(drains.page > 1 || drains.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={drains.page <= 1 || isPending}
            onClick={() => goToPage(drains.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {drains.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!drains.hasMore || isPending}
            onClick={() => goToPage(drains.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <MoneyDrainDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        assets={assets}
        recurringRules={recurringRules}
        onSaved={() => router.refresh()}
      />
      <MoneyDrainDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        drain={editTarget}
        accounts={accounts}
        assets={assets}
        recurringRules={recurringRules}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={`Mark ${statusTarget?.drain.item ?? ""} as ${statusTarget ? DRAIN_STATUS_LABELS[statusTarget.nextStatus].toLowerCase() : ""}?`}
        description="This only updates its own record — DhanOS never cancels or changes anything with a provider on your behalf. Its history stays visible either way."
        confirmLabel="Confirm"
        onConfirm={handleStatusConfirm}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this money drain?"
        description={`${deleteTarget?.item} will be permanently removed. If you actually stopped this item, use "Mark cancelled" instead to keep its history.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
