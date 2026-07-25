/**
 * Pure arithmetic behind the Money Classroom's personalized insights
 * (PROMPT 38). No database access — every function here takes an
 * already-fetched, already-netted figure and returns a derived fact, so the
 * same inputs always produce the same outputs.
 *
 * PROMPT 38's own rule drives every function's shape: "missing data
 * produces insufficient data, not guesses." Each ratio here returns `null`
 * (never a fabricated 0% or 100%) whenever its denominator is 0 or its
 * inputs don't exist yet — the same convention already used by
 * debt-metrics.ts's computeDebtToIncomeRatio and emergency-fund.ts's
 * monthsOfCoverage, both reused directly by src/features/learning/queries.ts
 * rather than re-derived here.
 *
 * Every insight is a plain arithmetic fact about data the household already
 * entered elsewhere — never a projection, and never phrased as advice (see
 * docs/money-calculation-rules.md §4 and the module comment on
 * src/features/learning/content.ts).
 */

/**
 * Fixed commitments (active loan EMIs + active recurring "expense" rules,
 * normalized to a monthly-equivalent figure by the caller — see
 * src/lib/calculations/sip-commitment.ts's computeMonthlyEquivalent, reused
 * unchanged since a recurring rule's cadence is the exact same shape a
 * SIP's is) as a share of monthly income. `null` when there's no income to
 * divide by — a household with 0 recorded income has an undefined ratio,
 * not a 0%/∞% one.
 */
export function computeFixedCommitmentsRatio(
  fixedCommitmentsMinorUnits: number,
  monthlyIncomeMinorUnits: number,
): number | null {
  if (monthlyIncomeMinorUnits <= 0) {
    return null;
  }
  return fixedCommitmentsMinorUnits / monthlyIncomeMinorUnits;
}

/**
 * Investment contribution rate — investments contributed ÷ monthly income,
 * over the same trailing period. Deliberately distinct from
 * cash-flow-summary.ts's computeInvestmentRate: that function returns 0 for
 * the dashboard when income is 0 (a documented display convention for a
 * chart axis), but the classroom's own "insufficient data" rule means a
 * zero-income household should see "insufficient data," not "0% invested."
 */
export function computeInvestmentContributionRate(
  investmentMinorUnits: number,
  monthlyIncomeMinorUnits: number,
): number | null {
  if (monthlyIncomeMinorUnits <= 0) {
    return null;
  }
  return investmentMinorUnits / monthlyIncomeMinorUnits;
}

export type PlatformValue = {
  label: string;
  valueMinorUnits: number;
};

export type PlatformConcentrationResult = {
  topPlatformLabel: string;
  topPlatformValueMinorUnits: number;
  totalValueMinorUnits: number;
  /** topPlatformValueMinorUnits ÷ totalValueMinorUnits — never fabricated when there's nothing invested yet (see the null return below). */
  shareOfPortfolio: number;
};

/**
 * How concentrated the portfolio is on its single largest platform —
 * `platformValues` is expected pre-grouped-by-platform (see
 * src/features/investments/queries.ts's getPlatformAllocation, reused
 * as-is). Returns `null` when there's no valued holding anywhere yet, never
 * a 0%/100% guess about a platform that doesn't hold anything.
 */
export function computePlatformConcentration(
  platformValues: readonly PlatformValue[],
): PlatformConcentrationResult | null {
  const totalValueMinorUnits = platformValues.reduce(
    (sum, row) => sum + row.valueMinorUnits,
    0,
  );
  if (totalValueMinorUnits <= 0) {
    return null;
  }

  const top = platformValues.reduce((best, row) =>
    row.valueMinorUnits > best.valueMinorUnits ? row : best,
  );

  return {
    topPlatformLabel: top.label,
    topPlatformValueMinorUnits: top.valueMinorUnits,
    totalValueMinorUnits,
    shareOfPortfolio: top.valueMinorUnits / totalValueMinorUnits,
  };
}
