import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createMoney,
  formatMoney,
  formatPercentage,
  subtractMoney,
} from "@/lib/money";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FinancialPrivacyNotice } from "@/components/shared/financial-privacy-notice";
import { SummaryCard } from "@/components/shared/summary-card";
import { ConcealDashboardOnLaunch } from "@/features/dashboard/conceal-on-launch";
import {
  getAccountBalanceTrend,
  getAvailableBalance,
  getCashFlowSummary,
  getCashFlowTrend,
} from "@/features/dashboard/queries";
import { getExpenseByCategory } from "@/features/expenses/queries";
import { IncomeExpenseTrendChart } from "@/features/dashboard/charts/income-expense-trend-chart";
import { ExpenseCategoryChart } from "@/features/dashboard/charts/expense-category-chart";
import { CashFlowBreakdownChart } from "@/features/dashboard/charts/cash-flow-breakdown-chart";
import { AccountBalanceTrendChart } from "@/features/dashboard/charts/account-balance-trend-chart";
import { SavingsTrendChart } from "@/features/dashboard/charts/savings-trend-chart";
import { formatMonthLabel } from "@/features/dashboard/charts/chart-format";

// Static title only — never put amounts (or anything derived from them)
// into metadata/browser titles. See docs/security-model.md.
export const metadata: Metadata = {
  title: "Dashboard — DhanOS",
};

const TREND_MONTHS = 6;

export default async function DashboardPage() {
  const { household } = await requireHousehold();
  const currencyCode = household.base_currency_code;
  // Personal display preference (Settings — PROMPT 40): affects only how
  // an amount is formatted (grouping, symbol placement) here on the
  // dashboard, never which currency code or stored minor-units value is
  // used — see docs/money-calculation-rules.md §1.
  const profile = await getCurrentProfile();
  const locale = profile?.locale;

  const now = new Date();
  const monthStart = toIsoDateString(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );
  const today = toIsoDateString(now);

  const supabase = await createClient();
  const [
    netWorthResult,
    availableBalance,
    cashFlowSummary,
    cashFlowTrend,
    accountBalanceTrend,
    expenseByCategory,
  ] = await Promise.all([
    supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", household.id)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getAvailableBalance(supabase, household.id, currencyCode),
    getCashFlowSummary(supabase, household.id, monthStart, today, currencyCode),
    getCashFlowTrend(supabase, household.id, TREND_MONTHS, today),
    getAccountBalanceTrend(
      supabase,
      household.id,
      currencyCode,
      TREND_MONTHS,
      today,
    ),
    getExpenseByCategory(supabase, household.id, monthStart, today),
  ]);

  const snapshot = netWorthResult.data;
  const zero = formatMoney(createMoney(0, currencyCode), locale);

  const netWorth = snapshot
    ? formatMoney(
        subtractMoney(
          createMoney(
            snapshot.total_assets_minor_units,
            snapshot.currency_code,
          ),
          createMoney(
            snapshot.total_liabilities_minor_units,
            snapshot.currency_code,
          ),
        ),
        locale,
      )
    : zero;
  const snapshotCaption = snapshot
    ? `As of ${formatDisplayDate(snapshot.as_of_date)}`
    : "No net-worth snapshot recorded yet";

  // The insurance-premium card links to the expense list filtered to
  // "Insurance" when the household has exactly one protection-classified
  // category (the common case — the seeded default taxonomy has one) —
  // otherwise it links to the unfiltered this-month expense view rather
  // than guessing which category the user meant.
  const protectionCategories = expenseByCategory.filter(
    (row) => row.classification === "protection",
  );
  const insuranceHref =
    protectionCategories.length === 1 && protectionCategories[0]?.categoryId
      ? `/app/expenses?view=this_month&category=${protectionCategories[0].categoryId}`
      : "/app/expenses?view=this_month";

  const monthRangeLabel = `${formatDisplayDate(monthStart, "d MMM")} – ${formatDisplayDate(today, "d MMM yyyy")}`;
  const dataCutoffLabel = `Data as of ${formatDisplayDate(now, "d MMM yyyy, HH:mm")}`;
  const trendRangeLabel = `${formatMonthLabel(cashFlowTrend[0]?.monthKey ?? monthStart.slice(0, 7))} – ${formatMonthLabel(cashFlowTrend[cashFlowTrend.length - 1]?.monthKey ?? today.slice(0, 7))}`;

  const cashFlowQuery = `dateFrom=${monthStart}&dateTo=${today}&status=cleared`;

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Dashboard" }]} />}
        title="Dashboard"
        description={`Cash flow for ${household.name}, month to date (${monthRangeLabel}).`}
      />
      <div className="space-y-6">
        <ConcealDashboardOnLaunch
          enabled={profile?.privacy_conceal_dashboard_on_launch ?? false}
        />
        <FinancialPrivacyNotice />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            title="Available account balance"
            amount={formatMoney(availableBalance.total, locale)}
            caption={
              availableBalance.excludedAccountCount > 0
                ? `${availableBalance.accountCount} open ${currencyCode} account${availableBalance.accountCount === 1 ? "" : "s"} · ${availableBalance.excludedAccountCount} other-currency account${availableBalance.excludedAccountCount === 1 ? "" : "s"} excluded`
                : `${availableBalance.accountCount} open account${availableBalance.accountCount === 1 ? "" : "s"}`
            }
            href="/app/accounts"
          />
          <SummaryCard
            title="Net worth"
            amount={netWorth}
            caption={snapshotCaption}
          />
          <SummaryCard
            title="Income this month"
            amount={formatMoney(cashFlowSummary.income, locale)}
            caption="Cleared income, month to date"
            href={`/app/cash-flow?kind=income&${cashFlowQuery}`}
          />
          <SummaryCard
            title="Expenses this month"
            amount={formatMoney(cashFlowSummary.expense, locale)}
            caption="Cleared expenses, net of refunds"
            href="/app/expenses?view=this_month"
          />
          <SummaryCard
            title="Investments this month"
            amount={formatMoney(cashFlowSummary.investment, locale)}
            caption="Investment contributions, month to date"
            href={`/app/cash-flow?kind=investment_contribution&${cashFlowQuery}`}
          />
          <SummaryCard
            title="Debt payments this month"
            amount={formatMoney(cashFlowSummary.debtPayment, locale)}
            caption="Loan payments, principal + interest"
            href={`/app/cash-flow?kind=loan_payment&${cashFlowQuery}`}
          />
          <SummaryCard
            title="Insurance premiums this month"
            amount={formatMoney(cashFlowSummary.insurancePremium, locale)}
            caption="Included in Expenses above, shown separately"
            href={insuranceHref}
          />
          <SummaryCard
            title="Free cash flow"
            amount={formatMoney(cashFlowSummary.freeCashFlow, locale)}
            caption="Income − expenses − debt payments"
            href={`/app/cash-flow?${cashFlowQuery}`}
          />
          <SummaryCard
            title="Savings rate"
            amount={formatPercentage(cashFlowSummary.savingsRate)}
            caption="Free cash flow ÷ income"
            href={`/app/cash-flow?${cashFlowQuery}`}
          />
          <SummaryCard
            title="Investment rate"
            amount={formatPercentage(cashFlowSummary.investmentRate)}
            caption="Investments ÷ income"
            href={`/app/cash-flow?kind=investment_contribution&${cashFlowQuery}`}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <IncomeExpenseTrendChart
            data={cashFlowTrend}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <ExpenseCategoryChart
            rows={expenseByCategory}
            currencyCode={currencyCode}
            dateRangeLabel={monthRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <CashFlowBreakdownChart
            incomeMinorUnits={cashFlowSummary.income.amountMinorUnits}
            expenseMinorUnits={cashFlowSummary.expense.amountMinorUnits}
            investmentMinorUnits={cashFlowSummary.investment.amountMinorUnits}
            debtPaymentMinorUnits={cashFlowSummary.debtPayment.amountMinorUnits}
            freeCashFlowMinorUnits={
              cashFlowSummary.freeCashFlow.amountMinorUnits
            }
            currencyCode={currencyCode}
            dateRangeLabel={monthRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <AccountBalanceTrendChart
            data={accountBalanceTrend}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
          <SavingsTrendChart
            data={cashFlowTrend}
            currencyCode={currencyCode}
            dateRangeLabel={trendRangeLabel}
            dataCutoffLabel={dataCutoffLabel}
          />
        </div>
      </div>
    </PageShell>
  );
}
