"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, ScrollTextIcon } from "lucide-react";
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
  LIABILITY_CERTAINTY_LABELS,
  LIABILITY_SOURCE_LABELS,
  LIABILITY_STATUS_LABELS,
  type LiabilityCertainty,
  type LiabilitySource,
  type LiabilityStatus,
} from "@/lib/validation/liabilities";
import type { Page } from "@/lib/queries/pagination";
import { deleteLiabilityAction } from "./actions";
import { LiabilityDialog, type SelectOption } from "./liability-dialog";
import type { LiabilityRow } from "./queries";

type LiabilitiesManagerProps = {
  householdId: string;
  liabilities: Page<LiabilityRow>;
  filters: {
    search: string;
    liabilitySource: LiabilitySource | "";
    status: LiabilityStatus | "";
    certainty: LiabilityCertainty | "";
  };
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const SOURCE_OPTIONS = Object.entries(LIABILITY_SOURCE_LABELS) as [
  LiabilitySource,
  string,
][];
const STATUS_OPTIONS = Object.entries(LIABILITY_STATUS_LABELS) as [
  LiabilityStatus,
  string,
][];
const CERTAINTY_OPTIONS = Object.entries(LIABILITY_CERTAINTY_LABELS) as [
  LiabilityCertainty,
  string,
][];

function statusBadgeVariant(
  status: LiabilityStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "paid") return "secondary";
  if (status === "disputed") return "destructive";
  return "outline";
}

export function LiabilitiesManager({
  householdId,
  liabilities,
  filters,
  people,
  institutions,
  accounts,
}: LiabilitiesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LiabilityRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LiabilityRow | null>(null);

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

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteLiabilityAction(householdId, deleteTarget.id);
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
            aria-label="Search liabilities"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by source"
            className="w-auto"
            value={filters.liabilitySource}
            onChange={(event) => updateParams({ source: event.target.value })}
          >
            <option value="">Informal + general</option>
            {SOURCE_OPTIONS.map(([value, label]) => (
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
            aria-label="Filter by certainty"
            className="w-auto"
            value={filters.certainty}
            onChange={(event) =>
              updateParams({ certainty: event.target.value })
            }
          >
            <option value="">Confirmed + estimated</option>
            {CERTAINTY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add liability
          </Button>
        </div>
      </div>

      {liabilities.rows.length === 0 ? (
        <EmptyState
          icon={ScrollTextIcon}
          title="No liabilities yet"
          description="Track informal borrowing (family/friend/employer advance) and general obligations (taxes/bills/contracts/guarantees) — kept distinguishable from institutional debt, nothing paid until you record it explicitly."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add liability</Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Outstanding</th>
                <th className="px-4 py-2.5 font-medium">Certainty</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {liabilities.rows.map((liability) => (
                <tr key={liability.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/liabilities/${liability.id}`}
                      className="hover:underline"
                    >
                      {liability.name}
                    </Link>
                    {liability.counterpartyName && (
                      <span className="text-muted-foreground block text-xs font-normal">
                        {liability.counterpartyName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        LIABILITY_SOURCE_LABELS[
                          liability.liability_source as LiabilitySource
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatMoney({
                      amountMinorUnits: liability.outstandingMinorUnits,
                      currencyCode: liability.currency_code,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {liability.certainty === "estimated" ? (
                      <Badge variant="destructive">Estimated</Badge>
                    ) : (
                      <Badge variant="secondary">Confirmed</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(
                        liability.status as LiabilityStatus,
                      )}
                    >
                      {
                        LIABILITY_STATUS_LABELS[
                          liability.status as LiabilityStatus
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {liability.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/liabilities/${liability.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setEditTarget(liability)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(liability)}
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

      {(liabilities.page > 1 || liabilities.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={liabilities.page <= 1 || isPending}
            onClick={() => goToPage(liabilities.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {liabilities.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!liabilities.hasMore || isPending}
            onClick={() => goToPage(liabilities.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <LiabilityDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <LiabilityDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        liability={editTarget}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this liability?"
        description={`${deleteTarget?.name} will be permanently removed. This only works while it has no recorded payments.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
