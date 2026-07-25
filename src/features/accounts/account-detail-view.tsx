"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SummaryCard } from "@/components/shared/summary-card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { StaleDataIndicator } from "@/components/shared/stale-data-indicator";
import {
  DataSourceBadge,
  type DataSource,
} from "@/components/shared/data-source-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from "@/lib/validation/accounts";
import { closeAccountAction, reopenAccountAction } from "./actions";
import { AccountDialog, type SelectOption } from "./account-dialog";
import { BalanceCorrectionDialog } from "./balance-correction-dialog";
import type { AccountDetail } from "./queries";

const ACCOUNT_STALE_AFTER_HOURS = 45 * 24;

const SNAPSHOT_SOURCE_TO_DATA_SOURCE: Record<string, DataSource> = {
  manual: "manual",
  reconciliation: "verified",
  system_calculated: "manual",
};

const TRANSACTION_KIND_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  investment_contribution: "Investment contribution",
  investment_withdrawal: "Investment withdrawal",
  loan_disbursement: "Loan disbursement",
  loan_payment: "Loan payment",
  lending_disbursement: "Lending disbursement",
  lending_repayment: "Lending repayment",
  refund: "Refund",
  adjustment: "Adjustment",
};

type AccountDetailViewProps = {
  householdId: string;
  account: AccountDetail;
  institutions: SelectOption[];
  people: SelectOption[];
};

export function AccountDetailView({
  householdId,
  account,
  institutions,
  people,
}: AccountDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  async function handleCloseConfirm() {
    const result = account.is_active
      ? await closeAccountAction(
          householdId,
          account.id,
          toIsoDateString(new Date()),
        )
      : await reopenAccountAction(householdId, account.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(account.is_active ? "Account closed" : "Account reopened");
    router.refresh();
  }

  const freshnessAnchor =
    account.lastBalanceConfirmationDate ??
    account.lastTransactionDate ??
    account.created_at;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {ACCOUNT_TYPE_LABELS[account.account_type as AccountType]}
            </Badge>
            <Badge variant={account.is_active ? "secondary" : "outline"}>
              {account.is_active ? "Active" : "Closed"}
            </Badge>
            {!account.include_in_net_worth && (
              <Badge variant="outline">Excluded from net worth</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {[
              account.institutionName,
              account.ownerName,
              account.masked_identifier,
            ]
              .filter(Boolean)
              .join(" · ") || "No institution, owner, or masked identifier set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setCorrectOpen(true)}>
            Correct balance
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button
            variant={account.is_active ? "destructive" : "default"}
            onClick={() => setCloseConfirmOpen(true)}
          >
            {account.is_active ? "Close account" : "Reopen account"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Current balance"
          amount={formatMoney(account.currentBalance)}
          caption={
            <span className="flex items-center gap-2">
              {account.balanceBaseline.kind === "snapshot"
                ? `Confirmed ${formatDisplayDate(account.balanceBaseline.asOfDate)}, plus later transactions`
                : "From opening balance, plus all transactions"}
              <StaleDataIndicator
                asOf={freshnessAnchor}
                staleAfterHours={ACCOUNT_STALE_AFTER_HOURS}
              />
            </span>
          }
        />
        <SummaryCard
          title="This month's inflow"
          amount={formatMoney(account.monthlyInflow)}
          caption="Income only — transfers excluded"
        />
        <SummaryCard
          title="This month's outflow"
          amount={formatMoney(account.monthlyOutflow)}
          caption="Expenses only — transfers excluded"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {account.recentTransactions.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              title="No transactions yet"
              description="Transactions affecting this account will show up here."
            />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Kind</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {account.recentTransactions.map((transaction) => {
                    const isOutgoingTransfer =
                      transaction.kind === "transfer" &&
                      transaction.account_id === account.id;
                    const isIncomingTransfer =
                      transaction.kind === "transfer" &&
                      transaction.transfer_account_id === account.id;
                    // A cross-currency transfer's destination amount is in
                    // *this* account's currency, not transaction.currency_code
                    // (which is always the source side's currency) — this
                    // account is the destination whenever isIncomingTransfer.
                    const displayAmount = isIncomingTransfer
                      ? (transaction.transfer_destination_amount_minor_units ??
                        transaction.amount_minor_units)
                      : transaction.amount_minor_units;
                    const displayCurrencyCode = isIncomingTransfer
                      ? account.currency_code
                      : transaction.currency_code;
                    return (
                      <tr key={transaction.id}>
                        <td className="py-2 pr-4">
                          {formatDisplayDate(transaction.transaction_date)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">
                            {TRANSACTION_KIND_LABELS[transaction.kind] ??
                              transaction.kind}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4">
                          {transaction.description ??
                            transaction.counterparty ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          {isOutgoingTransfer &&
                            transaction.transfer_fee_minor_units && (
                              <span className="text-muted-foreground block text-xs">
                                Fee{" "}
                                {formatMoney({
                                  amountMinorUnits:
                                    transaction.transfer_fee_minor_units,
                                  currencyCode: transaction.currency_code,
                                })}
                              </span>
                            )}
                          {transaction.exchange_rate && (
                            <span className="text-muted-foreground block text-xs">
                              Rate {transaction.exchange_rate}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <SensitiveAmount
                            value={`${isOutgoingTransfer ? "-" : ""}${formatMoney(
                              {
                                amountMinorUnits: displayAmount,
                                currencyCode: displayCurrencyCode,
                              },
                            )}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance history</CardTitle>
        </CardHeader>
        <CardContent>
          {account.balanceHistory.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              title="No confirmed balances yet"
              description="Use “Correct balance” to record the first confirmed snapshot."
            />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">As of</th>
                    <th className="py-2 pr-4 font-medium">Confirmed</th>
                    <th className="py-2 pr-4 font-medium">Calculated</th>
                    <th className="py-2 pr-4 font-medium">Difference</th>
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {account.balanceHistory.map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td className="py-2 pr-4">
                        {formatDisplayDate(snapshot.as_of_date)}
                      </td>
                      <td className="py-2 pr-4">
                        <SensitiveAmount
                          value={formatMoney({
                            amountMinorUnits: snapshot.balance_minor_units,
                            currencyCode: snapshot.currency_code,
                          })}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        {snapshot.calculated_balance_minor_units !== null ? (
                          <SensitiveAmount
                            value={formatMoney({
                              amountMinorUnits:
                                snapshot.calculated_balance_minor_units,
                              currencyCode: snapshot.currency_code,
                            })}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {snapshot.difference_minor_units !== null ? (
                          <span
                            className={
                              snapshot.difference_minor_units === 0
                                ? "text-muted-foreground"
                                : "text-foreground font-medium"
                            }
                          >
                            <SensitiveAmount
                              value={`${snapshot.difference_minor_units > 0 ? "+" : ""}${formatMoney(
                                {
                                  amountMinorUnits:
                                    snapshot.difference_minor_units,
                                  currencyCode: snapshot.currency_code,
                                },
                              )}`}
                            />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <DataSourceBadge
                          source={
                            SNAPSHOT_SOURCE_TO_DATA_SOURCE[snapshot.source] ??
                            "manual"
                          }
                        />
                      </td>
                      <td className="py-2 pr-4">
                        {snapshot.notes ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {account.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {account.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <AccountDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        account={account}
        institutions={institutions}
        people={people}
        onSaved={() => router.refresh()}
      />
      <BalanceCorrectionDialog
        householdId={householdId}
        open={correctOpen}
        onOpenChange={setCorrectOpen}
        account={account}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={
          account.is_active ? "Close this account?" : "Reopen this account?"
        }
        description={
          account.is_active
            ? `${account.name} will be marked closed as of today. Its transaction and balance history is preserved.`
            : `${account.name} will show up in active lists again.`
        }
        confirmLabel={account.is_active ? "Close" : "Reopen"}
        destructive={account.is_active}
        onConfirm={handleCloseConfirm}
      />
    </div>
  );
}
