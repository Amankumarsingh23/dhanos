"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GemIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
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
import { isOwnershipUncertain } from "@/lib/calculations/assets";
import {
  ASSET_GROUP_LABELS,
  OWNERSHIP_STATUS_LABELS,
  type AssetGroup,
  type OwnershipStatus,
} from "@/lib/validation/assets";
import type { Page } from "@/lib/queries/pagination";
import { deleteAssetAction } from "./actions";
import { AssetDialog, type SelectOption } from "./asset-dialog";
import type { AssetRow } from "./queries";

type AssetsManagerProps = {
  householdId: string;
  assets: Page<AssetRow>;
  filters: {
    search: string;
    assetGroup: AssetGroup | "";
    ownershipStatus: OwnershipStatus | "";
  };
  people: SelectOption[];
  loans: SelectOption[];
};

const ASSET_GROUP_OPTIONS = Object.entries(ASSET_GROUP_LABELS) as [
  AssetGroup,
  string,
][];
const OWNERSHIP_STATUS_OPTIONS = Object.entries(OWNERSHIP_STATUS_LABELS) as [
  OwnershipStatus,
  string,
][];

function statusBadgeVariant(
  status: OwnershipStatus,
): "secondary" | "outline" | "destructive" {
  if (isOwnershipUncertain(status)) return "destructive";
  if (status === "confirmed") return "secondary";
  return "outline";
}

export function AssetsManager({
  householdId,
  assets,
  filters,
  people,
  loans,
}: AssetsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssetRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null);

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
    const result = await deleteAssetAction(householdId, {
      assetId: deleteTarget.id,
    });
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
            aria-label="Search assets"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by group"
            className="w-auto"
            value={filters.assetGroup}
            onChange={(event) => updateParams({ group: event.target.value })}
          >
            <option value="">All groups</option>
            {ASSET_GROUP_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by ownership status"
            className="w-auto"
            value={filters.ownershipStatus}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All ownership statuses</option>
            {OWNERSHIP_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add asset
          </Button>
        </div>
      </div>

      {assets.rows.length === 0 ? (
        <EmptyState
          icon={GemIcon}
          title="No assets tracked yet"
          description="Vehicles, jewellery, property, business equipment — track what you own, its value over time, ownership share, and any attached loan."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add asset</Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Group / category</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Ownership</th>
                <th className="px-4 py-2.5 font-medium">Latest value</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {assets.rows.map((asset) => (
                <tr key={asset.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/assets/${asset.id}`}
                      className="hover:underline"
                    >
                      {asset.name}
                    </Link>
                    {asset.relatedLoanName && (
                      <span className="text-muted-foreground block text-xs font-normal">
                        Loan: {asset.relatedLoanName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {ASSET_GROUP_LABELS[asset.asset_group as AssetGroup]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">{asset.ownerName}</td>
                  <td className="px-4 py-2.5">{asset.ownership_percentage}%</td>
                  <td className="px-4 py-2.5">
                    {asset.latestValueMinorUnits !== null ? (
                      formatMoney({
                        amountMinorUnits: asset.latestValueMinorUnits,
                        currencyCode: asset.currency_code,
                      })
                    ) : (
                      <span className="text-muted-foreground">
                        No valuation
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(
                        asset.ownership_status as OwnershipStatus,
                      )}
                    >
                      {
                        OWNERSHIP_STATUS_LABELS[
                          asset.ownership_status as OwnershipStatus
                        ]
                      }
                    </Badge>
                    {!asset.include_in_net_worth && (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        Excluded
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {asset.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/assets/${asset.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(asset)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(asset)}
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

      {(assets.page > 1 || assets.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={assets.page <= 1 || isPending}
            onClick={() => goToPage(assets.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {assets.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!assets.hasMore || isPending}
            onClick={() => goToPage(assets.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <AssetDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={people}
        loans={loans}
        onSaved={() => router.refresh()}
      />
      <AssetDialog
        key={editTarget?.id ?? "edit-none"}
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        asset={editTarget}
        people={people}
        loans={loans}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this asset?"
        description={`${deleteTarget?.name} will be permanently removed, including its valuation history and documents.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
