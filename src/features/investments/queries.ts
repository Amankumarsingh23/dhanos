import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import { isStale } from "@/components/shared/stale-data-indicator";
import {
  classifyLiquidity,
  classifyRisk,
  computeAbsoluteReturn,
  computeHoldingCostBasis,
  computeUnrealizedGainLoss,
  type HoldingCostBasis,
  type HoldingTransactionInput,
  type InvestmentTransactionType,
  type LiquidityClassification,
  type RiskClassification,
} from "@/lib/calculations/portfolio-performance";
import {
  computeXirr,
  XIRR_NON_CONVERGENCE_MESSAGES,
  type CashFlow,
  type NonConvergenceReason,
} from "@/lib/calculations/xirr";
import type { InvestmentAssetClass } from "@/lib/validation/investments";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A valuation older than this is flagged stale (PROMPT 18: "missing
 * valuations are shown as stale or incomplete") — investment valuations
 * are realistically refreshed monthly/quarterly, not hourly like an
 * account balance, so this is deliberately a much longer window than
 * StaleDataIndicator's own 24-hour default (see
 * src/components/shared/stale-data-indicator.tsx).
 */
const VALUATION_STALE_AFTER_HOURS = 45 * 24; // 45 days

type RawHoldingRow = {
  id: string;
  investment_account_id: string;
  investment_asset_id: string;
  is_active: boolean;
  investment_assets: {
    name: string;
    asset_class: string;
    currency_code: string;
  } | null;
  investment_accounts: { name: string } | null;
};

type RawTransactionRow = {
  investment_holding_id: string;
  transaction_type: string;
  transaction_date: string;
  amount_minor_units: number;
  quantity: number | null;
  fee_minor_units: number | null;
  status: string;
};

type RawValuationRow = {
  investment_holding_id: string;
  as_of_date: string;
  value_minor_units: number;
};

/** Every household-scoped fetch this feature needs, batched into a fixed, small number of queries — never one per holding. */
async function fetchPortfolioData(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<{
  holdings: RawHoldingRow[];
  transactionsByHolding: Map<string, RawTransactionRow[]>;
  valuationsByHolding: Map<string, RawValuationRow[]>;
}> {
  const [holdingsResult, transactionsResult, valuationsResult] =
    await Promise.all([
      supabase
        .from("investment_holdings")
        .select(
          "id, investment_account_id, investment_asset_id, is_active, investment_assets(name, asset_class, currency_code), investment_accounts(name)",
        )
        .eq("household_id", householdId),
      supabase
        .from("investment_transactions")
        .select(
          "investment_holding_id, transaction_type, transaction_date, amount_minor_units, quantity, fee_minor_units, status",
        )
        .eq("household_id", householdId)
        .in("status", ["pending", "cleared"]),
      supabase
        .from("investment_valuation_snapshots")
        .select("investment_holding_id, as_of_date, value_minor_units")
        .eq("household_id", householdId)
        .order("as_of_date", { ascending: true }),
    ]);

  const holdings = unwrapList(holdingsResult) as unknown as RawHoldingRow[];
  const transactions = unwrapList(
    transactionsResult,
  ) as unknown as RawTransactionRow[];
  const valuations = unwrapList(
    valuationsResult,
  ) as unknown as RawValuationRow[];

  const transactionsByHolding = new Map<string, RawTransactionRow[]>();
  for (const row of transactions) {
    const list = transactionsByHolding.get(row.investment_holding_id) ?? [];
    list.push(row);
    transactionsByHolding.set(row.investment_holding_id, list);
  }

  const valuationsByHolding = new Map<string, RawValuationRow[]>();
  for (const row of valuations) {
    const list = valuationsByHolding.get(row.investment_holding_id) ?? [];
    list.push(row);
    valuationsByHolding.set(row.investment_holding_id, list);
  }

  return { holdings, transactionsByHolding, valuationsByHolding };
}

function toHoldingTransactionInput(
  row: RawTransactionRow,
): HoldingTransactionInput {
  return {
    transactionType: row.transaction_type as InvestmentTransactionType,
    transactionDate: row.transaction_date,
    amountMinorUnits: row.amount_minor_units,
    quantity: row.quantity,
    feeMinorUnits: row.fee_minor_units,
  };
}

/** The latest valuation at or before `cutoffDate`, or null if none exists yet. */
function latestValuationAtOrBefore(
  valuations: readonly RawValuationRow[],
  cutoffDate: string,
): RawValuationRow | null {
  let latest: RawValuationRow | null = null;
  for (const valuation of valuations) {
    if (valuation.as_of_date > cutoffDate) {
      continue;
    }
    if (!latest || valuation.as_of_date > latest.as_of_date) {
      latest = valuation;
    }
  }
  return latest;
}

export type PortfolioHoldingRow = {
  investmentHoldingId: string;
  assetName: string;
  assetClass: InvestmentAssetClass;
  platformName: string;
  currencyCode: string;
  isActive: boolean;
  costBasis: HoldingCostBasis;
  currentValueMinorUnits: number | null;
  latestValuationDate: string | null;
  hasValuation: boolean;
  isValuationStale: boolean;
  unrealizedGainLossMinorUnits: number | null;
  absoluteReturnMinorUnits: number | null;
  liquidity: LiquidityClassification;
  risk: RiskClassification;
};

function buildHoldingRow(
  holding: RawHoldingRow,
  transactions: readonly RawTransactionRow[],
  valuations: readonly RawValuationRow[],
  asOfDate: string,
): PortfolioHoldingRow {
  const costBasis = computeHoldingCostBasis(
    transactions.map(toHoldingTransactionInput),
  );
  const latestValuation = latestValuationAtOrBefore(valuations, asOfDate);
  const currentValueMinorUnits = latestValuation?.value_minor_units ?? null;
  const unrealizedGainLossMinorUnits = computeUnrealizedGainLoss(
    currentValueMinorUnits,
    costBasis.remainingCostBasisMinorUnits,
  );
  const absoluteReturnMinorUnits = computeAbsoluteReturn({
    realizedGainLossMinorUnits: costBasis.realizedGainLossMinorUnits,
    unrealizedGainLossMinorUnits,
    incomeReceivedMinorUnits: costBasis.incomeReceivedMinorUnits,
    totalFeesMinorUnits: costBasis.totalFeesMinorUnits,
  });
  const assetClass =
    (holding.investment_assets?.asset_class as InvestmentAssetClass) ?? "other";

  return {
    investmentHoldingId: holding.id,
    assetName: holding.investment_assets?.name ?? "Unknown asset",
    assetClass,
    platformName: holding.investment_accounts?.name ?? "Unknown platform",
    currencyCode: holding.investment_assets?.currency_code ?? "INR",
    isActive: holding.is_active,
    costBasis,
    currentValueMinorUnits,
    latestValuationDate: latestValuation?.as_of_date ?? null,
    hasValuation: latestValuation !== null,
    isValuationStale: latestValuation
      ? isStale(latestValuation.as_of_date, VALUATION_STALE_AFTER_HOURS)
      : false,
    unrealizedGainLossMinorUnits,
    absoluteReturnMinorUnits,
    liquidity: classifyLiquidity(assetClass),
    risk: classifyRisk(assetClass),
  };
}

/**
 * Every holding's full performance picture — PROMPT 18's per-holding core
 * metrics, computed from a fixed, small number of queries for the whole
 * household (never one query per holding). A holding with no valuation
 * yet gets `hasValuation: false` and a null current/unrealized value,
 * never a fabricated zero (see computeUnrealizedGainLoss).
 */
export async function getPortfolioHoldings(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<PortfolioHoldingRow[]> {
  const { holdings, transactionsByHolding, valuationsByHolding } =
    await fetchPortfolioData(supabase, householdId);

  return holdings.map((holding) =>
    buildHoldingRow(
      holding,
      transactionsByHolding.get(holding.id) ?? [],
      valuationsByHolding.get(holding.id) ?? [],
      asOfDate,
    ),
  );
}

export type PortfolioSummary = {
  currencyCode: string;
  totalContributedMinorUnits: number;
  totalWithdrawnMinorUnits: number;
  currentValueMinorUnits: number;
  realizedGainLossMinorUnits: number;
  unrealizedGainLossMinorUnits: number;
  incomeReceivedMinorUnits: number;
  totalFeesMinorUnits: number;
  absoluteReturnMinorUnits: number;
  /** Holdings in this currency with no valuation yet — excluded from currentValue/unrealizedGainLoss, never silently treated as zero. */
  holdingsMissingValuationCount: number;
  holdingsWithStaleValuationCount: number;
  xirr:
    | { converged: true; ratePercent: number }
    | { converged: false; reason: NonConvergenceReason; message: string };
};

/**
 * Portfolio totals, one row per currency — PROMPT 18 acceptance criterion
 * "different currencies are not combined without an explicit conversion
 * system" applies here exactly as it does throughout this app. XIRR is
 * computed per currency too, from every holding's own cash-flow history
 * plus a final synthetic "as of today" cash flow of that currency's total
 * current value (see src/lib/calculations/xirr.ts for the method and
 * non-convergence handling).
 */
export async function getPortfolioSummary(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<PortfolioSummary[]> {
  const holdingRows = await getPortfolioHoldings(
    supabase,
    householdId,
    asOfDate,
  );
  const { transactionsByHolding } = await fetchPortfolioData(
    supabase,
    householdId,
  );

  const byCurrency = new Map<
    string,
    {
      totalContributed: number;
      totalWithdrawn: number;
      currentValue: number;
      realizedGainLoss: number;
      unrealizedGainLoss: number;
      incomeReceived: number;
      totalFees: number;
      missingValuationCount: number;
      staleValuationCount: number;
      cashFlows: CashFlow[];
    }
  >();

  for (const holding of holdingRows) {
    const bucket = byCurrency.get(holding.currencyCode) ?? {
      totalContributed: 0,
      totalWithdrawn: 0,
      currentValue: 0,
      realizedGainLoss: 0,
      unrealizedGainLoss: 0,
      incomeReceived: 0,
      totalFees: 0,
      missingValuationCount: 0,
      staleValuationCount: 0,
      cashFlows: [],
    };

    bucket.totalContributed += holding.costBasis.totalContributedMinorUnits;
    bucket.totalWithdrawn += holding.costBasis.totalWithdrawnMinorUnits;
    bucket.realizedGainLoss += holding.costBasis.realizedGainLossMinorUnits;
    bucket.incomeReceived += holding.costBasis.incomeReceivedMinorUnits;
    bucket.totalFees += holding.costBasis.totalFeesMinorUnits;
    if (holding.hasValuation) {
      bucket.currentValue += holding.currentValueMinorUnits ?? 0;
      bucket.unrealizedGainLoss += holding.unrealizedGainLossMinorUnits ?? 0;
    } else {
      bucket.missingValuationCount += 1;
    }
    if (holding.isValuationStale) {
      bucket.staleValuationCount += 1;
    }

    for (const raw of transactionsByHolding.get(holding.investmentHoldingId) ??
      []) {
      const outflowTypes: InvestmentTransactionType[] = [
        "contribution",
        "purchase",
        "fee",
      ];
      const isOutflow = outflowTypes.includes(
        raw.transaction_type as InvestmentTransactionType,
      );
      bucket.cashFlows.push({
        date: raw.transaction_date,
        amountMinorUnits: isOutflow
          ? -raw.amount_minor_units
          : raw.amount_minor_units,
      });
      if (raw.fee_minor_units) {
        bucket.cashFlows.push({
          date: raw.transaction_date,
          amountMinorUnits: -raw.fee_minor_units,
        });
      }
    }

    byCurrency.set(holding.currencyCode, bucket);
  }

  return Array.from(byCurrency.entries()).map(([currencyCode, bucket]) => {
    const absoluteReturn = computeAbsoluteReturn({
      realizedGainLossMinorUnits: bucket.realizedGainLoss,
      unrealizedGainLossMinorUnits: bucket.unrealizedGainLoss,
      incomeReceivedMinorUnits: bucket.incomeReceived,
      totalFeesMinorUnits: bucket.totalFees,
    });

    const xirrCashFlows: CashFlow[] = [
      ...bucket.cashFlows,
      { date: asOfDate, amountMinorUnits: bucket.currentValue },
    ];
    const xirrResult = computeXirr(xirrCashFlows);

    return {
      currencyCode,
      totalContributedMinorUnits: bucket.totalContributed,
      totalWithdrawnMinorUnits: bucket.totalWithdrawn,
      currentValueMinorUnits: bucket.currentValue,
      realizedGainLossMinorUnits: bucket.realizedGainLoss,
      unrealizedGainLossMinorUnits: bucket.unrealizedGainLoss,
      incomeReceivedMinorUnits: bucket.incomeReceived,
      totalFeesMinorUnits: bucket.totalFees,
      absoluteReturnMinorUnits: absoluteReturn ?? 0,
      holdingsMissingValuationCount: bucket.missingValuationCount,
      holdingsWithStaleValuationCount: bucket.staleValuationCount,
      xirr: xirrResult.converged
        ? { converged: true, ratePercent: xirrResult.rate * 100 }
        : {
            converged: false,
            reason: xirrResult.reason,
            message: XIRR_NON_CONVERGENCE_MESSAGES[xirrResult.reason],
          },
    };
  });
}

export type AllocationRow = {
  label: string;
  currencyCode: string;
  currentValueMinorUnits: number;
};

/** Current value grouped by asset class — "asset allocation" view. Only holdings with a valuation contribute; never blended across currencies. */
export async function getAssetAllocation(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<AllocationRow[]> {
  const holdings = await getPortfolioHoldings(supabase, householdId, asOfDate);
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    if (!holding.hasValuation) continue;
    const key = `${holding.assetClass}::${holding.currencyCode}`;
    totals.set(
      key,
      (totals.get(key) ?? 0) + (holding.currentValueMinorUnits ?? 0),
    );
  }
  return Array.from(totals.entries())
    .map(([key, currentValueMinorUnits]) => {
      const [label, currencyCode] = key.split("::") as [string, string];
      return { label, currencyCode, currentValueMinorUnits };
    })
    .sort((a, b) => b.currentValueMinorUnits - a.currentValueMinorUnits);
}

/** Current value grouped by platform — "platform allocation" view. */
export async function getPlatformAllocation(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<AllocationRow[]> {
  const holdings = await getPortfolioHoldings(supabase, householdId, asOfDate);
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    if (!holding.hasValuation) continue;
    const key = `${holding.platformName}::${holding.currencyCode}`;
    totals.set(
      key,
      (totals.get(key) ?? 0) + (holding.currentValueMinorUnits ?? 0),
    );
  }
  return Array.from(totals.entries())
    .map(([key, currentValueMinorUnits]) => {
      const [label, currencyCode] = key.split("::") as [string, string];
      return { label, currencyCode, currentValueMinorUnits };
    })
    .sort((a, b) => b.currentValueMinorUnits - a.currentValueMinorUnits);
}

export type GainLossByHoldingRow = {
  holdingLabel: string;
  currencyCode: string;
  realizedGainLossMinorUnits: number;
  unrealizedGainLossMinorUnits: number | null;
};

/** Realized + unrealized gain/loss per holding, base-currency holdings only — "gain/loss by holding" chart. */
export async function getGainLossByHolding(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<GainLossByHoldingRow[]> {
  const holdings = await getPortfolioHoldings(supabase, householdId, asOfDate);
  return holdings
    .filter((holding) => holding.currencyCode === baseCurrencyCode)
    .map((holding) => ({
      holdingLabel: `${holding.assetName} (${holding.platformName})`,
      currencyCode: holding.currencyCode,
      realizedGainLossMinorUnits: holding.costBasis.realizedGainLossMinorUnits,
      unrealizedGainLossMinorUnits: holding.unrealizedGainLossMinorUnits,
    }))
    .sort((a, b) => {
      const totalA =
        a.realizedGainLossMinorUnits + (a.unrealizedGainLossMinorUnits ?? 0);
      const totalB =
        b.realizedGainLossMinorUnits + (b.unrealizedGainLossMinorUnits ?? 0);
      return totalB - totalA;
    });
}

function buildTrailingMonthKeys(
  asOfDate: string,
  monthsBack: number,
): string[] {
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  return Array.from({ length: monthsBack }, (_, i) => {
    const monthDate = new Date(
      Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth() + i, 1),
    );
    return `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function monthEndCutoffs(
  asOfDate: string,
  monthsBack: number,
): { monthKey: string; cutoff: string }[] {
  const monthKeys = buildTrailingMonthKeys(asOfDate, monthsBack);
  const asOf = new Date(asOfDate);
  const rangeStart = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (monthsBack - 1), 1),
  );
  return monthKeys.map((monthKey, index) => {
    const monthDate = new Date(
      Date.UTC(
        rangeStart.getUTCFullYear(),
        rangeStart.getUTCMonth() + index,
        1,
      ),
    );
    const monthEnd = toIsoDateString(
      new Date(
        Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
      ),
    );
    return { monthKey, cutoff: monthEnd > asOfDate ? asOfDate : monthEnd };
  });
}

export type PortfolioValuePoint = {
  monthKey: string;
  principalMinorUnits: number;
  currentValueMinorUnits: number;
  /** Null when at least one contributing holding had no valuation as of this cutoff — the point is incomplete, not necessarily zero growth. See PROMPT 18 "missing valuations shown as stale or incomplete". */
  hasCompleteValuations: boolean;
};

/**
 * Portfolio value and principal (cost basis), evaluated at each of the
 * trailing `monthsBack` month-end cutoffs — the data behind both
 * "portfolio value over time" and "principal vs. growth" (growth =
 * currentValue - principal at each point, computed client-side so the two
 * series always reconcile exactly). Base-currency holdings only, per the
 * dashboard's established "never blend currencies" convention (see
 * src/features/dashboard/queries.ts's getAccountBalanceTrend). Recomputes
 * cost basis at each cutoff from one bounded fetch of all transactions —
 * never one query per month.
 */
export async function getPortfolioValueTrend(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<PortfolioValuePoint[]> {
  const { holdings, transactionsByHolding, valuationsByHolding } =
    await fetchPortfolioData(supabase, householdId);

  const baseCurrencyHoldings = holdings.filter(
    (holding) => holding.investment_assets?.currency_code === baseCurrencyCode,
  );

  return monthEndCutoffs(asOfDate, monthsBack).map(({ monthKey, cutoff }) => {
    let principal = 0;
    let currentValue = 0;
    let hasCompleteValuations = true;

    for (const holding of baseCurrencyHoldings) {
      const transactionsUpToCutoff = (
        transactionsByHolding.get(holding.id) ?? []
      ).filter((t) => t.transaction_date <= cutoff);
      if (transactionsUpToCutoff.length === 0) {
        continue;
      }
      const costBasis = computeHoldingCostBasis(
        transactionsUpToCutoff.map(toHoldingTransactionInput),
      );
      principal += costBasis.remainingCostBasisMinorUnits;

      const valuation = latestValuationAtOrBefore(
        valuationsByHolding.get(holding.id) ?? [],
        cutoff,
      );
      if (valuation) {
        currentValue += valuation.value_minor_units;
      } else {
        hasCompleteValuations = false;
      }
    }

    return {
      monthKey,
      principalMinorUnits: principal,
      currentValueMinorUnits: currentValue,
      hasCompleteValuations,
    };
  });
}

export type ContributionHistoryPoint = {
  monthKey: string;
  amountMinorUnits: number;
};

/** Monthly contribution/purchase totals across base-currency holdings — "contribution history" view. */
export async function getContributionHistory(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
  monthsBack = 6,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<ContributionHistoryPoint[]> {
  const { holdings, transactionsByHolding } = await fetchPortfolioData(
    supabase,
    householdId,
  );
  const baseCurrencyHoldingIds = new Set(
    holdings
      .filter((h) => h.investment_assets?.currency_code === baseCurrencyCode)
      .map((h) => h.id),
  );

  const totals = new Map<string, number>();
  for (const monthKey of buildTrailingMonthKeys(asOfDate, monthsBack)) {
    totals.set(monthKey, 0);
  }

  for (const [holdingId, rows] of transactionsByHolding.entries()) {
    if (!baseCurrencyHoldingIds.has(holdingId)) continue;
    for (const row of rows) {
      if (
        row.transaction_type !== "contribution" &&
        row.transaction_type !== "purchase"
      ) {
        continue;
      }
      const key = row.transaction_date.slice(0, 7);
      if (totals.has(key)) {
        totals.set(key, (totals.get(key) ?? 0) + row.amount_minor_units);
      }
    }
  }

  return Array.from(totals.entries()).map(([monthKey, amountMinorUnits]) => ({
    monthKey,
    amountMinorUnits,
  }));
}
