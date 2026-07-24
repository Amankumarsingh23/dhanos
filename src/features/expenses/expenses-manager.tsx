"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  MoreHorizontalIcon,
  PaperclipIcon,
  PlusIcon,
  ReceiptIcon,
  TrendingDownIcon,
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
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney, formatPercentage } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  EXPENSE_VIEW_LABELS,
  expenseViewSchema,
  type ExpenseView,
} from "@/lib/validation/expenses";
import type { Page } from "@/lib/queries/pagination";
import type { MonthOverMonthComparison } from "@/lib/calculations/expense-analysis";
import { RefundDialog } from "@/features/transactions/refund-dialog";
import type { TransactionRow } from "@/features/transactions/queries";
import {
  archiveTransactionAction as archiveExpenseAction,
  getTransactionSplitsAction,
  restoreTransactionAction as restoreExpenseAction,
} from "@/features/transactions/actions";
import {
  ExpenseDialog,
  type AccountOption,
  type CategoryOption,
  type PersonOption,
} from "./expense-dialog";
import type {
  ExpenseByCategoryRow,
  ExpenseByMerchantRow,
  ExpenseByPersonRow,
  ExpenseRow,
  ExpenseSplitRecord,
  ExpenseSummary,
  ExpenseTrendRow,
} from "./queries";

type ExpensesManagerProps = {
  householdId: string;
  expenses: Page<ExpenseRow>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
  summary: {
    currencyCode: string;
    totals: ExpenseSummary;
    monthOverMonth: MonthOverMonthComparison;
    trend: ExpenseTrendRow[];
    byCategory: ExpenseByCategoryRow[];
    byPerson: ExpenseByPersonRow[];
    byMerchant: ExpenseByMerchantRow[];
    largest: ExpenseRow[];
  };
  filters: {
    view: ExpenseView;
    search: string;
    accountId: string;
    categoryId: string;
    relatedPersonId: string;
  };
};

const VIEW_OPTIONS = Object.entries(EXPENSE_VIEW_LABELS) as [
  ExpenseView,
  string,
][];

const BREAKDOWN_VIEWS: readonly ExpenseView[] = [
  "by_category",
  "by_person",
  "by_merchant",
];

function MonthLabel({ monthKey }: { monthKey: string }) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return (
    <>{date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</>
  );
}

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

export function ExpensesManager({
  householdId,
  expenses,
  accounts,
  categories,
  people,
  summary,
  filters,
}: ExpensesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseRow | null>(null);
  const [editSplits, setEditSplits] = useState<ExpenseSplitRecord[]>([]);
  const [archiveTarget, setArchiveTarget] = useState<ExpenseRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<ExpenseRow | null>(null);

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

  async function handleEdit(expense: ExpenseRow) {
    if (expense.splitCount > 0) {
      const result = await getTransactionSplitsAction(householdId, expense.id);
      setEditSplits(result.ok ? (result.data as ExpenseSplitRecord[]) : []);
    } else {
      setEditSplits([]);
    }
    setEditTarget(expense);
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) return;
    const action =
      archiveTarget.status === "cancelled"
        ? restoreExpenseAction
        : archiveExpenseAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.status === "cancelled"
        ? "Expense restored"
        : "Expense archived",
    );
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  const isBreakdownView = BREAKDOWN_VIEWS.includes(filters.view);
  const { totals, monthOverMonth, trend, currencyCode } = summary;
  const maxTrend = Math.max(1, ...trend.map((t) => t.totalMinorUnits));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Essential spend (this month)"
          amount={money(totals.essentialMinorUnits, currencyCode)}
          caption={`${money(totals.discretionaryMinorUnits, currencyCode)} discretionary`}
        />
        <SummaryCard
          title="Unplanned spend (this month)"
          amount={money(totals.unplannedMinorUnits, currencyCode)}
          caption={
            totals.totalMinorUnits > 0
              ? `${formatPercentage(totals.unplannedMinorUnits / totals.totalMinorUnits)} of total`
              : "No expenses yet"
          }
        />
        <SummaryCard
          title="Average daily spend"
          amount={money(totals.averageDailySpendMinorUnits, currencyCode)}
          caption={`${totals.transactionCount} expense${totals.transactionCount === 1 ? "" : "s"} this month`}
        />
        <SummaryCard
          title="Vs last month"
          amount={money(monthOverMonth.currentMonthMinorUnits, currencyCode)}
          caption={
            <span className="inline-flex items-center gap-1">
              {monthOverMonth.changeMinorUnits >= 0 ? (
                <TrendingUpIcon className="size-3.5" />
              ) : (
                <TrendingDownIcon className="size-3.5" />
              )}
              {monthOverMonth.changeRatio !== null
                ? formatPercentage(Math.abs(monthOverMonth.changeRatio))
                : money(
                    Math.abs(monthOverMonth.changeMinorUnits),
                    currencyCode,
                  )}{" "}
              {monthOverMonth.changeMinorUnits >= 0 ? "more" : "less"} than last
              month
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Spending trend (last {trend.length} months)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {trend.map((row) => (
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
                  value={money(row.totalMinorUnits, currencyCode)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Largest expenses (this month)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.largest.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No cleared expenses this month.
              </p>
            ) : (
              summary.largest.slice(0, 6).map((row) => (
                <div key={row.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground w-16 shrink-0">
                    {formatDisplayDate(row.transaction_date, "d MMM")}
                  </span>
                  <span className="flex-1 truncate">
                    {row.counterparty ?? row.categoryName ?? "Expense"}
                  </span>
                  <SensitiveAmount
                    className="w-20 shrink-0 text-right"
                    value={money(
                      row.amount_minor_units - row.refundedAmountMinorUnits,
                      currencyCode,
                    )}
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
            placeholder="Search merchant or notes…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search expenses"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add expense
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="View"
          className="w-auto"
          value={filters.view}
          onChange={(event) => {
            const parsed = expenseViewSchema.safeParse(event.target.value);
            updateParams({ view: parsed.success ? parsed.data : undefined });
          }}
        >
          {VIEW_OPTIONS.map(([value, label]) => (
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
        <NativeSelect
          aria-label="Filter by category"
          className="w-auto"
          value={filters.categoryId}
          onChange={(event) => updateParams({ category: event.target.value })}
        >
          <option value="">All categories</option>
          {categories
            .filter((c) => c.categoryKind === "expense")
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Filter by person"
          className="w-auto"
          value={filters.relatedPersonId}
          onChange={(event) => updateParams({ person: event.target.value })}
        >
          <option value="">All people</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isBreakdownView && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {EXPENSE_VIEW_LABELS[filters.view]} (this month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filters.view === "by_category" && (
              <BreakdownTable
                rows={summary.byCategory.map((row) => ({
                  key: row.categoryId ?? "none",
                  label: row.categoryName,
                  total: row.totalMinorUnits,
                  count: row.transactionCount,
                  href: `${pathname}?view=all${row.categoryId ? `&category=${row.categoryId}` : ""}`,
                }))}
                currencyCode={currencyCode}
              />
            )}
            {filters.view === "by_person" && (
              <BreakdownTable
                rows={summary.byPerson.map((row) => ({
                  key: row.personId ?? "none",
                  label: row.personName,
                  total: row.totalMinorUnits,
                  count: row.transactionCount,
                  href: `${pathname}?view=all${row.personId ? `&person=${row.personId}` : ""}`,
                }))}
                currencyCode={currencyCode}
              />
            )}
            {filters.view === "by_merchant" && (
              <BreakdownTable
                rows={summary.byMerchant.map((row) => ({
                  key: row.merchant,
                  label: row.merchant,
                  total: row.totalMinorUnits,
                  count: row.transactionCount,
                  href: `${pathname}?view=all&search=${encodeURIComponent(row.merchant)}`,
                }))}
                currencyCode={currencyCode}
              />
            )}
          </CardContent>
        </Card>
      )}

      {expenses.rows.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="No expenses yet"
          description="Record what you spend — by account, category, merchant, or person — to see it broken down here."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add expense</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Merchant</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Flags</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {expenses.rows.map((expense) => (
                <tr key={expense.id}>
                  <td className="px-4 py-2.5">
                    {formatDisplayDate(expense.transaction_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    {expense.counterparty ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {expense.description && (
                      <span className="text-muted-foreground block text-xs">
                        {expense.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {expense.splitCount > 0 ? (
                      <Badge variant="secondary">
                        Split ({expense.splitCount})
                      </Badge>
                    ) : (
                      (expense.categoryName ?? (
                        <span className="text-muted-foreground">—</span>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {expense.personName ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      {!expense.is_planned && (
                        <Badge variant="outline">Unplanned</Badge>
                      )}
                      {expense.recurring_rule_id && (
                        <Badge variant="outline">Recurring</Badge>
                      )}
                      {expense.receiptCount > 0 && (
                        <Badge variant="outline">
                          <PaperclipIcon />
                          {expense.receiptCount}
                        </Badge>
                      )}
                      {expense.status === "cancelled" && (
                        <Badge variant="outline">Archived</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        expense.amount_minor_units,
                        expense.currency_code,
                      )}
                    />
                    {expense.refundedAmountMinorUnits > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        Refunded{" "}
                        {money(
                          expense.refundedAmountMinorUnits,
                          expense.currency_code,
                        )}
                      </span>
                    )}
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
                        <DropdownMenuItem onClick={() => handleEdit(expense)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setRefundTarget(expense)}
                          disabled={
                            expense.refundedAmountMinorUnits >=
                            expense.amount_minor_units
                          }
                        >
                          Refund
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(expense)}
                        >
                          {expense.status === "cancelled"
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

      {(expenses.page > 1 || expenses.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={expenses.page <= 1 || isPending}
            onClick={() => goToPage(expenses.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {expenses.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!expenses.hasMore || isPending}
            onClick={() => goToPage(expenses.page + 1)}
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

      <ExpenseDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <ExpenseDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        expense={editTarget}
        existingSplits={editSplits}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.status === "cancelled"
            ? "Restore this expense?"
            : "Archive this expense?"
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
      <RefundDialog
        householdId={householdId}
        open={Boolean(refundTarget)}
        onOpenChange={(open) => !open && setRefundTarget(null)}
        transaction={
          refundTarget
            ? ({ ...refundTarget, transferAccountName: null } as TransactionRow)
            : null
        }
        alreadyRefundedMinorUnits={refundTarget?.refundedAmountMinorUnits ?? 0}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function BreakdownTable({
  rows,
  currencyCode,
}: {
  rows: {
    key: string;
    label: string;
    total: number;
    count: number;
    href: string;
  }[];
  currencyCode: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No cleared expenses this month.
      </p>
    );
  }

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Transactions</th>
            <th className="py-2 pr-4 font-medium">Total</th>
            <th className="py-2 pr-4 font-medium">Share</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2 pr-4">
                <Link href={row.href} className="hover:underline">
                  {row.label}
                </Link>
              </td>
              <td className="py-2 pr-4">{row.count}</td>
              <td className="py-2 pr-4">
                <SensitiveAmount value={money(row.total, currencyCode)} />
              </td>
              <td className="py-2 pr-4">
                {grandTotal > 0
                  ? formatPercentage(row.total / grandTotal)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
