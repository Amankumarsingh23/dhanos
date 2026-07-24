/**
 * Pure aggregation behind the liabilities register (PROMPT 24). No
 * database access — takes already-fetched rows (liabilities + their
 * effective payments, see src/lib/calculations/liability-outstanding.ts)
 * so every figure is independently unit-testable.
 *
 * **"Integrate with total debt but keep institutional and informal debt
 * distinguishable"** (PROMPT 24 acceptance criterion): `computeLiabilityTotals`
 * always reports informal-borrowing and general-obligation outstanding as
 * two separate figures alongside their sum — a caller combining this with
 * `loans`' own `getDebtSummary` (institutional debt) must add three
 * clearly-labeled numbers, never a single blended one.
 *
 * **"Do not mix estimates with legally confirmed obligations without
 * labels"**: `totalEstimatedOutstandingMinorUnits` is always broken out
 * separately from the confirmed total, never silently folded in.
 */

const CURRENTLY_OWED_STATUSES = [
  "active",
  "partially_paid",
  "disputed",
] as const;

export type LiabilityForTotals = {
  currencyCode: string;
  status: string;
  liabilitySource: "informal_borrowing" | "general_obligation";
  category: string;
  certainty: "confirmed" | "estimated";
  outstandingMinorUnits: number;
};

export type LiabilityTotals = {
  currencyCode: string;
  totalInformalOutstandingMinorUnits: number;
  totalGeneralOutstandingMinorUnits: number;
  /** Sum of the two above — informal borrowing and general obligations combined, still a labeled figure rather than blended with institutional (loan) debt. */
  totalOutstandingMinorUnits: number;
  /** The slice of totalOutstandingMinorUnits that comes from certainty = 'estimated' rows — always shown separately, never folded silently into the confirmed total. */
  totalEstimatedOutstandingMinorUnits: number;
  currentlyOwedCount: number;
  estimatedCount: number;
};

/** Filters to `currencyCode` and currently-owed statuses (active/partially_paid/disputed — paid/waived excluded) internally, same convention as debt-metrics.ts/lending-metrics.ts. */
export function computeLiabilityTotals(
  liabilities: readonly LiabilityForTotals[],
  currencyCode: string,
): LiabilityTotals {
  const currentlyOwed = liabilities.filter(
    (liability) =>
      liability.currencyCode === currencyCode &&
      (CURRENTLY_OWED_STATUSES as readonly string[]).includes(liability.status),
  );
  const informal = currentlyOwed.filter(
    (liability) => liability.liabilitySource === "informal_borrowing",
  );
  const general = currentlyOwed.filter(
    (liability) => liability.liabilitySource === "general_obligation",
  );
  const estimated = currentlyOwed.filter(
    (liability) => liability.certainty === "estimated",
  );

  const totalInformalOutstandingMinorUnits = informal.reduce(
    (sum, liability) => sum + liability.outstandingMinorUnits,
    0,
  );
  const totalGeneralOutstandingMinorUnits = general.reduce(
    (sum, liability) => sum + liability.outstandingMinorUnits,
    0,
  );

  return {
    currencyCode,
    totalInformalOutstandingMinorUnits,
    totalGeneralOutstandingMinorUnits,
    totalOutstandingMinorUnits:
      totalInformalOutstandingMinorUnits + totalGeneralOutstandingMinorUnits,
    totalEstimatedOutstandingMinorUnits: estimated.reduce(
      (sum, liability) => sum + liability.outstandingMinorUnits,
      0,
    ),
    currentlyOwedCount: currentlyOwed.length,
    estimatedCount: estimated.length,
  };
}

export type LiabilityCategoryRow = {
  key: string;
  outstandingMinorUnits: number;
  liabilityCount: number;
};

/** Outstanding grouped by category, currently-owed liabilities in `currencyCode` only, highest first. */
export function groupLiabilitiesByCategory(
  liabilities: readonly LiabilityForTotals[],
  currencyCode: string,
): LiabilityCategoryRow[] {
  const currentlyOwed = liabilities.filter(
    (liability) =>
      liability.currencyCode === currencyCode &&
      (CURRENTLY_OWED_STATUSES as readonly string[]).includes(liability.status),
  );
  const rows = new Map<string, LiabilityCategoryRow>();
  for (const liability of currentlyOwed) {
    const existing = rows.get(liability.category) ?? {
      key: liability.category,
      outstandingMinorUnits: 0,
      liabilityCount: 0,
    };
    existing.outstandingMinorUnits += liability.outstandingMinorUnits;
    existing.liabilityCount += 1;
    rows.set(liability.category, existing);
  }
  return [...rows.values()].sort(
    (a, b) => b.outstandingMinorUnits - a.outstandingMinorUnits,
  );
}

export type CombinedDebtBreakdown = {
  currencyCode: string;
  institutionalOutstandingMinorUnits: number;
  informalOutstandingMinorUnits: number;
  generalObligationOutstandingMinorUnits: number;
  totalDebtMinorUnits: number;
};

/**
 * Combines loans' (institutional) outstanding total with this module's
 * informal/general totals into one "total debt" figure that still keeps
 * every source individually visible — the concrete enforcement of PROMPT
 * 24's "integrate with total debt but keep institutional and informal debt
 * distinguishable."
 */
export function computeCombinedDebtBreakdown(
  institutionalOutstandingMinorUnits: number,
  liabilityTotals: LiabilityTotals,
): CombinedDebtBreakdown {
  return {
    currencyCode: liabilityTotals.currencyCode,
    institutionalOutstandingMinorUnits,
    informalOutstandingMinorUnits:
      liabilityTotals.totalInformalOutstandingMinorUnits,
    generalObligationOutstandingMinorUnits:
      liabilityTotals.totalGeneralOutstandingMinorUnits,
    totalDebtMinorUnits:
      institutionalOutstandingMinorUnits +
      liabilityTotals.totalOutstandingMinorUnits,
  };
}
