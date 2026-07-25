"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, ScaleIcon } from "lucide-react";
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
  LOAN_STATUS_LABELS,
  LOAN_TYPE_LABELS,
  type LoanStatus,
  type LoanType,
} from "@/lib/validation/loans";
import type { Page } from "@/lib/queries/pagination";
import { deleteLoanAction } from "./actions";
import { LoanDialog, type SelectOption } from "./loan-dialog";
import { DisburseDialog } from "./disburse-dialog";
import type { LoanRow } from "./queries";

type LoansManagerProps = {
  householdId: string;
  loans: Page<LoanRow>;
  filters: {
    search: string;
    loanType: LoanType | "";
    status: LoanStatus | "";
  };
  institutions: SelectOption[];
  people: SelectOption[];
  accounts: (SelectOption & { currencyCode: string })[];
};

const LOAN_TYPE_OPTIONS = Object.entries(LOAN_TYPE_LABELS) as [
  LoanType,
  string,
][];
const LOAN_STATUS_OPTIONS = Object.entries(LOAN_STATUS_LABELS) as [
  LoanStatus,
  string,
][];

function statusBadgeVariant(
  status: LoanStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "active") return "secondary";
  if (status === "defaulted") return "destructive";
  return "outline";
}

export function LoansManager({
  householdId,
  loans,
  filters,
  institutions,
  people,
  accounts,
}: LoansManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LoanRow | null>(null);
  const [disburseTarget, setDisburseTarget] = useState<LoanRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LoanRow | null>(null);

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
    const result = await deleteLoanAction(householdId, deleteTarget.id);
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
            aria-label="Search loans"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by loan type"
            className="w-auto"
            value={filters.loanType}
            onChange={(event) => updateParams({ type: event.target.value })}
          >
            <option value="">All types</option>
            {LOAN_TYPE_OPTIONS.map(([value, label]) => (
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
            {LOAN_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add loan
          </Button>
        </div>
      </div>

      {loans.rows.length === 0 ? (
        <EmptyState
          icon={ScaleIcon}
          title="No loans yet"
          description="Track education, personal, business, home, vehicle, gold, credit-card, family, and informal loans — nothing is disbursed or repaid until you record it explicitly."
          action={<Button onClick={() => setCreateOpen(true)}>Add loan</Button>}
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Lender</th>
                <th className="px-4 py-2.5 font-medium">Outstanding</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {loans.rows.map((loan) => (
                <tr key={loan.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/debts/${loan.id}`}
                      className="hover:underline"
                    >
                      {loan.name}
                    </Link>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {loan.borrowerName}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {LOAN_TYPE_LABELS[loan.loan_type as LoanType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">{loan.lenderName}</td>
                  <td className="px-4 py-2.5">
                    {loan.disbursed_amount_minor_units === null ? (
                      <span className="text-muted-foreground">
                        Not disbursed
                      </span>
                    ) : (
                      formatMoney({
                        amountMinorUnits: loan.outstandingMinorUnits,
                        currencyCode: loan.currency_code,
                      })
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(loan.status as LoanStatus)}
                    >
                      {LOAN_STATUS_LABELS[loan.status as LoanStatus]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {loan.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/app/debts/${loan.id}`}>
                            View details
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditTarget(loan)}>
                          Edit
                        </DropdownMenuItem>
                        {loan.status === "pending_disbursement" && (
                          <DropdownMenuItem
                            onClick={() => setDisburseTarget(loan)}
                          >
                            Record disbursement
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setDeleteTarget(loan)}>
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

      {(loans.page > 1 || loans.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={loans.page <= 1 || isPending}
            onClick={() => goToPage(loans.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {loans.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!loans.hasMore || isPending}
            onClick={() => goToPage(loans.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <LoanDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutions={institutions}
        people={people}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <LoanDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        loan={editTarget}
        institutions={institutions}
        people={people}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      {disburseTarget && (
        <DisburseDialog
          householdId={householdId}
          open={Boolean(disburseTarget)}
          onOpenChange={(open) => !open && setDisburseTarget(null)}
          loan={disburseTarget}
          onSaved={() => router.refresh()}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this loan?"
        description={`${deleteTarget?.name} will be permanently removed. This only works while it has no recorded payments.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
