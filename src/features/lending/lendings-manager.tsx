"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { HandCoinsIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatMoney } from "@/lib/money";
import {
  LENDING_RISK_LEVEL_LABELS,
  LENDING_STATUS_LABELS,
  type LendingRiskLevel,
  type LendingStatus,
} from "@/lib/validation/lending";
import type { Page } from "@/lib/queries/pagination";
import { deleteLendingAction } from "./actions";
import { LendingDialog, type SelectOption } from "./lending-dialog";
import type { LendingRow } from "./queries";

type LendingsManagerProps = {
  householdId: string;
  lendings: Page<LendingRow>;
  filters: {
    search: string;
    status: LendingStatus | "";
    riskLevel: LendingRiskLevel | "";
  };
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const STATUS_OPTIONS = Object.entries(LENDING_STATUS_LABELS) as [
  LendingStatus,
  string,
][];
const RISK_LEVEL_OPTIONS = Object.entries(LENDING_RISK_LEVEL_LABELS) as [
  LendingRiskLevel,
  string,
][];

function statusBadgeVariant(
  status: LendingStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "repaid") return "secondary";
  if (status === "disputed" || status === "written_off") return "destructive";
  return "outline";
}

export function LendingsManager({
  householdId,
  lendings,
  filters,
  people,
  institutions,
  accounts,
}: LendingsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LendingRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LendingRow | null>(null);

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

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteLendingAction(householdId, deleteTarget.id);
    if (!result.ok) {
      throw new Error(result.error);
    }
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 gap-2 sm:max-w-sm"
        >
          <Input
            placeholder="Search by name…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search lendings"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
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
            aria-label="Filter by risk level"
            className="w-auto"
            value={filters.riskLevel}
            onChange={(event) => updateParams({ risk: event.target.value })}
          >
            <option value="">All risk levels</option>
            {RISK_LEVEL_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Record money lent
          </Button>
        </div>
      </div>

      {lendings.rows.length === 0 ? (
        <EmptyState
          icon={HandCoinsIcon}
          title="No money lent yet"
          description="Track money lent to people or companies — recovery status, risk, and repayment history all live here, separate from your own expenses."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              Record money lent
            </Button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Borrower</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5 font-medium">Outstanding</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {lendings.rows.map((lending) => (
                <tr key={lending.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/lending/${lending.id}`}
                      className="hover:underline"
                    >
                      {lending.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{lending.borrowerName}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        LENDING_RISK_LEVEL_LABELS[
                          lending.risk_level as LendingRiskLevel
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatMoney({
                      amountMinorUnits: lending.outstandingMinorUnits,
                      currencyCode: lending.currency_code,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(
                        lending.status as LendingStatus,
                      )}
                    >
                      {LENDING_STATUS_LABELS[lending.status as LendingStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {lending.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/lending/${lending.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setEditTarget(lending)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(lending)}
                        >
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

      {(lendings.page > 1 || lendings.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={lendings.page <= 1 || isPending}
            onClick={() => goToPage(lendings.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {lendings.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!lendings.hasMore || isPending}
            onClick={() => goToPage(lendings.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <LendingDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <LendingDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        lending={editTarget}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this lending record?"
        description={`${deleteTarget?.name} will be permanently removed. This only works while it has no recorded repayments.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
