"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LandmarkIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
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
import { StaleDataIndicator } from "@/components/shared/stale-data-indicator";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from "@/lib/validation/accounts";
import type { Page } from "@/lib/queries/pagination";
import { closeAccountAction, reopenAccountAction } from "./actions";
import { AccountDialog, type SelectOption } from "./account-dialog";
import { BalanceCorrectionDialog } from "./balance-correction-dialog";
import type { AccountRow } from "./queries";

// Balances are typically reconciled against a monthly statement, not daily
// — 45 days without a transaction or confirmation is a more useful signal
// for this domain than StaleDataIndicator's 24-hour default.
const ACCOUNT_STALE_AFTER_HOURS = 45 * 24;

type AccountsManagerProps = {
  householdId: string;
  accounts: Page<AccountRow>;
  institutions: SelectOption[];
  people: SelectOption[];
  filters: {
    search: string;
    accountType: AccountType | "";
    includeClosed: boolean;
  };
};

const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS) as [
  AccountType,
  string,
][];

export function AccountsManager({
  householdId,
  accounts,
  institutions,
  people,
  filters,
}: AccountsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AccountRow | null>(null);
  const [closeTarget, setCloseTarget] = useState<AccountRow | null>(null);
  const [correctTarget, setCorrectTarget] = useState<AccountRow | null>(null);

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

  async function handleCloseConfirm() {
    if (!closeTarget) {
      return;
    }
    const result = closeTarget.is_active
      ? await closeAccountAction(
          householdId,
          closeTarget.id,
          toIsoDateString(new Date()),
        )
      : await reopenAccountAction(householdId, closeTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      closeTarget.is_active ? "Account closed" : "Account reopened",
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
            placeholder="Search by name…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search accounts"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by account type"
            className="w-auto"
            value={filters.accountType}
            onChange={(event) => updateParams({ type: event.target.value })}
          >
            <option value="">All types</option>
            {ACCOUNT_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.includeClosed}
              onChange={(event) =>
                updateParams({
                  closed: event.target.checked ? "true" : undefined,
                })
              }
              className="border-input size-4 rounded"
            />
            Show closed
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add account
          </Button>
        </div>
      </div>

      {accounts.rows.length === 0 ? (
        <EmptyState
          icon={LandmarkIcon}
          title="No accounts yet"
          description="Add a bank account, wallet, deposit, or other holding — its balance is calculated from its opening balance and the transaction ledger, never entered directly."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add account</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Institution</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Balance</th>
                <th className="px-4 py-2.5 font-medium">Last transaction</th>
                <th className="px-4 py-2.5 font-medium">Freshness</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {accounts.rows.map((account) => {
                const freshnessAnchor =
                  account.lastBalanceConfirmationDate ??
                  account.lastTransactionDate ??
                  account.created_at;
                return (
                  <tr key={account.id}>
                    <td className="px-4 py-2.5 font-medium">
                      <Link
                        href={`/app/accounts/${account.id}`}
                        className="hover:underline"
                      >
                        {account.name}
                      </Link>
                      {account.masked_identifier ? (
                        <span className="text-muted-foreground block text-xs font-normal">
                          {account.masked_identifier}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {account.institutionName ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {account.ownerName ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">
                        {
                          ACCOUNT_TYPE_LABELS[
                            account.account_type as AccountType
                          ]
                        }
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <SensitiveAmount
                        value={formatMoney(account.currentBalance)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {account.lastTransactionDate ? (
                        formatDisplayDate(account.lastTransactionDate)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StaleDataIndicator
                        asOf={freshnessAnchor}
                        staleAfterHours={ACCOUNT_STALE_AFTER_HOURS}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={account.is_active ? "secondary" : "outline"}
                      >
                        {account.is_active ? "Active" : "Closed"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontalIcon />
                            <span className="sr-only">
                              Actions for {account.name}
                            </span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/app/accounts/${account.id}`}>
                              View details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setEditTarget(account)}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setCorrectTarget(account)}
                          >
                            Correct balance
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setCloseTarget(account)}
                          >
                            {account.is_active ? "Close" : "Reopen"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(accounts.page > 1 || accounts.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={accounts.page <= 1 || isPending}
            onClick={() => goToPage(accounts.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {accounts.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!accounts.hasMore || isPending}
            onClick={() => goToPage(accounts.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <AccountDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutions={institutions}
        people={people}
        onSaved={() => router.refresh()}
      />
      <AccountDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        account={editTarget}
        institutions={institutions}
        people={people}
        onSaved={() => router.refresh()}
      />
      <BalanceCorrectionDialog
        householdId={householdId}
        open={Boolean(correctTarget)}
        onOpenChange={(open) => !open && setCorrectTarget(null)}
        account={correctTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(closeTarget)}
        onOpenChange={(open) => !open && setCloseTarget(null)}
        title={
          closeTarget?.is_active
            ? "Close this account?"
            : "Reopen this account?"
        }
        description={
          closeTarget?.is_active
            ? `${closeTarget?.name} will be marked closed as of today. Its transaction and balance history is preserved.`
            : `${closeTarget?.name} will show up in active lists again.`
        }
        confirmLabel={closeTarget?.is_active ? "Close" : "Reopen"}
        destructive={Boolean(closeTarget?.is_active)}
        onConfirm={handleCloseConfirm}
      />
    </div>
  );
}
