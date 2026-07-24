import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import {
  classifyAccountLiquidity,
  computeEmergencyFundResult,
  defaultIncludesForLiquidity,
  isAccountTypeEligible,
  type AccountLiquidity,
  type EmergencyFundResult,
} from "@/lib/calculations/emergency-fund";
import {
  classifyLiquidity,
  type LiquidityClassification,
} from "@/lib/calculations/portfolio-performance";
import { listAccounts } from "@/features/accounts/queries";
import { getPortfolioHoldings } from "@/features/investments/queries";
import { getExpenseSummary } from "@/features/expenses/queries";
import { getInsuranceOverview } from "@/features/insurance/queries";
import type { Tables } from "@/types/database";

/**
 * Data access for the emergency fund planner (PROMPT 31). Deliberately
 * reuses each domain's own already-computed truth rather than re-deriving
 * it: essential expenses via src/features/expenses/queries.ts's
 * getExpenseSummary, account balances via listAccounts, investment values
 * via getPortfolioHoldings, and insurance premiums via
 * getInsuranceOverview. This feature never reads `assets` or `lendings` at
 * all — see src/lib/calculations/emergency-fund.ts's module comment for
 * why that alone satisfies most of PROMPT 31's "do not count" list.
 */

export type EmergencyFundPlanRecord = Tables<"emergency_fund_plans">;
export type EmergencyFundSourceOverrideRecord =
  Tables<"emergency_fund_source_overrides">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Trailing window for "average essential monthly expenses" — matches the debt dashboard's own trailing-3-months-income convention (src/features/loans/debt-dashboard-queries.ts), so the two "smoothed monthly figure" conventions in this app never drift apart. */
const ESSENTIAL_EXPENSE_TRAILING_MONTHS = 3;

export type EmergencyFundSourceRow = {
  /** The override row's id, if the household has explicitly set one — null means the structural default applies. */
  overrideId: string | null;
  sourceType: "account" | "investment_holding";
  sourceId: string;
  sourceName: string;
  currentValueMinorUnits: number | null;
  currencyCode: string;
  liquidity: AccountLiquidity | LiquidityClassification;
  liquidityReason: string;
  /** What classifyAccountLiquidity/classifyLiquidity says by default — always shown, never hidden, even when overridden. */
  defaultIncluded: boolean;
  /** defaultIncluded unless an override row exists, in which case the override wins. */
  isIncluded: boolean;
};

async function fetchOverridesByPlan(
  supabase: SupabaseServerClient,
  householdId: string,
  planId: string,
): Promise<Map<string, EmergencyFundSourceOverrideRecord>> {
  const rows = unwrapList(
    await supabase
      .from("emergency_fund_source_overrides")
      .select("*")
      .eq("household_id", householdId)
      .eq("emergency_fund_plan_id", planId),
  );
  const byKey = new Map<string, EmergencyFundSourceOverrideRecord>();
  for (const row of rows) {
    const key = `${row.source_type}:${row.account_id ?? row.investment_holding_id}`;
    byKey.set(key, row);
  }
  return byKey;
}

const ACCOUNT_LIQUIDITY_REASON: Record<AccountLiquidity, string> = {
  liquid: "Spendable immediately, no penalty or notice period.",
  semi_liquid:
    "Accessible, but may take time, incur a penalty, or involve selling something first.",
  illiquid:
    "Locked or heavily penalized to access early — excluded by default.",
};

const INVESTMENT_LIQUIDITY_REASON: Record<LiquidityClassification, string> = {
  liquid: "Can typically be sold and settled within a few days.",
  semi_liquid:
    "Can be accessed, but selling may take time or affect its value.",
  illiquid:
    "Locked, hard to sell quickly, or a long-term holding — excluded by default.",
};

/** Every qualifying financial_accounts/investment_holdings row for the household, each with its default classification and current household override, if any. */
export async function listEmergencyFundSources(
  supabase: SupabaseServerClient,
  householdId: string,
  planId: string,
): Promise<EmergencyFundSourceRow[]> {
  const [accountsPage, holdings, overrides] = await Promise.all([
    listAccounts(supabase, householdId, {}, { pageSize: 100 }),
    getPortfolioHoldings(supabase, householdId),
    fetchOverridesByPlan(supabase, householdId, planId),
  ]);

  const accountRows: EmergencyFundSourceRow[] = accountsPage.rows
    .filter((account) => isAccountTypeEligible(account.account_type))
    .map((account) => {
      const liquidity = classifyAccountLiquidity(account.account_type);
      const defaultIncluded = defaultIncludesForLiquidity(liquidity);
      const override = overrides.get(`account:${account.id}`);
      return {
        overrideId: override?.id ?? null,
        sourceType: "account" as const,
        sourceId: account.id,
        sourceName: account.name,
        currentValueMinorUnits: account.currentBalance.amountMinorUnits,
        currencyCode: account.currency_code,
        liquidity,
        liquidityReason: ACCOUNT_LIQUIDITY_REASON[liquidity],
        defaultIncluded,
        isIncluded: override ? override.is_included : defaultIncluded,
      };
    });

  const holdingRows: EmergencyFundSourceRow[] = holdings.map((holding) => {
    const liquidity = classifyLiquidity(holding.assetClass);
    const defaultIncluded = liquidity === "liquid";
    const override = overrides.get(
      `investment_holding:${holding.investmentHoldingId}`,
    );
    return {
      overrideId: override?.id ?? null,
      sourceType: "investment_holding" as const,
      sourceId: holding.investmentHoldingId,
      sourceName: `${holding.assetName} (${holding.platformName})`,
      currentValueMinorUnits: holding.currentValueMinorUnits,
      currencyCode: holding.currencyCode,
      liquidity,
      liquidityReason: INVESTMENT_LIQUIDITY_REASON[liquidity],
      defaultIncluded,
      isIncluded: override ? override.is_included : defaultIncluded,
    };
  });

  return [...accountRows, ...holdingRows];
}

export type EmergencyFundPlanDetail = {
  plan: EmergencyFundPlanRecord | null;
  currencyCode: string;
  sources: EmergencyFundSourceRow[];
  averageEssentialMonthlyExpensesMinorUnits: number;
  monthlyEmiMinorUnits: number;
  monthlyInsuranceCommitmentsMinorUnits: number;
  /** Sources excluded from liquidEmergencyMoney due to a currency mismatch with the household's base currency — never blended, always counted. */
  excludedCurrencyMismatchCount: number;
  result: EmergencyFundResult | null;
};

/**
 * The full planner picture for a household. Returns `plan: null` (and no
 * result) when the household hasn't set one up yet — the caller renders a
 * simple "create your plan" form in that case rather than a zeroed-out
 * dashboard.
 */
export async function getEmergencyFundPlanDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<EmergencyFundPlanDetail> {
  const planResponse = await supabase
    .from("emergency_fund_plans")
    .select("*")
    .eq("household_id", householdId)
    .maybeSingle();
  const plan = planResponse.data as EmergencyFundPlanRecord | null;

  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(
      asOf.getUTCFullYear(),
      asOf.getUTCMonth() - (ESSENTIAL_EXPENSE_TRAILING_MONTHS - 1),
      1,
    ),
  );

  const [expenseSummary, loansResponse, insuranceOverview, sources] =
    await Promise.all([
      getExpenseSummary(
        supabase,
        householdId,
        toIsoDateString(rangeStart),
        asOfDate,
      ),
      supabase
        .from("loans")
        .select("emi_amount_minor_units, currency_code, status")
        .eq("household_id", householdId)
        .eq("status", "active"),
      getInsuranceOverview(supabase, householdId, currencyCode, asOfDate),
      plan
        ? listEmergencyFundSources(supabase, householdId, plan.id)
        : Promise.resolve([] as EmergencyFundSourceRow[]),
    ]);

  const averageEssentialMonthlyExpensesMinorUnits = Math.round(
    expenseSummary.essentialMinorUnits / ESSENTIAL_EXPENSE_TRAILING_MONTHS,
  );

  const activeLoans = unwrapList(loansResponse);
  const monthlyEmiMinorUnits = activeLoans
    .filter((loan) => loan.currency_code === currencyCode)
    .reduce((sum, loan) => sum + (loan.emi_amount_minor_units ?? 0), 0);

  const monthlyInsuranceCommitmentsMinorUnits = Math.round(
    insuranceOverview.totalAnnualPremiumMinorUnits / 12,
  );

  let liquidEmergencyMoneyMinorUnits = 0;
  let excludedCurrencyMismatchCount = 0;
  for (const source of sources) {
    if (!source.isIncluded) {
      continue;
    }
    if (source.currencyCode !== currencyCode) {
      excludedCurrencyMismatchCount += 1;
      continue;
    }
    liquidEmergencyMoneyMinorUnits += source.currentValueMinorUnits ?? 0;
  }

  const result = plan
    ? computeEmergencyFundResult({
        averageEssentialMonthlyExpensesMinorUnits,
        monthlyEmiMinorUnits,
        monthlyInsuranceCommitmentsMinorUnits,
        coverageTargetMonths: plan.coverage_target_months,
        liquidEmergencyMoneyMinorUnits,
      })
    : null;

  return {
    plan,
    currencyCode,
    sources,
    averageEssentialMonthlyExpensesMinorUnits,
    monthlyEmiMinorUnits,
    monthlyInsuranceCommitmentsMinorUnits,
    excludedCurrencyMismatchCount,
    result,
  };
}
