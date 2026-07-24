/**
 * Pure arithmetic behind the net-worth engine (PROMPT 32). No database
 * access, so every function here is fully unit-testable in isolation.
 *
 * **"Do not store only the final total"**: `computeNetWorthTotals` mirrors
 * the database's own generated columns (see
 * supabase/migrations/20260723160000_net_worth_breakdown.sql) exactly, so
 * the *live* (not-yet-recorded) view and a *recorded* snapshot always
 * agree on how the total is derived from its components — there is only
 * one formula, expressed twice (SQL for the stored fact, this function for
 * the live preview before it's saved), never two subtly different ones.
 *
 * **"Missing valuations lower completeness rather than becoming zero
 * silently"**: a missing valuation still contributes 0 to the relevant
 * component (there's no better number), but `computeCompletenessPercentage`
 * always reports what fraction of valuation-dependent items actually had
 * one, so the total is never presented as more reliable than it is.
 *
 * **"Ownership percentage is applied correctly"**: this module doesn't
 * re-implement that — it's already `computeNetWorthContributionMinorUnits`
 * in src/lib/calculations/assets.ts (PROMPT 27), reused unchanged by
 * src/features/net-worth/queries.ts.
 */

export type NetWorthComponents = {
  cashAndAccountsMinorUnits: number;
  investmentsMinorUnits: number;
  movableAssetsMinorUnits: number;
  propertyMinorUnits: number;
  receivablesMinorUnits: number;
  loansMinorUnits: number;
  otherLiabilitiesMinorUnits: number;
};

export type NetWorthTotals = NetWorthComponents & {
  totalAssetsMinorUnits: number;
  totalLiabilitiesMinorUnits: number;
  netWorthMinorUnits: number;
};

/** total_assets = cash + investments + movable assets + property + receivables; total_liabilities = loans + other liabilities; net worth = assets - liabilities. Must stay in exact lockstep with the database's generated columns. */
export function computeNetWorthTotals(
  components: NetWorthComponents,
): NetWorthTotals {
  const totalAssetsMinorUnits =
    components.cashAndAccountsMinorUnits +
    components.investmentsMinorUnits +
    components.movableAssetsMinorUnits +
    components.propertyMinorUnits +
    components.receivablesMinorUnits;
  const totalLiabilitiesMinorUnits =
    components.loansMinorUnits + components.otherLiabilitiesMinorUnits;

  return {
    ...components,
    totalAssetsMinorUnits,
    totalLiabilitiesMinorUnits,
    netWorthMinorUnits: totalAssetsMinorUnits - totalLiabilitiesMinorUnits,
  };
}

/** Share of valuation-dependent items (investment holdings + assets) that had a real valuation — 100 when there's nothing that could be missing one, never a divide-by-zero. */
export function computeCompletenessPercentage(
  valuationDependentItemCount: number,
  itemsWithValuationCount: number,
): number {
  if (valuationDependentItemCount <= 0) {
    return 100;
  }
  return (itemsWithValuationCount / valuationDependentItemCount) * 100;
}

const LIABILITY_CURRENTLY_OWED_STATUSES = [
  "active",
  "partially_paid",
  "disputed",
] as const;

export type LiabilityForNetWorth = {
  currencyCode: string;
  status: string;
  liabilitySource: "informal_borrowing" | "general_obligation";
  certainty: "confirmed" | "estimated";
  outstandingMinorUnits: number;
};

export type OtherLiabilitiesBreakdown = {
  informalDebtMinorUnits: number;
  confirmedGeneralObligationsMinorUnits: number;
  /** General obligations marked 'estimated' — deliberately excluded from net worth (PROMPT 32: "minus other CONFIRMED liabilities"), always shown separately so an estimate is never silently absorbed into a confirmed total. */
  estimatedGeneralObligationsExcludedMinorUnits: number;
  /** informalDebtMinorUnits + confirmedGeneralObligationsMinorUnits — the single stored `other_liabilities_minor_units` snapshot column. */
  otherLiabilitiesMinorUnits: number;
};

/**
 * Splits currently-owed liabilities (active/partially_paid/disputed — paid/
 * waived excluded, same convention as liability-metrics.ts) into informal
 * debt (any certainty — the prompt's "informal debt" has no confirmed-only
 * qualifier) and general obligations, the latter further split into
 * confirmed (counted) and estimated (excluded, but still surfaced).
 */
export function computeOtherLiabilitiesBreakdown(
  liabilities: readonly LiabilityForNetWorth[],
  currencyCode: string,
): OtherLiabilitiesBreakdown {
  const currentlyOwed = liabilities.filter(
    (liability) =>
      liability.currencyCode === currencyCode &&
      (LIABILITY_CURRENTLY_OWED_STATUSES as readonly string[]).includes(
        liability.status,
      ),
  );

  const informalDebtMinorUnits = currentlyOwed
    .filter((liability) => liability.liabilitySource === "informal_borrowing")
    .reduce((sum, liability) => sum + liability.outstandingMinorUnits, 0);

  const generalObligations = currentlyOwed.filter(
    (liability) => liability.liabilitySource === "general_obligation",
  );
  const confirmedGeneralObligationsMinorUnits = generalObligations
    .filter((liability) => liability.certainty === "confirmed")
    .reduce((sum, liability) => sum + liability.outstandingMinorUnits, 0);
  const estimatedGeneralObligationsExcludedMinorUnits = generalObligations
    .filter((liability) => liability.certainty === "estimated")
    .reduce((sum, liability) => sum + liability.outstandingMinorUnits, 0);

  return {
    informalDebtMinorUnits,
    confirmedGeneralObligationsMinorUnits,
    estimatedGeneralObligationsExcludedMinorUnits,
    otherLiabilitiesMinorUnits:
      informalDebtMinorUnits + confirmedGeneralObligationsMinorUnits,
  };
}

export type NetWorthSnapshotPoint = {
  asOfDate: string;
  netWorthMinorUnits: number;
};

/** The minimal shape selectLatestSnapshotPerMonth needs — just a dated point, so it can resample any per-snapshot series (net worth, investments-only, etc.), not just a full NetWorthSnapshotPoint. */
export type DatedPoint = { asOfDate: string };

/** One snapshot per calendar month — the latest as_of_date within each month — for month-over-month resampling. Pure string-slicing for the month key, never toMonthKey/date-fns on a plain date string (see src/lib/calculations/debt-trend.ts's documented UTC-shift bug this avoids). */
export function selectLatestSnapshotPerMonth<T extends DatedPoint>(
  snapshots: readonly T[],
): T[] {
  const latestByMonth = new Map<string, T>();
  for (const snapshot of snapshots) {
    const monthKey = snapshot.asOfDate.slice(0, 7);
    const existing = latestByMonth.get(monthKey);
    if (!existing || snapshot.asOfDate > existing.asOfDate) {
      latestByMonth.set(monthKey, snapshot);
    }
  }
  return Array.from(latestByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, snapshot]) => snapshot);
}

export type MonthOverMonthNetWorthChange = {
  monthKey: string;
  netWorthMinorUnits: number;
  changeMinorUnits: number;
  /** null when the previous month's net worth was 0 (a meaningless ratio) or there is no previous month at all. */
  changePercentage: number | null;
};

/** Month-over-month change computed only from real, previously-recorded snapshots — never interpolated or projected for a month with no snapshot. */
export function computeMonthOverMonthChange(
  snapshots: readonly NetWorthSnapshotPoint[],
): MonthOverMonthNetWorthChange[] {
  const monthly = selectLatestSnapshotPerMonth(snapshots);
  return monthly.map((snapshot, index) => {
    const monthKey = snapshot.asOfDate.slice(0, 7);
    const previous = index > 0 ? monthly[index - 1] : undefined;
    if (!previous) {
      return {
        monthKey,
        netWorthMinorUnits: snapshot.netWorthMinorUnits,
        changeMinorUnits: 0,
        changePercentage: null,
      };
    }
    const changeMinorUnits =
      snapshot.netWorthMinorUnits - previous.netWorthMinorUnits;
    const changePercentage =
      previous.netWorthMinorUnits !== 0
        ? (changeMinorUnits / Math.abs(previous.netWorthMinorUnits)) * 100
        : null;
    return {
      monthKey,
      netWorthMinorUnits: snapshot.netWorthMinorUnits,
      changeMinorUnits,
      changePercentage,
    };
  });
}

export type ContributionVsValuationChange = {
  /** Net new money actually put in (or taken out, if negative) during the period — a real, transaction-derived fact, never inferred from the value change alone. */
  contributionMinorUnits: number;
  /** Whatever part of the value change isn't explained by net contributions — market movement, not a fabricated split. */
  valuationChangeMinorUnits: number;
};

/**
 * Decomposes an investments value change between two points into the part
 * that came from real net contributions (deposits minus withdrawals, from
 * actual investment_transactions) versus market valuation movement.
 * Deliberately scoped to investments, where cost-basis tracking already
 * exists (src/lib/calculations/portfolio-performance.ts) — cash accounts
 * have no "valuation," and asset appreciation is tracked via its own
 * dated snapshot history rather than a contribution ledger.
 */
export function computeContributionVsValuationChange(
  startInvestmentsMinorUnits: number,
  endInvestmentsMinorUnits: number,
  netContributionMinorUnits: number,
): ContributionVsValuationChange {
  const totalChangeMinorUnits =
    endInvestmentsMinorUnits - startInvestmentsMinorUnits;
  return {
    contributionMinorUnits: netContributionMinorUnits,
    valuationChangeMinorUnits:
      totalChangeMinorUnits - netContributionMinorUnits,
  };
}
