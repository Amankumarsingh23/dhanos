/**
 * Pure arithmetic behind the emergency fund planner (PROMPT 31). No
 * database access, so every function here is fully unit-testable in
 * isolation.
 *
 * Unlike the Goals module (PROMPT 30), this never projects an investment
 * return — an emergency fund is, by definition, money you can already get
 * to; growth assumptions have no place here. Every figure is a plain
 * arithmetic fact built from real inputs, never a forecast.
 *
 * **"Do not count" is enforced by what qualifies as a candidate at all**
 * (see classifyAccountLiquidity below and portfolio-performance.ts's
 * existing classifyLiquidity, reused unchanged for investments) — illiquid
 * property, disputed receivables, and uncertain inherited assets are never
 * candidates in the first place (this feature never reads the `assets` or
 * `lendings` tables); locked retirement money defaults to excluded but
 * stays overridable, matching the prompt's own "by default" wording;
 * unavailable credit limits (a `financial_accounts` row with
 * `account_type in ('loan', 'credit')`) are the one case with no override
 * at all, since a credit line is a liability, not owned money.
 */

export type AccountLiquidity = "liquid" | "semi_liquid" | "illiquid";

const ACCOUNT_TYPE_LIQUIDITY: Record<string, AccountLiquidity> = {
  savings: "liquid",
  current: "liquid",
  cash: "liquid",
  wallet: "liquid",
  recurring_deposit: "semi_liquid",
  fixed_deposit: "illiquid",
  investment: "semi_liquid",
  demat: "semi_liquid",
  staking: "semi_liquid",
  provident_fund: "illiquid",
  pension: "illiquid",
};

/** Defaults to 'semi_liquid' for an unrecognized/'other' account type — same "don't guess either extreme" convention as portfolio-performance.ts's classifyLiquidity. */
export function classifyAccountLiquidity(
  accountType: string,
): AccountLiquidity {
  return ACCOUNT_TYPE_LIQUIDITY[accountType] ?? "semi_liquid";
}

export const ACCOUNT_LIQUIDITY_REASON: Record<AccountLiquidity, string> = {
  liquid: "Spendable immediately, no penalty or notice period.",
  semi_liquid:
    "Accessible, but may take time, incur a penalty, or involve selling something first.",
  illiquid:
    "Locked or heavily penalized to access early — retirement accounts and fixed deposits default to excluded.",
};

/** Only a 'liquid' classification defaults to included — everything else defaults excluded but stays overridable (except loan/credit accounts, which are never offered as candidates at all — see the module comment). */
export function defaultIncludesForLiquidity(
  liquidity: AccountLiquidity,
): boolean {
  return liquidity === "liquid";
}

/** account_types that represent a liability or unavailable credit, not owned liquid money — never offered as a candidate, no override possible. PROMPT 31: "do not count unavailable credit limits." */
const NEVER_QUALIFYING_ACCOUNT_TYPES: readonly string[] = ["loan", "credit"];

export function isAccountTypeEligible(accountType: string): boolean {
  return !NEVER_QUALIFYING_ACCOUNT_TYPES.includes(accountType);
}

export type EmergencyFundInputs = {
  averageEssentialMonthlyExpensesMinorUnits: number;
  monthlyEmiMinorUnits: number;
  monthlyInsuranceCommitmentsMinorUnits: number;
  /** User-selected — never inferred (a suggested starting point may be shown alongside, but this is always the household's own choice). */
  coverageTargetMonths: number;
  liquidEmergencyMoneyMinorUnits: number;
};

export type EmergencyFundResult = {
  /** Essential expenses + EMIs + insurance commitments — the recurring cost of one month without income. */
  monthlyBurnRateMinorUnits: number;
  /** monthlyBurnRate × coverageTargetMonths — the inflation-adjusted term doesn't apply here (this is today's burn rate, not a future date), so this is simply the nominal target. */
  targetAmountMinorUnits: number;
  liquidEmergencyMoneyMinorUnits: number;
  /** liquidEmergencyMoney ÷ monthlyBurnRate — null when the burn rate is 0 (nothing to divide by, never a fabricated ratio). */
  monthsOfCoverage: number | null;
  shortfallMinorUnits: number;
  /** liquidEmergencyMoney ÷ targetAmount × 100 — null when the target is 0. Can exceed 100 if overfunded — never capped, since "already have more than the target" is a real, useful fact. */
  progressPercentage: number | null;
  suggestedMonthlyContributionMinorUnits: number;
};

/** Default horizon (in months) the suggested contribution assumes for closing any shortfall — a reasonable, commonly-recommended pace, not a stored input; callers may override it. */
export const DEFAULT_BUILD_HORIZON_MONTHS = 12;

/**
 * The whole coverage calculation. Every output is a plain derived fact:
 * nothing here projects a return or assumes a contribution will actually
 * happen — "suggested" is exactly that, a suggestion, never a promise or a
 * guarantee of any kind.
 */
export function computeEmergencyFundResult(
  input: EmergencyFundInputs,
  buildHorizonMonths: number = DEFAULT_BUILD_HORIZON_MONTHS,
): EmergencyFundResult {
  const monthlyBurnRateMinorUnits =
    input.averageEssentialMonthlyExpensesMinorUnits +
    input.monthlyEmiMinorUnits +
    input.monthlyInsuranceCommitmentsMinorUnits;

  const targetAmountMinorUnits = Math.round(
    monthlyBurnRateMinorUnits * input.coverageTargetMonths,
  );

  const shortfallMinorUnits = Math.max(
    0,
    targetAmountMinorUnits - input.liquidEmergencyMoneyMinorUnits,
  );

  const monthsOfCoverage =
    monthlyBurnRateMinorUnits > 0
      ? input.liquidEmergencyMoneyMinorUnits / monthlyBurnRateMinorUnits
      : null;

  const progressPercentage =
    targetAmountMinorUnits > 0
      ? (input.liquidEmergencyMoneyMinorUnits / targetAmountMinorUnits) * 100
      : null;

  const suggestedMonthlyContributionMinorUnits =
    shortfallMinorUnits > 0 && buildHorizonMonths > 0
      ? Math.round(shortfallMinorUnits / buildHorizonMonths)
      : 0;

  return {
    monthlyBurnRateMinorUnits,
    targetAmountMinorUnits,
    liquidEmergencyMoneyMinorUnits: input.liquidEmergencyMoneyMinorUnits,
    monthsOfCoverage,
    shortfallMinorUnits,
    progressPercentage,
    suggestedMonthlyContributionMinorUnits,
  };
}

/**
 * A suggested starting point for coverageTargetMonths based on how many
 * dependants the household supports — purely a suggestion the UI can
 * prefill, never enforced; coverageTargetMonths itself always stays the
 * household's own explicit choice. Baseline 3 months, +1 per dependant,
 * capped at 12 — a household with more dependants than that should still
 * consciously choose their own target rather than have one assumed.
 */
export function suggestCoverageTargetMonths(dependantsCount: number): number {
  return Math.min(12, 3 + Math.max(0, dependantsCount));
}
