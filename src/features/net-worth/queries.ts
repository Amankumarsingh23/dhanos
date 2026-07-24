import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import {
  computeCompletenessPercentage,
  computeContributionVsValuationChange,
  computeMonthOverMonthChange,
  computeNetWorthTotals,
  computeOtherLiabilitiesBreakdown,
  selectLatestSnapshotPerMonth,
  type LiabilityForNetWorth,
  type MonthOverMonthNetWorthChange,
  type NetWorthTotals,
} from "@/lib/calculations/net-worth";
import { isAccountTypeEligible } from "@/lib/calculations/emergency-fund";
import {
  computeLendingTotals,
  type LendingForTotals,
} from "@/lib/calculations/lending-metrics";
import { listAccounts } from "@/features/accounts/queries";
import { getPortfolioHoldings } from "@/features/investments/queries";
import { listAssets } from "@/features/assets/queries";
import { listLendings } from "@/features/lending/queries";
import { getDebtSummary } from "@/features/loans/queries";
import { listLiabilities } from "@/features/liabilities/queries";
import type { Tables } from "@/types/database";

/**
 * Data access for the net-worth engine (PROMPT 32). Every component is
 * computed by reusing each domain's own already-correct query/calculation
 * rather than re-deriving it — see the migration comment in
 * supabase/migrations/20260723160000_net_worth_breakdown.sql for exactly
 * which function backs which component.
 *
 * Deliberately scoped to "as of now" only: there is no backdated
 * recomputation of a past breakdown. This is what makes "snapshot values
 * are reproducible" straightforward to guarantee (the same live data,
 * computed again right now, always yields the same numbers) without
 * needing every domain module to support point-in-time-in-the-past
 * queries. Recording a snapshot always uses today's date.
 */

export type NetWorthSnapshotRecord = Tables<"net_worth_snapshots">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type NetWorthBreakdown = NetWorthTotals & {
  currencyCode: string;
  asOfDate: string;
  completenessPercentage: number;
  valuationDependentItemCount: number;
  missingValuationCount: number;
  /** General obligations marked 'estimated' — visible here for transparency, but never included in otherLiabilitiesMinorUnits/totalLiabilitiesMinorUnits. */
  estimatedGeneralObligationsExcludedMinorUnits: number;
};

/**
 * The full live net-worth breakdown, computed fresh from real, current
 * data — never read from a stored snapshot. This is what both the
 * dashboard's "current net worth" figures and a newly-recorded snapshot
 * are built from.
 */
export async function getCurrentNetWorthBreakdown(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<NetWorthBreakdown> {
  const asOfDate = toIsoDateString(new Date());

  const [
    accountsPage,
    holdings,
    assetsPage,
    lendingsPage,
    debtSummary,
    liabilitiesPage,
  ] = await Promise.all([
    listAccounts(supabase, householdId, {}, { pageSize: 100 }),
    getPortfolioHoldings(supabase, householdId, asOfDate),
    listAssets(supabase, householdId, {}, { pageSize: 100 }),
    listLendings(supabase, householdId, {}, { pageSize: 100 }),
    getDebtSummary(supabase, householdId, currencyCode),
    listLiabilities(supabase, householdId, {}, { pageSize: 100 }),
  ]);

  // Cash and accounts — eligible account types only (excludes loan/credit,
  // same convention as the emergency fund planner, PROMPT 31).
  const eligibleAccounts = accountsPage.rows.filter(
    (account) =>
      isAccountTypeEligible(account.account_type) &&
      account.currency_code === currencyCode,
  );
  const cashAndAccountsMinorUnits = eligibleAccounts.reduce(
    (sum, account) => sum + account.currentBalance.amountMinorUnits,
    0,
  );

  // Investments — active holdings, latest valuation (null contributes 0,
  // never a guess); completeness tracks how many actually had one.
  const activeHoldings = holdings.filter(
    (holding) => holding.isActive && holding.currencyCode === currencyCode,
  );
  const investmentsMinorUnits = activeHoldings.reduce(
    (sum, holding) => sum + (holding.currentValueMinorUnits ?? 0),
    0,
  );
  const holdingsWithValuationCount = activeHoldings.filter(
    (holding) => holding.hasValuation,
  ).length;

  // Assets — ownership-percentage-adjusted contribution, already computed
  // by listAssets (src/lib/calculations/assets.ts's
  // computeNetWorthContributionMinorUnits: disputed/expected always zero,
  // opted-out assets excluded from the household's own toggle). Split by
  // group: immovable -> property, movable + business -> movable assets.
  // Disputed/expected assets are excluded from the completeness
  // denominator too — their zero contribution is a deliberate fact, not
  // missing data.
  const eligibleAssets = assetsPage.rows.filter(
    (asset) =>
      asset.currency_code === currencyCode && asset.include_in_net_worth,
  );
  const movableAssetsMinorUnits = eligibleAssets
    .filter((asset) => asset.asset_group !== "immovable")
    .reduce((sum, asset) => sum + asset.netWorthContributionMinorUnits, 0);
  const propertyMinorUnits = eligibleAssets
    .filter((asset) => asset.asset_group === "immovable")
    .reduce((sum, asset) => sum + asset.netWorthContributionMinorUnits, 0);

  const assetsCountingTowardCompleteness = eligibleAssets.filter(
    (asset) =>
      asset.ownership_status !== "disputed" &&
      asset.ownership_status !== "expected",
  );
  const assetsWithValuationCount = assetsCountingTowardCompleteness.filter(
    (asset) => asset.latestValueMinorUnits !== null,
  ).length;

  // Receivables — currently-owed lending outstanding (active/
  // partially_repaid/delayed/disputed; written_off excluded), reusing
  // lending-metrics.ts's own totals computation unchanged.
  const lendingRowsForTotals: LendingForTotals[] = lendingsPage.rows.map(
    (lending) => ({
      currencyCode: lending.currency_code,
      status: lending.status,
      borrowerKey:
        lending.borrower_person_id ?? lending.borrower_institution_id ?? "",
      amountLentMinorUnits: lending.amount_lent_minor_units,
      outstandingMinorUnits: lending.outstandingMinorUnits,
      principalRecoveredMinorUnits: lending.totalPrincipalRecoveredMinorUnits,
      interestReceivedMinorUnits: lending.totalInterestReceivedMinorUnits,
    }),
  );
  const receivablesMinorUnits = computeLendingTotals(
    lendingRowsForTotals,
    currencyCode,
  ).totalOutstandingMinorUnits;

  // Loans — institutional debt, active loans only, reusing loans' own
  // getDebtSummary unchanged.
  const loansMinorUnits = debtSummary.totalOutstandingMinorUnits;

  // Other liabilities — informal debt (any certainty) + general
  // obligations with certainty = confirmed only.
  const liabilitiesForNetWorth: LiabilityForNetWorth[] =
    liabilitiesPage.rows.map((liability) => ({
      currencyCode: liability.currency_code,
      status: liability.status,
      liabilitySource: liability.liability_source as
        "informal_borrowing" | "general_obligation",
      certainty: liability.certainty as "confirmed" | "estimated",
      outstandingMinorUnits: liability.outstandingMinorUnits,
    }));
  const otherLiabilities = computeOtherLiabilitiesBreakdown(
    liabilitiesForNetWorth,
    currencyCode,
  );

  const totals = computeNetWorthTotals({
    cashAndAccountsMinorUnits,
    investmentsMinorUnits,
    movableAssetsMinorUnits,
    propertyMinorUnits,
    receivablesMinorUnits,
    loansMinorUnits,
    otherLiabilitiesMinorUnits: otherLiabilities.otherLiabilitiesMinorUnits,
  });

  const valuationDependentItemCount =
    activeHoldings.length + assetsCountingTowardCompleteness.length;
  const itemsWithValuationCount =
    holdingsWithValuationCount + assetsWithValuationCount;

  return {
    ...totals,
    currencyCode,
    asOfDate,
    completenessPercentage: computeCompletenessPercentage(
      valuationDependentItemCount,
      itemsWithValuationCount,
    ),
    valuationDependentItemCount,
    missingValuationCount:
      valuationDependentItemCount - itemsWithValuationCount,
    estimatedGeneralObligationsExcludedMinorUnits:
      otherLiabilities.estimatedGeneralObligationsExcludedMinorUnits,
  };
}

/** Every recorded snapshot for the household in one currency, oldest first — the full history, never paginated away, since charts need the whole series. */
export async function listNetWorthSnapshots(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<NetWorthSnapshotRecord[]> {
  const rows = unwrapList(
    await supabase
      .from("net_worth_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .eq("currency_code", currencyCode)
      .order("as_of_date", { ascending: true }),
  );
  return rows;
}

export type NetWorthCurvePoint = {
  asOfDate: string;
  netWorthMinorUnits: number;
};

export type AssetGrowthPoint = {
  asOfDate: string;
  totalAssetsMinorUnits: number;
  cashAndAccountsMinorUnits: number;
  investmentsMinorUnits: number;
  movableAssetsMinorUnits: number;
  propertyMinorUnits: number;
  receivablesMinorUnits: number;
};

export type DebtReductionPoint = {
  asOfDate: string;
  totalLiabilitiesMinorUnits: number;
  loansMinorUnits: number;
  otherLiabilitiesMinorUnits: number;
};

export type ContributionVsValuationPoint = {
  monthKey: string;
  contributionMinorUnits: number;
  valuationChangeMinorUnits: number;
};

/** Net investment contribution (contribution + purchase − sale − withdrawal) per calendar month — one batched query for every month requested, never one query per month. */
async function fetchMonthlyNetInvestmentContributions(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<Map<string, number>> {
  const rows = unwrapList(
    await supabase
      .from("investment_transactions")
      .select("transaction_type, amount_minor_units, transaction_date, status")
      .eq("household_id", householdId)
      .eq("currency_code", currencyCode)
      .in("status", ["pending", "cleared"]),
  );

  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const sign =
      row.transaction_type === "contribution" ||
      row.transaction_type === "purchase"
        ? 1
        : row.transaction_type === "sale" ||
            row.transaction_type === "withdrawal"
          ? -1
          : 0;
    if (sign === 0) {
      continue;
    }
    const monthKey = row.transaction_date.slice(0, 7);
    byMonth.set(
      monthKey,
      (byMonth.get(monthKey) ?? 0) + sign * row.amount_minor_units,
    );
  }
  return byMonth;
}

export type NetWorthChartsData = {
  currencyCode: string;
  netWorthCurve: NetWorthCurvePoint[];
  assetGrowth: AssetGrowthPoint[];
  debtReduction: DebtReductionPoint[];
  monthOverMonth: MonthOverMonthNetWorthChange[];
  contributionVsValuation: ContributionVsValuationPoint[];
};

/**
 * All five requested charts' data in one combined fetch — every point
 * comes from a real, previously-recorded snapshot (net-worth curve, asset
 * growth, debt reduction) or is derived directly from them plus actual
 * investment transactions (month-over-month, contribution vs valuation).
 * Nothing here is interpolated or projected for a period with no
 * snapshot.
 */
export async function getNetWorthChartsData(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<NetWorthChartsData> {
  const snapshots = await listNetWorthSnapshots(
    supabase,
    householdId,
    currencyCode,
  );

  const netWorthCurve: NetWorthCurvePoint[] = snapshots.map((snapshot) => ({
    asOfDate: snapshot.as_of_date,
    netWorthMinorUnits: snapshot.net_worth_minor_units,
  }));

  const assetGrowth: AssetGrowthPoint[] = snapshots.map((snapshot) => ({
    asOfDate: snapshot.as_of_date,
    totalAssetsMinorUnits: snapshot.total_assets_minor_units,
    cashAndAccountsMinorUnits: snapshot.cash_and_accounts_minor_units,
    investmentsMinorUnits: snapshot.investments_minor_units,
    movableAssetsMinorUnits: snapshot.movable_assets_minor_units,
    propertyMinorUnits: snapshot.property_minor_units,
    receivablesMinorUnits: snapshot.receivables_minor_units,
  }));

  const debtReduction: DebtReductionPoint[] = snapshots.map((snapshot) => ({
    asOfDate: snapshot.as_of_date,
    totalLiabilitiesMinorUnits: snapshot.total_liabilities_minor_units,
    loansMinorUnits: snapshot.loans_minor_units,
    otherLiabilitiesMinorUnits: snapshot.other_liabilities_minor_units,
  }));

  const monthOverMonth = computeMonthOverMonthChange(netWorthCurve);

  const monthlySnapshots = selectLatestSnapshotPerMonth(
    snapshots.map((snapshot) => ({
      asOfDate: snapshot.as_of_date,
      investmentsMinorUnits: snapshot.investments_minor_units,
    })),
  );
  const contributionsByMonth = await fetchMonthlyNetInvestmentContributions(
    supabase,
    householdId,
    currencyCode,
  );
  const contributionVsValuation: ContributionVsValuationPoint[] =
    monthlySnapshots.map((snapshot, index) => {
      const monthKey = snapshot.asOfDate.slice(0, 7);
      const previous = index > 0 ? monthlySnapshots[index - 1] : undefined;
      const change = computeContributionVsValuationChange(
        previous?.investmentsMinorUnits ?? snapshot.investmentsMinorUnits,
        snapshot.investmentsMinorUnits,
        contributionsByMonth.get(monthKey) ?? 0,
      );
      return {
        monthKey,
        contributionMinorUnits: change.contributionMinorUnits,
        valuationChangeMinorUnits: change.valuationChangeMinorUnits,
      };
    });

  return {
    currencyCode,
    netWorthCurve,
    assetGrowth,
    debtReduction,
    monthOverMonth,
    contributionVsValuation,
  };
}
