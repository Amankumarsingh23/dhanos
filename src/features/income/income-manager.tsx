"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrendingUpIcon,
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
  INCOME_SOURCE_TYPE_LABELS,
  type IncomeSourceType,
} from "@/lib/validation/income-sources";
import type { Page } from "@/lib/queries/pagination";
import {
  archiveIncomeSourceAction,
  restoreIncomeSourceAction,
} from "./actions";
import { IncomeSourceDialog, type SelectOption } from "./income-source-dialog";
import { RecordIncomeDialog } from "./record-income-dialog";
import type {
  IncomeByPersonRow,
  IncomeBySourceRow,
  IncomeSourceRow,
  IncomeTrendRow,
} from "./queries";

type IncomeManagerProps = {
  householdId: string;
  sources: Page<IncomeSourceRow>;
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
  categories: SelectOption[];
  summary: {
    currencyCode: string;
    bySource: IncomeBySourceRow[];
    byPerson: IncomeByPersonRow[];
    trend: IncomeTrendRow[];
  };
  filters: {
    search: string;
    sourceType: IncomeSourceType | "";
    includeInactive: boolean;
  };
};

const SOURCE_TYPE_OPTIONS = Object.entries(INCOME_SOURCE_TYPE_LABELS) as [
  IncomeSourceType,
  string,
][];

function MonthLabel({ monthKey }: { monthKey: string }) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return (
    <>{date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</>
  );
}

export function IncomeManager({
  householdId,
  sources,
  institutions,
  people,
  accounts,
  categories,
  summary,
  filters,
}: IncomeManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<IncomeSourceRow | null>(null);
  const [recordTarget, setRecordTarget] = useState<IncomeSourceRow | null>(
    null,
  );
  const [archiveTarget, setArchiveTarget] = useState<IncomeSourceRow | null>(
    null,
  );

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

  async function handleArchiveConfirm() {
    if (!archiveTarget) {
      return;
    }
    const action = archiveTarget.is_active
      ? archiveIncomeSourceAction
      : restoreIncomeSourceAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.is_active ? "Source archived" : "Source restored",
    );
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  const maxTrend = Math.max(1, ...summary.trend.map((t) => t.totalMinorUnits));
  const maxBySource = Math.max(
    1,
    ...summary.bySource.map((s) => s.totalMinorUnits),
  );
  const maxByPerson = Math.max(
    1,
    ...summary.byPerson.map((p) => p.totalMinorUnits),
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Income trend (last {summary.trend.length} months)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.trend.map((row) => (
              <div
                key={row.monthKey}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-muted-foreground w-10 shrink-0">
                  <MonthLabel monthKey={row.monthKey} />
                </span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{
                      width: `${(row.totalMinorUnits / maxTrend) * 100}%`,
                    }}
                  />
                </div>
                <SensitiveAmount
                  className="w-20 shrink-0 text-right"
                  value={formatMoney({
                    amountMinorUnits: row.totalMinorUnits,
                    currencyCode: summary.currencyCode,
                  })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Income by source
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.bySource.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No cleared income this month.
              </p>
            ) : (
              summary.bySource.slice(0, 6).map((row) => (
                <div
                  key={row.incomeSourceId ?? "none"}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-24 shrink-0 truncate">
                    {row.sourceName}
                  </span>
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{
                        width: `${(row.totalMinorUnits / maxBySource) * 100}%`,
                      }}
                    />
                  </div>
                  <SensitiveAmount
                    className="w-20 shrink-0 text-right"
                    value={formatMoney({
                      amountMinorUnits: row.totalMinorUnits,
                      currencyCode: summary.currencyCode,
                    })}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Income by person
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.byPerson.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No cleared income this month.
              </p>
            ) : (
              summary.byPerson.slice(0, 6).map((row) => (
                <div
                  key={row.personId ?? "none"}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-24 shrink-0 truncate">
                    {row.personName}
                  </span>
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full"
                      style={{
                        width: `${(row.totalMinorUnits / maxByPerson) * 100}%`,
                      }}
                    />
                  </div>
                  <SensitiveAmount
                    className="w-20 shrink-0 text-right"
                    value={formatMoney({
                      amountMinorUnits: row.totalMinorUnits,
                      currencyCode: summary.currencyCode,
                    })}
                  />
                </div>
              ))
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
            aria-label="Search income sources"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by type"
            className="w-auto"
            value={filters.sourceType}
            onChange={(event) => updateParams({ type: event.target.value })}
          >
            <option value="">All types</option>
            {SOURCE_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.includeInactive}
              onChange={(event) =>
                updateParams({
                  inactive: event.target.checked ? "true" : undefined,
                })
              }
              className="border-input size-4 rounded"
            />
            Show inactive
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add source
          </Button>
        </div>
      </div>

      {sources.rows.length === 0 ? (
        <EmptyState
          icon={TrendingUpIcon}
          title="No income sources yet"
          description="Declare a salary, freelance client, rental, or other expected income stream. Adding one here never records income by itself."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add source</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Frequency</th>
                <th className="px-4 py-2.5 font-medium">Last received</th>
                <th className="px-4 py-2.5 font-medium">Next expected</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {sources.rows.map((source) => (
                <tr key={source.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/income/${source.id}`}
                      className="hover:underline"
                    >
                      {source.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        INCOME_SOURCE_TYPE_LABELS[
                          source.source_type as IncomeSourceType
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {source.personName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 capitalize">
                    {source.frequency.replace("_", "-")}
                  </td>
                  <td className="px-4 py-2.5">
                    {source.lastReceivedDate ? (
                      formatDisplayDate(source.lastReceivedDate)
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {source.nextExpectedDate ? (
                      formatDisplayDate(source.nextExpectedDate)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={source.is_active ? "secondary" : "outline"}
                      >
                        {source.is_active ? "Active" : "Inactive"}
                      </Badge>
                      {source.isMissed && (
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
                            Actions for {source.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setRecordTarget(source)}
                        >
                          Record income
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/app/income/${source.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(source)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(source)}
                        >
                          {source.is_active ? "Archive" : "Restore"}
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

      {(sources.page > 1 || sources.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={sources.page <= 1 || isPending}
            onClick={() => goToPage(sources.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {sources.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!sources.hasMore || isPending}
            onClick={() => goToPage(sources.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <IncomeSourceDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutions={institutions}
        people={people}
        accounts={accounts}
        categories={categories}
        onSaved={() => router.refresh()}
      />
      <IncomeSourceDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        source={editTarget}
        institutions={institutions}
        people={people}
        accounts={accounts}
        categories={categories}
        onSaved={() => router.refresh()}
      />
      <RecordIncomeDialog
        householdId={householdId}
        open={Boolean(recordTarget)}
        onOpenChange={(open) => !open && setRecordTarget(null)}
        source={recordTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.is_active
            ? "Archive this source?"
            : "Restore this source?"
        }
        description={
          archiveTarget?.is_active
            ? `${archiveTarget?.name} will be hidden from active lists, but its receipt history is preserved.`
            : `${archiveTarget?.name} will show up in active lists again.`
        }
        confirmLabel={archiveTarget?.is_active ? "Archive" : "Restore"}
        destructive={Boolean(archiveTarget?.is_active)}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
