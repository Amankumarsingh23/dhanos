import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { getTodayInTimeZone } from "@/lib/dates";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getReportDefinition } from "@/features/reports/registry";
import {
  ReportFiltersBar,
  type SelectOption,
} from "@/features/reports/report-filters-bar";
import { ReportTable } from "@/features/reports/report-table";
import type { ReportTableData } from "@/features/reports/types";
import type { ReportFilters } from "@/lib/validation/reports";

import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { INVESTMENT_ASSET_CLASS_LABELS } from "@/lib/validation/investments";
import { POLICY_TYPE_LABELS } from "@/lib/validation/insurance";

import {
  getAssetsAndLiabilitiesReport,
  getDebtPositionReport,
  getDebtReductionReport,
  getEmergencyFundCoverageReport,
  getEssentialVsDiscretionaryReport,
  getExpenseByCategoryReport,
  getGoalReadinessReport,
  getIncomeBySourceReport,
  getInsuranceCoverageReport,
  getInvestmentContributionsReport,
  getLendingExposureReport,
  getMonthlyCashFlowReport,
  getNetWorthHistoryReport,
  getPortfolioAllocationReport,
  getPortfolioGrowthReport,
  getSipConsistencyReport,
  getStakingPerformanceReport,
} from "@/features/reports/queries";

import { CashFlowBreakdownChart } from "@/features/dashboard/charts/cash-flow-breakdown-chart";
import { ExpenseCategoryChart } from "@/features/dashboard/charts/expense-category-chart";
import { AllocationChart } from "@/features/investments/charts/allocation-chart";
import { ContributionHistoryChart } from "@/features/investments/charts/contribution-history-chart";
import { PrincipalVsGrowthChart } from "@/features/investments/charts/principal-vs-growth-chart";
import { ActualVsExpectedChart } from "@/features/staking/charts/actual-vs-expected-chart";
import { DebtGroupChart } from "@/features/loans/charts/debt-group-chart";
import { DebtReductionChart } from "@/features/loans/charts/debt-reduction-chart";
import { BorrowerExposureChart } from "@/features/lending/charts/borrower-exposure-chart";
import { NetWorthCurveChart } from "@/features/net-worth/charts/net-worth-curve-chart";

import { IncomeBySourceChart } from "@/features/reports/charts/income-by-source-chart";
import { EssentialVsDiscretionaryChart } from "@/features/reports/charts/essential-vs-discretionary-chart";
import { SipConsistencyChart } from "@/features/reports/charts/sip-consistency-chart";
import { InsuranceCoverageChart } from "@/features/reports/charts/insurance-coverage-chart";
import { AssetsLiabilitiesChart } from "@/features/reports/charts/assets-liabilities-chart";
import { GoalReadinessChart } from "@/features/reports/charts/goal-readiness-chart";
import { EmergencyFundCoverageChart } from "@/features/reports/charts/emergency-fund-coverage-chart";

type ReportPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: ReportPageProps): Promise<Metadata> {
  const { slug } = await params;
  const report = getReportDefinition(slug);
  return {
    title: report ? `${report.label} — Reports — DhanOS` : "Reports — DhanOS",
  };
}

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: ReportPageProps) {
  const { slug } = await params;
  const report = getReportDefinition(slug);
  if (!report) {
    notFound();
  }

  const { household } = await requireHousehold();
  const sp = await searchParams;
  const asOfDate = getTodayInTimeZone(household.timezone);

  const filters: ReportFilters = {
    dateFrom: str(sp.dateFrom),
    dateTo: str(sp.dateTo),
    personId: str(sp.personId),
    accountId: str(sp.accountId),
    institutionId: str(sp.institutionId),
    categoryId: str(sp.categoryId),
    assetClass: str(sp.assetClass),
  };

  const supabase = await createClient();

  const [peoplePage, accountsPage, institutionsPage] = await Promise.all([
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
  ]);
  const people: SelectOption[] = peoplePage.rows.map((person) => ({
    id: person.id,
    label: person.display_name,
  }));
  const accounts: SelectOption[] = accountsPage.rows.map((account) => ({
    id: account.id,
    label: account.name,
  }));
  const institutions: SelectOption[] = institutionsPage.rows.map(
    (institution) => ({ id: institution.id, label: institution.name }),
  );

  let categories: SelectOption[] = [];
  let categoryLabel = "Category";
  if (slug === "expense-by-category") {
    const categoryRows = await listCategories(supabase, household.id, {});
    categories = categoryRows.map((category) => ({
      id: category.id,
      label: category.name,
    }));
  } else if (slug === "insurance-coverage") {
    categoryLabel = "Policy type";
    categories = Object.entries(POLICY_TYPE_LABELS).map(([id, label]) => ({
      id,
      label,
    }));
  }
  const assetClasses: SelectOption[] = Object.entries(
    INVESTMENT_ASSET_CLASS_LABELS,
  ).map(([id, label]) => ({ id, label }));

  let chart: React.ReactNode;
  let table: ReportTableData;

  switch (slug) {
    case "monthly-cash-flow": {
      const data = await getMonthlyCashFlowReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <CashFlowBreakdownChart
          incomeMinorUnits={data.incomeMinorUnits}
          expenseMinorUnits={data.expenseMinorUnits}
          investmentMinorUnits={data.investmentMinorUnits}
          debtPaymentMinorUnits={data.debtPaymentMinorUnits}
          freeCashFlowMinorUnits={data.freeCashFlowMinorUnits}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "income-by-source": {
      const data = await getIncomeBySourceReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <IncomeBySourceChart
          rows={data.rows}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "expense-by-category": {
      const data = await getExpenseByCategoryReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <ExpenseCategoryChart
          rows={data.rows}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "essential-vs-discretionary": {
      const data = await getEssentialVsDiscretionaryReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <EssentialVsDiscretionaryChart
          essentialMinorUnits={data.essentialMinorUnits}
          discretionaryMinorUnits={data.discretionaryMinorUnits}
          unclassifiedMinorUnits={data.unclassifiedMinorUnits}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "investment-contributions": {
      const data = await getInvestmentContributionsReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <ContributionHistoryChart
          data={data.data}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "portfolio-allocation": {
      const data = await getPortfolioAllocationReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <AllocationChart
          title="Portfolio allocation"
          rows={data.rows}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
          emptyDescription="No valued holdings yet."
        />
      );
      break;
    }
    case "portfolio-growth": {
      const data = await getPortfolioGrowthReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <PrincipalVsGrowthChart
          data={data.data}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "sip-consistency": {
      const data = await getSipConsistencyReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <SipConsistencyChart
          rows={data.rows}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "staking-performance": {
      const data = await getStakingPerformanceReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <ActualVsExpectedChart
          data={data.data}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "debt-position": {
      const data = await getDebtPositionReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <DebtGroupChart
          title="Debt by type"
          rows={data.rows}
          currencyCode={data.currencyCode}
          emptyDescription="No active loans yet."
        />
      );
      break;
    }
    case "debt-reduction": {
      const data = await getDebtReductionReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <DebtReductionChart
          data={data.data}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
        />
      );
      break;
    }
    case "insurance-coverage": {
      const data = await getInsuranceCoverageReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <InsuranceCoverageChart
          rows={data.rows}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "assets-and-liabilities": {
      const data = await getAssetsAndLiabilitiesReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <AssetsLiabilitiesChart
          rows={data.rows}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "lending-exposure": {
      const data = await getLendingExposureReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <BorrowerExposureChart rows={data.rows} currencyCode={data.currencyCode} />
      );
      break;
    }
    case "goal-readiness": {
      const data = await getGoalReadinessReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <GoalReadinessChart
          rows={data.rows}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "emergency-fund-coverage": {
      const data = await getEmergencyFundCoverageReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <EmergencyFundCoverageChart
          liquidEmergencyMoneyMinorUnits={data.liquidEmergencyMoneyMinorUnits}
          targetAmountMinorUnits={data.targetAmountMinorUnits}
          monthsOfCoverage={data.monthsOfCoverage}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
          dataCutoffLabel={data.dataCutoffLabel}
        />
      );
      break;
    }
    case "net-worth-history": {
      const data = await getNetWorthHistoryReport(supabase, household, filters, asOfDate);
      table = data;
      chart = (
        <NetWorthCurveChart
          data={data.data}
          currencyCode={data.currencyCode}
          dateRangeLabel={data.dateRangeLabel}
        />
      );
      break;
    }
    default:
      notFound();
  }

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Reports", href: "/app/reports" }, { label: report.label }]}
          />
        }
        title={report.label}
        description={report.question}
      />

      <ReportFiltersBar
        relevantFilters={report.relevantFilters}
        values={filters}
        people={people}
        accounts={accounts}
        institutions={institutions}
        categories={categories}
        categoryLabel={categoryLabel}
        assetClasses={assetClasses}
      />

      {chart}

      <ReportTable
        columns={table.tableColumns}
        rows={table.tableRows}
        csvColumns={table.csvColumns}
        csvRows={table.csvRows}
        exportFilename={`${slug}.csv`}
      />
    </PageShell>
  );
}
