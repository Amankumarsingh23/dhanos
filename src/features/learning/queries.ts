import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import { computeDebtToIncomeRatio } from "@/lib/calculations/debt-metrics";
import {
  computeFixedCommitmentsRatio,
  computeInvestmentContributionRate,
  computePlatformConcentration,
  type PlatformConcentrationResult,
} from "@/lib/calculations/learning-insights";
import { computeMonthlyEquivalent } from "@/lib/calculations/sip-commitment";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import { getIncomeTrend } from "@/features/income/queries";
import { listRecurringRules } from "@/features/recurring/queries";
import { getPlatformAllocation } from "@/features/investments/queries";
import { getInsuranceOverview } from "@/features/insurance/queries";
import { getEmergencyFundPlanDetail } from "@/features/emergency-fund/queries";
import type { LearningInsightKey } from "./content";

/**
 * Data access for the Money Classroom's personalized insights (PROMPT 38).
 * Every figure here reuses another domain's own already-correct logic
 * rather than re-deriving it — the same convention established by the
 * emergency fund planner (PROMPT 31) and net-worth engine (PROMPT 32) —
 * income via src/features/income/queries.ts's getIncomeTrend, fixed
 * recurring commitments via src/features/recurring/queries.ts's
 * listRecurringRules, platform allocation via
 * src/features/investments/queries.ts's getPlatformAllocation, insurance
 * renewal status via src/features/insurance/queries.ts's
 * getInsuranceOverview, and emergency-fund coverage via
 * src/features/emergency-fund/queries.ts's getEmergencyFundPlanDetail
 * directly.
 *
 * "Missing data produces insufficient data, not guesses": every insight
 * below is a discriminated union — `available: true` with the real figure,
 * or `available: false` with a plain-language reason — never a fabricated
 * percentage. "Personalized values link to underlying records": every
 * insight also carries the href(s) of the feature page(s) whose records it
 * was computed from, so a household can always trace a figure back to the
 * data behind it.
 */

const TRAILING_MONTHS = 3;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type LearningInsightUnavailable = {
  available: false;
  reason: string;
  sourceHrefs: readonly string[];
};

export type FixedCommitmentsInsight =
  | {
      available: true;
      ratio: number;
      fixedCommitmentsMinorUnits: number;
      monthlyIncomeMinorUnits: number;
      sourceHrefs: readonly string[];
    }
  | LearningInsightUnavailable;

export type EmergencyFundCoverageInsight =
  | {
      available: true;
      monthsOfCoverage: number;
      coverageTargetMonths: number;
      sourceHrefs: readonly string[];
    }
  | LearningInsightUnavailable;

export type PlatformConcentrationInsight =
  | (PlatformConcentrationResult & {
      available: true;
      sourceHrefs: readonly string[];
    })
  | LearningInsightUnavailable;

export type DebtToIncomeInsight =
  | {
      available: true;
      ratio: number;
      monthlyEmiBurdenMinorUnits: number;
      monthlyIncomeMinorUnits: number;
      sourceHrefs: readonly string[];
    }
  | LearningInsightUnavailable;

export type InsuranceRenewalInsight =
  | {
      available: true;
      activePolicyCount: number;
      dueSoonCount: number;
      sourceHrefs: readonly string[];
    }
  | LearningInsightUnavailable;

export type InvestmentContributionRateInsight =
  | {
      available: true;
      rate: number;
      investmentMinorUnits: number;
      monthlyIncomeMinorUnits: number;
      sourceHrefs: readonly string[];
    }
  | LearningInsightUnavailable;

export type LearningInsights = {
  currencyCode: string;
  fixedCommitmentsRatio: FixedCommitmentsInsight;
  emergencyFundCoverage: EmergencyFundCoverageInsight;
  platformConcentration: PlatformConcentrationInsight;
  debtToIncomeRatio: DebtToIncomeInsight;
  insuranceRenewalStatus: InsuranceRenewalInsight;
  investmentContributionRate: InvestmentContributionRateInsight;
};

/** Trailing-3-month average of cleared income — same trailing window convention as the emergency fund planner's average essential expenses. */
async function getAverageMonthlyIncome(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string,
): Promise<number> {
  const trend = await getIncomeTrend(
    supabase,
    householdId,
    TRAILING_MONTHS,
    asOfDate,
  );
  const total = trend.reduce((sum, row) => sum + row.totalMinorUnits, 0);
  return Math.round(total / TRAILING_MONTHS);
}

/** Trailing-3-month average of cleared investment contributions, same window as getAverageMonthlyIncome so the two are directly comparable. */
async function getAverageMonthlyInvestmentContribution(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string,
): Promise<number> {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (TRAILING_MONTHS - 1), 1),
  );
  const rows = unwrapList(
    await supabase
      .from("transactions")
      .select("amount_minor_units, currency_code")
      .eq("household_id", householdId)
      .eq("kind", "investment_contribution")
      .eq("status", "cleared")
      .gte("transaction_date", toIsoDateString(rangeStart))
      .lte("transaction_date", asOfDate),
  );
  const total = rows
    .filter((row) => row.currency_code === currencyCode)
    .reduce((sum, row) => sum + row.amount_minor_units, 0);
  return Math.round(total / TRAILING_MONTHS);
}

/** Active loans' EMI burden in `currencyCode` — same "loans.emi_amount_minor_units, active only" figure the emergency fund planner uses for monthlyEmiMinorUnits. */
async function getMonthlyEmiBurden(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<number> {
  const rows = unwrapList(
    await supabase
      .from("loans")
      .select("emi_amount_minor_units, currency_code, status")
      .eq("household_id", householdId)
      .eq("status", "active"),
  );
  return rows
    .filter((row) => row.currency_code === currencyCode)
    .reduce((sum, row) => sum + (row.emi_amount_minor_units ?? 0), 0);
}

/** Active recurring 'expense' rules' monthly-equivalent amount in `currencyCode` — subscriptions, rent, bills set up as a recurring commitment, distinct from loan EMIs (already counted via getMonthlyEmiBurden, never doubled here). */
async function getMonthlyRecurringExpenseCommitment(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<number> {
  const page = await listRecurringRules(
    supabase,
    householdId,
    { kind: "expense", status: "active" },
    { pageSize: MAX_PAGE_SIZE },
  );
  return page.rows
    .filter((rule) => rule.currency_code === currencyCode)
    .reduce(
      (sum, rule) =>
        sum +
        computeMonthlyEquivalent(
          rule.currentAmountMinorUnits,
          rule.frequency,
          rule.interval_count,
        ),
      0,
    );
}

const NO_INCOME_REASON =
  "No cleared income recorded in the trailing 3 months — record income to see this.";

/** The full set of Money Classroom personalized insights for a household, as of `asOfDate`. */
export async function getLearningInsights(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<LearningInsights> {
  const [
    monthlyIncomeMinorUnits,
    monthlyEmiBurdenMinorUnits,
    monthlyRecurringExpenseMinorUnits,
    emergencyFundDetail,
    platformAllocation,
    insuranceOverview,
    investmentMinorUnits,
  ] = await Promise.all([
    getAverageMonthlyIncome(supabase, householdId, asOfDate),
    getMonthlyEmiBurden(supabase, householdId, currencyCode),
    getMonthlyRecurringExpenseCommitment(supabase, householdId, currencyCode),
    getEmergencyFundPlanDetail(supabase, householdId, currencyCode, asOfDate),
    getPlatformAllocation(supabase, householdId, asOfDate),
    getInsuranceOverview(supabase, householdId, currencyCode, asOfDate),
    getAverageMonthlyInvestmentContribution(
      supabase,
      householdId,
      currencyCode,
      asOfDate,
    ),
  ]);

  // Fixed commitments as a share of income.
  const fixedCommitmentsMinorUnits =
    monthlyEmiBurdenMinorUnits + monthlyRecurringExpenseMinorUnits;
  const fixedCommitmentsRatioValue = computeFixedCommitmentsRatio(
    fixedCommitmentsMinorUnits,
    monthlyIncomeMinorUnits,
  );
  const fixedCommitmentsRatio: FixedCommitmentsInsight =
    fixedCommitmentsRatioValue === null
      ? {
          available: false,
          reason: NO_INCOME_REASON,
          sourceHrefs: ["/app/income", "/app/debts", "/app/recurring"],
        }
      : {
          available: true,
          ratio: fixedCommitmentsRatioValue,
          fixedCommitmentsMinorUnits,
          monthlyIncomeMinorUnits,
          sourceHrefs: ["/app/income", "/app/debts", "/app/recurring"],
        };

  // Emergency-fund coverage.
  const emergencyFundCoverage: EmergencyFundCoverageInsight =
    emergencyFundDetail.plan && emergencyFundDetail.result?.monthsOfCoverage !== null && emergencyFundDetail.result?.monthsOfCoverage !== undefined
      ? {
          available: true,
          monthsOfCoverage: emergencyFundDetail.result.monthsOfCoverage,
          coverageTargetMonths: emergencyFundDetail.plan.coverage_target_months,
          sourceHrefs: ["/app/emergency-fund"],
        }
      : {
          available: false,
          reason: emergencyFundDetail.plan
            ? "Monthly burn rate is 0 — coverage isn't meaningful yet."
            : "No emergency fund plan set up yet — create one to see this.",
          sourceHrefs: ["/app/emergency-fund"],
        };

  // Concentration on the single largest investment platform — never blended across currencies.
  const concentration = computePlatformConcentration(
    platformAllocation
      .filter((row) => row.currencyCode === currencyCode)
      .map((row) => ({
        label: row.label,
        valueMinorUnits: row.currentValueMinorUnits,
      })),
  );
  const platformConcentration: PlatformConcentrationInsight =
    concentration === null
      ? {
          available: false,
          reason:
            "No valued investment holdings yet — add a holding and a valuation to see this.",
          sourceHrefs: ["/app/investments/portfolio"],
        }
      : {
          available: true,
          ...concentration,
          sourceHrefs: ["/app/investments/portfolio"],
        };

  // Debt-to-income ratio.
  const debtToIncomeRatioValue = computeDebtToIncomeRatio(
    monthlyEmiBurdenMinorUnits,
    monthlyIncomeMinorUnits,
  );
  const debtToIncomeRatio: DebtToIncomeInsight =
    debtToIncomeRatioValue === null
      ? {
          available: false,
          reason: NO_INCOME_REASON,
          sourceHrefs: ["/app/income", "/app/debts"],
        }
      : {
          available: true,
          ratio: debtToIncomeRatioValue,
          monthlyEmiBurdenMinorUnits,
          monthlyIncomeMinorUnits,
          sourceHrefs: ["/app/income", "/app/debts"],
        };

  // Insurance renewal status — 0 active policies is a valid, computable state, not "insufficient data."
  const insuranceRenewalStatus: InsuranceRenewalInsight = {
    available: true,
    activePolicyCount: insuranceOverview.activePolicyCount,
    dueSoonCount: insuranceOverview.dueSoon.length,
    sourceHrefs: ["/app/insurance"],
  };

  // Investment contribution rate.
  const investmentContributionRateValue = computeInvestmentContributionRate(
    investmentMinorUnits,
    monthlyIncomeMinorUnits,
  );
  const investmentContributionRate: InvestmentContributionRateInsight =
    investmentContributionRateValue === null
      ? {
          available: false,
          reason: NO_INCOME_REASON,
          sourceHrefs: ["/app/income", "/app/investments/portfolio"],
        }
      : {
          available: true,
          rate: investmentContributionRateValue,
          investmentMinorUnits,
          monthlyIncomeMinorUnits,
          sourceHrefs: ["/app/income", "/app/investments/portfolio"],
        };

  return {
    currencyCode,
    fixedCommitmentsRatio,
    emergencyFundCoverage,
    platformConcentration,
    debtToIncomeRatio,
    insuranceRenewalStatus,
    investmentContributionRate,
  };
}

/** Looks up one named insight from an already-fetched LearningInsights bundle — used by the topic detail page to render only the one insight relevant to that topic. */
export function pickInsight(
  insights: LearningInsights,
  key: LearningInsightKey,
):
  | FixedCommitmentsInsight
  | EmergencyFundCoverageInsight
  | PlatformConcentrationInsight
  | DebtToIncomeInsight
  | InsuranceRenewalInsight
  | InvestmentContributionRateInsight {
  return insights[key];
}
