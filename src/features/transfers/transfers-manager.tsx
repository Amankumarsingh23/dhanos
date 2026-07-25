"use client";

import { useState, useTransition } from "react";
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
  TRANSACTION_STATUS_LABELS,
  type TransactionStatus,
} from "@/lib/validation/transactions";
import type { Page } from "@/lib/queries/pagination";
import {
  archiveTransactionAction,
  restoreTransactionAction,
} from "@/features/transactions/actions";
import { reverseTransferAction } from "./actions";
import { TransferDialog, type AccountOption } from "./transfer-dialog";
import type { TransferRow } from "./queries";

type TransfersManagerProps = {
  householdId: string;
  transfers: Page<TransferRow>;
  accounts: AccountOption[];
  filters: {
    search: string;
    accountId: string;
    status: TransactionStatus | "";
  };
};

const STATUS_OPTIONS = Object.entries(TRANSACTION_STATUS_LABELS) as [
  TransactionStatus,
  string,
][];

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

export function TransfersManager({
  householdId,
  transfers,
  accounts,
  filters,
}: TransfersManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TransferRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<TransferRow | null>(null);
  const [reverseTarget, setReverseTarget] = useState<TransferRow | null>(null);

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

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
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
        ? "Transfer restored"
        : "Transfer archived",
    );
    router.refresh();
  }

  async function handleReverseConfirm() {
    if (!reverseTarget) return;
    const result = await reverseTransferAction(householdId, {
      transactionId: reverseTarget.id,
      transactionDate: new Date().toISOString().slice(0, 10),
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Transfer reversed");
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
            placeholder="Search notes…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search transfers"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add transfer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <NativeSelect
          aria-label="Filter by status"
          className="w-auto"
          value={filters.status}
          onChange={(event) => updateParams({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(([value]) => value !== "cancelled").map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ),
          )}
        </NativeSelect>
      </div>

      {transfers.rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title="No transfers yet"
          description="Move money between two of your own accounts — never counted as income or expense."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add transfer</Button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">From → To</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Fee</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {transfers.rows.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="px-4 py-2.5">
                    {formatDisplayDate(transfer.transaction_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    {transfer.accountName} → {transfer.transferAccountName}
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        transfer.amount_minor_units,
                        transfer.currency_code,
                      )}
                    />
                    {transfer.transfer_destination_amount_minor_units && (
                      <span className="text-muted-foreground block text-xs">
                        Rate {transfer.exchange_rate}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {transfer.transfer_fee_minor_units ? (
                      money(
                        transfer.transfer_fee_minor_units,
                        transfer.currency_code,
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        transfer.status === "cancelled"
                          ? "outline"
                          : transfer.status === "cleared" ||
                              transfer.status === "reconciled"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {
                        TRANSACTION_STATUS_LABELS[
                          transfer.status as TransactionStatus
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {transfer.isReversal && (
                        <Badge variant="outline">Reversal</Badge>
                      )}
                      {transfer.isReversed && (
                        <Badge variant="outline">Reversed</Badge>
                      )}
                    </div>
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
                          onClick={() => setEditTarget(transfer)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setReverseTarget(transfer)}
                          disabled={
                            transfer.isReversed ||
                            transfer.transfer_destination_amount_minor_units !==
                              null
                          }
                        >
                          Reverse
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(transfer)}
                        >
                          {transfer.status === "cancelled"
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

      {(transfers.page > 1 || transfers.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={transfers.page <= 1 || isPending}
            onClick={() => goToPage(transfers.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {transfers.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!transfers.hasMore || isPending}
            onClick={() => goToPage(transfers.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <TransferDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <TransferDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        transfer={editTarget}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.status === "cancelled"
            ? "Restore this transfer?"
            : "Archive this transfer?"
        }
        description={
          archiveTarget?.status === "cancelled"
            ? "It will show up in active lists again, with status set to cleared. Both accounts' balances are affected together, since a transfer is one row read from both sides."
            : "It will be marked cancelled and hidden from active lists by default — removing its effect from both accounts at once. Its history is preserved, never deleted."
        }
        confirmLabel={
          archiveTarget?.status === "cancelled" ? "Restore" : "Archive"
        }
        destructive={archiveTarget?.status !== "cancelled"}
        onConfirm={handleArchiveConfirm}
      />
      <ConfirmDialog
        open={Boolean(reverseTarget)}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        title="Reverse this transfer?"
        description="Creates a new transfer moving the same amount back from the destination to the source account, linked to this one — never an edit of the original."
        confirmLabel="Reverse"
        onConfirm={handleReverseConfirm}
      />
    </div>
  );
}
