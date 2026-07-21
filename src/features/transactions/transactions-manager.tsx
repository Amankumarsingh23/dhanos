"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRightIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
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
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  TRANSACTION_KIND_LABELS,
  TRANSACTION_STATUS_LABELS,
  type TransactionKind,
  type TransactionStatus,
} from "@/lib/validation/transactions";
import type { Page } from "@/lib/queries/pagination";
import {
  archiveTransactionAction,
  getTransactionSplitsAction,
  restoreTransactionAction,
} from "./actions";
import {
  TransactionDialog,
  type AccountOption,
  type CategoryOption,
  type PersonOption,
} from "./transaction-dialog";
import { RefundDialog } from "./refund-dialog";
import type { TransactionRow, TransactionSplitRecord } from "./queries";

type TransactionsManagerProps = {
  householdId: string;
  transactions: Page<TransactionRow>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  filters: {
    search: string;
    kind: TransactionKind | "";
    status: TransactionStatus | "";
    accountId: string;
    includeCancelled: boolean;
  };
};

const KIND_OPTIONS = Object.entries(TRANSACTION_KIND_LABELS) as [
  TransactionKind,
  string,
][];
const STATUS_OPTIONS = Object.entries(TRANSACTION_STATUS_LABELS) as [
  TransactionStatus,
  string,
][];

export function TransactionsManager({
  householdId,
  transactions,
  accounts,
  categories,
  people,
  filters,
}: TransactionsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TransactionRow | null>(null);
  const [editSplits, setEditSplits] = useState<TransactionSplitRecord[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<TransactionRow | null>(
    null,
  );
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);

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

  async function handleEdit(transaction: TransactionRow) {
    if (transaction.splitCount > 0) {
      const result = await getTransactionSplitsAction(
        householdId,
        transaction.id,
      );
      setEditSplits(result.ok ? result.data : []);
    } else {
      setEditSplits([]);
    }
    setEditTarget(transaction);
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) {
      return;
    }
    const action =
      archiveTarget.status === "cancelled"
        ? restoreTransactionAction
        : archiveTransactionAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.status === "cancelled"
        ? "Transaction restored"
        : "Transaction archived",
    );
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
            placeholder="Search description or counterparty…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search transactions"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add transaction
        </Button>
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
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeCancelled}
            onChange={(event) =>
              updateParams({
                cancelled: event.target.checked ? "true" : undefined,
              })
            }
            className="border-input size-4 rounded"
          />
          Show cancelled
        </label>
      </div>

      {transactions.rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title="No transactions yet"
          description="Record income, expenses, or transfers between accounts."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add transaction</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Account</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {transactions.rows.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="px-4 py-2.5">
                    {formatDisplayDate(transaction.transaction_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        TRANSACTION_KIND_LABELS[
                          transaction.kind as TransactionKind
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {transaction.kind === "transfer" ? (
                      <span>
                        {transaction.accountName} →{" "}
                        {transaction.transferAccountName}
                      </span>
                    ) : (
                      transaction.accountName
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {transaction.splitCount > 0 ? (
                      <Badge variant="secondary">
                        Split ({transaction.splitCount})
                      </Badge>
                    ) : (
                      (transaction.categoryName ?? (
                        <span className="text-muted-foreground">—</span>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {transaction.description ?? transaction.counterparty ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {transaction.refundedAmountMinorUnits > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        Refunded{" "}
                        {formatMoney({
                          amountMinorUnits:
                            transaction.refundedAmountMinorUnits,
                          currencyCode: transaction.currency_code,
                        })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={formatMoney({
                        amountMinorUnits: transaction.amount_minor_units,
                        currencyCode: transaction.currency_code,
                      })}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        transaction.status === "cancelled"
                          ? "outline"
                          : transaction.status === "cleared" ||
                              transaction.status === "reconciled"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {
                        TRANSACTION_STATUS_LABELS[
                          transaction.status as TransactionStatus
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEdit(transaction)}
                        >
                          Edit
                        </DropdownMenuItem>
                        {transaction.kind === "expense" && (
                          <DropdownMenuItem
                            onClick={() => setRefundTarget(transaction)}
                            disabled={
                              transaction.refundedAmountMinorUnits >=
                              transaction.amount_minor_units
                            }
                          >
                            Refund
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(transaction)}
                        >
                          {transaction.status === "cancelled"
                            ? "Restore"
                            : "Archive"}
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

      {(transactions.page > 1 || transactions.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={transactions.page <= 1 || isPending}
            onClick={() => goToPage(transactions.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {transactions.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!transactions.hasMore || isPending}
            onClick={() => goToPage(transactions.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="link" size="sm" asChild>
          <Link href="/app/cash-flow/categories">Manage categories</Link>
        </Button>
      </div>

      <TransactionDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <TransactionDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        transaction={editTarget}
        existingSplits={editSplits}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <RefundDialog
        householdId={householdId}
        open={Boolean(refundTarget)}
        onOpenChange={(open) => !open && setRefundTarget(null)}
        transaction={refundTarget}
        alreadyRefundedMinorUnits={refundTarget?.refundedAmountMinorUnits ?? 0}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.status === "cancelled"
            ? "Restore this transaction?"
            : "Archive this transaction?"
        }
        description={
          archiveTarget?.status === "cancelled"
            ? "It will show up in active lists again, with status set to cleared."
            : "It will be marked cancelled and hidden from active lists by default. Its history is preserved, never deleted."
        }
        confirmLabel={
          archiveTarget?.status === "cancelled" ? "Restore" : "Archive"
        }
        destructive={archiveTarget?.status !== "cancelled"}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
