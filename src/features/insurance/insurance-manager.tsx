"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, ShieldIcon } from "lucide-react";
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
  POLICY_STATUS_LABELS,
  POLICY_TYPE_LABELS,
  type PolicyStatus,
  type PolicyType,
} from "@/lib/validation/insurance";
import type { Page } from "@/lib/queries/pagination";
import { deleteInsurancePolicyAction } from "./actions";
import { PolicyDialog, type SelectOption } from "./policy-dialog";
import type { InsurancePolicyRow } from "./queries";

type InsuranceManagerProps = {
  householdId: string;
  policies: Page<InsurancePolicyRow>;
  filters: {
    search: string;
    policyType: PolicyType | "";
    status: PolicyStatus | "";
  };
  people: SelectOption[];
  institutions: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const POLICY_TYPE_OPTIONS = Object.entries(POLICY_TYPE_LABELS) as [
  PolicyType,
  string,
][];
const POLICY_STATUS_OPTIONS = Object.entries(POLICY_STATUS_LABELS) as [
  PolicyStatus,
  string,
][];

function statusBadgeVariant(
  status: PolicyStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "active") return "secondary";
  if (status === "lapsed" || status === "cancelled") return "destructive";
  return "outline";
}

export function InsuranceManager({
  householdId,
  policies,
  filters,
  people,
  institutions,
  accounts,
}: InsuranceManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InsurancePolicyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InsurancePolicyRow | null>(
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

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteInsurancePolicyAction(
      householdId,
      deleteTarget.id,
    );
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
            aria-label="Search policies"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by policy type"
            className="w-auto"
            value={filters.policyType}
            onChange={(event) => updateParams({ type: event.target.value })}
          >
            <option value="">All types</option>
            {POLICY_TYPE_OPTIONS.map(([value, label]) => (
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
            {POLICY_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add policy
          </Button>
        </div>
      </div>

      {policies.rows.length === 0 ? (
        <EmptyState
          icon={ShieldIcon}
          title="No insurance policies yet"
          description="Track health, term, life, vehicle, home, and other policies — coverage, premiums, nominees, and renewal history, all in one place."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add policy</Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Insurer</th>
                <th className="px-4 py-2.5 font-medium">Coverage</th>
                <th className="px-4 py-2.5 font-medium">Premium</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {policies.rows.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/insurance/${policy.id}`}
                      className="hover:underline"
                    >
                      {policy.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {policy.insuredPeople
                        .map((p) => p.displayName)
                        .join(", ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {POLICY_TYPE_LABELS[policy.policy_type as PolicyType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">{policy.insurerName}</td>
                  <td className="px-4 py-2.5">
                    {formatMoney({
                      amountMinorUnits: policy.coverage_amount_minor_units,
                      currencyCode: policy.currency_code,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    {formatMoney({
                      amountMinorUnits: policy.premium_amount_minor_units,
                      currencyCode: policy.currency_code,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(
                        policy.status as PolicyStatus,
                      )}
                    >
                      {POLICY_STATUS_LABELS[policy.status as PolicyStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {policy.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/insurance/${policy.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(policy)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(policy)}
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

      {(policies.page > 1 || policies.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={policies.page <= 1 || isPending}
            onClick={() => goToPage(policies.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {policies.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!policies.hasMore || isPending}
            onClick={() => goToPage(policies.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <PolicyDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <PolicyDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        policy={editTarget}
        people={people}
        institutions={institutions}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this policy?"
        description={`${deleteTarget?.name} will be permanently removed, including its renewal link and insured-people list.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
