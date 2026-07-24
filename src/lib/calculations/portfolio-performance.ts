/**
 * Pure arithmetic behind the investment portfolio's core metrics (PROMPT
 * 18): total contributed, current value, realized/unrealized gain-loss,
 * income received, fees, and absolute return — all derived from a
 * holding's investment_transactions history, never a single mutable
 * value (the same principle PROMPT 16 established for the schema
 * itself). No database access, so every function here is fully
 * unit-testable in isolation.
 *
 * ## Cost-basis method
 *
 * This app has no per-lot tracking (no "which specific units were sold"
 * concept — see docs/financial-domain-model.md §4), so realized/
 * unrealized gain-loss uses **weighted-average cost basis**: every
 * contribution/purchase adds to a running (units, cost) pool; every
 * sale/withdrawal removes a proportional slice of *both* — the same
 * average-cost method most brokerages use for tax lots when specific-lot
 * identification isn't elected. For a unit-less lump-sum asset (an FD/
 * PPF/EPF/NPS deposit, which never has `quantity` set), the transaction's
 * own `amountMinorUnits` stands in for "units" — a ₹10,000 deposit is
 * treated as 10,000 units, so a later ₹4,000 withdrawal removes exactly
 * 40% of the running cost basis. This only stays correct if a lump-sum
 * asset's `interest`/`dividend` accrual is recorded as its own
 * transaction (which this function already keeps separate from
 * withdrawals), and a `withdrawal`/`sale` amount represents principal
 * recovery + any realized gain — never a blended "principal plus interest
 * in one number" (that would double-count the interest once here and
 * once as its own `interest` row). Document this convention at data-entry
 * time; this function cannot detect the difference on its own.
 *
 * ## What counts as income vs. gain (PROMPT 18 acceptance criterion:
 * "valuation gain is not treated as income transaction")
 *
 * `incomeReceivedMinorUnits` is built *only* from `dividend`/`interest`
 * transaction rows — actual cash received. A valuation snapshot's
 * change in value over time is unrealized gain/loss, computed
 * separately from the latest `investment_valuation_snapshots` row (see
 * src/features/investments/queries.ts) minus the remaining cost basis —
 * it never flows through this function's income figure, and this
 * function never reads valuation snapshots at all.
 */

export type InvestmentTransactionType =
  | "contribution"
  | "purchase"
  | "sale"
  | "dividend"
  | "interest"
  | "fee"
  | "withdrawal";

export type HoldingTransactionInput = {
  transactionType: InvestmentTransactionType;
  transactionDate: string;
  amountMinorUnits: number;
  quantity: number | null;
  feeMinorUnits: number | null;
};

export type HoldingCostBasis = {
  totalContributedMinorUnits: number;
  totalWithdrawnMinorUnits: number;
  incomeReceivedMinorUnits: number;
  totalFeesMinorUnits: number;
  /** Gain/loss already locked in by a sale/withdrawal — proceeds minus the cost basis of the units removed. */
  realizedGainLossMinorUnits: number;
  /** The cost basis of whatever is still held — pair with a current valuation to get unrealized gain/loss (see computeUnrealizedGainLoss). */
  remainingCostBasisMinorUnits: number;
  /** Units still held — meaningful only when hasQuantity is true (a lump-sum asset's "units" are just its amount, not a real quantity to display). */
  remainingUnits: number;
  hasQuantity: boolean;
};

/**
 * Walks a holding's transactions in date order, building up the
 * weighted-average cost basis described above. Every output figure is
 * derived, never a stored/mutable value.
 */
export function computeHoldingCostBasis(
  transactions: readonly HoldingTransactionInput[],
): HoldingCostBasis {
  const sorted = [...transactions].sort((a, b) =>
    a.transactionDate.localeCompare(b.transactionDate),
  );

  let runningUnits = 0;
  let runningCostBasis = 0;
  let totalContributed = 0;
  let totalWithdrawn = 0;
  let incomeReceived = 0;
  let totalFees = 0;
  let realizedGainLoss = 0;
  let hasQuantity = false;

  for (const transaction of sorted) {
    if (transaction.feeMinorUnits) {
      totalFees += transaction.feeMinorUnits;
    }

    switch (transaction.transactionType) {
      case "contribution":
      case "purchase": {
        const units = transaction.quantity ?? transaction.amountMinorUnits;
        if (transaction.quantity !== null) {
          hasQuantity = true;
        }
        runningUnits += units;
        runningCostBasis += transaction.amountMinorUnits;
        totalContributed += transaction.amountMinorUnits;
        break;
      }
      case "sale":
      case "withdrawal": {
        const units = transaction.quantity ?? transaction.amountMinorUnits;
        const soldFraction =
          runningUnits > 0 ? Math.min(1, units / runningUnits) : 0;
        const costBasisRemoved = runningCostBasis * soldFraction;
        realizedGainLoss += transaction.amountMinorUnits - costBasisRemoved;
        runningCostBasis = Math.max(0, runningCostBasis - costBasisRemoved);
        runningUnits -= units;
        totalWithdrawn += transaction.amountMinorUnits;
        break;
      }
      case "dividend":
      case "interest":
        incomeReceived += transaction.amountMinorUnits;
        break;
      case "fee":
        totalFees += transaction.amountMinorUnits;
        break;
    }
  }

  return {
    totalContributedMinorUnits: totalContributed,
    totalWithdrawnMinorUnits: totalWithdrawn,
    incomeReceivedMinorUnits: incomeReceived,
    totalFeesMinorUnits: totalFees,
    realizedGainLossMinorUnits: Math.round(realizedGainLoss),
    remainingCostBasisMinorUnits: Math.round(runningCostBasis),
    remainingUnits: runningUnits,
    hasQuantity,
  };
}

/**
 * Unrealized gain/loss = current value minus the cost basis of what's
 * still held. Returns null (never 0, never a guess) when there is no
 * valuation to compare against — PROMPT 18: "missing valuations are
 * shown as stale or incomplete," not silently treated as zero value.
 */
export function computeUnrealizedGainLoss(
  currentValueMinorUnits: number | null,
  remainingCostBasisMinorUnits: number,
): number | null {
  if (currentValueMinorUnits === null) {
    return null;
  }
  return currentValueMinorUnits - remainingCostBasisMinorUnits;
}

/**
 * Absolute (non-annualized) total return: realized + unrealized gain,
 * plus income received, minus fees. Deliberately excludes any time
 * dimension — see src/lib/calculations/xirr.ts for the annualized figure,
 * kept as a completely separate calculation (docs/money-calculation-rules.md
 * §4: a projection/rate must never be blended silently into a plain
 * total). Null when unrealized gain/loss is unknown (no valuation yet).
 */
export function computeAbsoluteReturn(params: {
  realizedGainLossMinorUnits: number;
  unrealizedGainLossMinorUnits: number | null;
  incomeReceivedMinorUnits: number;
  totalFeesMinorUnits: number;
}): number | null {
  if (params.unrealizedGainLossMinorUnits === null) {
    return null;
  }
  return (
    params.realizedGainLossMinorUnits +
    params.unrealizedGainLossMinorUnits +
    params.incomeReceivedMinorUnits -
    params.totalFeesMinorUnits
  );
}

/**
 * Liquidity/risk classification — PROMPT 18's two remaining core metrics.
 * Both are a simple, fixed default per asset_class, **not investment
 * advice and not personalized**: an individual stock, a specific private
 * lending arrangement, or a particular fund could genuinely be more or
 * less liquid/risky than this default suggests. This is a descriptive
 * label ("investments like this are typically...") for portfolio
 * organization, the same spirit as docs/product-scope.md §4's "no
 * investment advice / robo-advisory" non-goal — never render it as a
 * recommendation or a guarantee.
 */
export type LiquidityClassification = "liquid" | "semi_liquid" | "illiquid";
export type RiskClassification = "low" | "medium" | "high";

const ASSET_CLASS_LIQUIDITY: Record<string, LiquidityClassification> = {
  stock: "liquid",
  etf: "liquid",
  mutual_fund: "liquid",
  digital_gold: "liquid",
  crypto: "liquid",
  gold: "semi_liquid",
  bond: "semi_liquid",
  recurring_deposit: "semi_liquid",
  staking: "semi_liquid",
  fixed_deposit: "illiquid",
  ppf: "illiquid",
  epf: "illiquid",
  nps: "illiquid",
  private_business: "illiquid",
  private_lending: "illiquid",
  real_estate: "illiquid",
};

const ASSET_CLASS_RISK: Record<string, RiskClassification> = {
  fixed_deposit: "low",
  recurring_deposit: "low",
  ppf: "low",
  epf: "low",
  bond: "low",
  mutual_fund: "medium",
  etf: "medium",
  gold: "medium",
  digital_gold: "medium",
  nps: "medium",
  real_estate: "medium",
  stock: "high",
  crypto: "high",
  staking: "high",
  private_business: "high",
  private_lending: "high",
};

/** Defaults to 'semi_liquid' for an unrecognized/'other' asset class rather than guessing either extreme. */
export function classifyLiquidity(assetClass: string): LiquidityClassification {
  return ASSET_CLASS_LIQUIDITY[assetClass] ?? "semi_liquid";
}

/** Defaults to 'medium' for an unrecognized/'other' asset class rather than guessing either extreme. */
export function classifyRisk(assetClass: string): RiskClassification {
  return ASSET_CLASS_RISK[assetClass] ?? "medium";
}
