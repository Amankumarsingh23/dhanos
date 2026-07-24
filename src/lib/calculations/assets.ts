/**
 * Pure arithmetic behind the asset register (PROMPT 27). No database
 * access, so every function here is fully unit-testable in isolation.
 *
 * Unlike investments/loans, an asset has no "outstanding" concept — what
 * this module computes instead:
 *
 *  - **Owned value** — an asset's latest valuation, scaled by this
 *    household's `ownership_percentage`. Always applied, never assumed to
 *    be 100% (PROMPT 27: "ownership percentages are supported").
 *  - **Net-worth contribution** — owned value, or 0 when the asset is
 *    excluded (`include_in_net_worth = false`) or its ownership is
 *    disputed/expected (PROMPT 27: "disputed or expected property is not
 *    presented as fully owned" — these two statuses are never counted
 *    toward net worth, regardless of the include flag).
 *
 * A related loan's outstanding balance is deliberately **not** computed
 * here — it is read via `src/lib/calculations/loan-outstanding.ts`
 * unchanged and shown as its own separate figure (PROMPT 27: "attached
 * debt remains separate"), never subtracted from an asset's value by
 * anything in this module.
 */

export type OwnershipStatus =
  | "confirmed"
  | "shared"
  | "transfer_pending"
  | "documentation_incomplete"
  | "disputed"
  | "expected"
  | "unknown";

/** Only these two statuses trigger PROMPT 27's "not presented as fully owned" rule — every other status is still scaled by ownership_percentage like normal, just not zeroed out. */
export function isOwnershipUncertain(status: OwnershipStatus): boolean {
  return status === "disputed" || status === "expected";
}

/** Rounds to the nearest whole minor unit — ownership_percentage is a plain numeric (e.g. 33.33), so the product isn't guaranteed integral. */
export function computeOwnedValueMinorUnits(
  valueMinorUnits: number,
  ownershipPercentage: number,
): number {
  return Math.round((valueMinorUnits * ownershipPercentage) / 100);
}

export type NetWorthContributionInput = {
  valueMinorUnits: number;
  ownershipPercentage: number;
  ownershipStatus: OwnershipStatus;
  includeInNetWorth: boolean;
};

/** 0 when excluded or ownership is uncertain — otherwise the owned value. See module doc for the full rule. */
export function computeNetWorthContributionMinorUnits(
  input: NetWorthContributionInput,
): number {
  if (!input.includeInNetWorth || isOwnershipUncertain(input.ownershipStatus)) {
    return 0;
  }
  return computeOwnedValueMinorUnits(
    input.valueMinorUnits,
    input.ownershipPercentage,
  );
}

export type ValuationConfidence =
  "verified" | "professional" | "informal_estimate" | "unverified";

/**
 * Only `verified` counts as confirmed fact — every other confidence level
 * must be rendered with an "Estimate" badge wherever the value is shown
 * (the asset list/detail "latest value" figure, the valuation history
 * table). PROMPT 28: "unverified valuations are labeled estimates."
 */
export function isValuationConfidenceVerified(
  confidence: ValuationConfidence,
): boolean {
  return confidence === "verified";
}
