/**
 * Pure arithmetic behind the lending/receivables module (PROMPT 23). No
 * database access, so every function here is fully unit-testable in
 * isolation — mirrors src/lib/calculations/loan-outstanding.ts's shape
 * exactly, just from the lender's side instead of the borrower's.
 *
 * **Outstanding is always derived, never a stored, mutable field** —
 * `outstanding = amountLent - totalPrincipalRecovered`, floored at zero.
 * Flooring at zero is what makes "outstanding cannot become negative" true
 * by construction — a repayment whose principal component would otherwise
 * push the balance below zero has its excess captured separately as an
 * *excess repayment*, rather than silently producing a negative outstanding
 * figure or being rejected outright.
 *
 * **Corrections use the reversal pattern, not revision-versioning** —
 * `lending_repayments` is append-only, and a mis-entered repayment is
 * corrected by a new row whose `reversesRepaymentId` points at the
 * original. `selectEffectiveRepayments` is what removes both the original
 * and its reversal from every balance/chart computation below, so their net
 * effect is zero while both rows remain in the table forever — the concrete
 * enforcement of "written-off/repaid history remains visible."
 */

export type LendingRepaymentForOutstanding = {
  id: string;
  reversesRepaymentId: string | null;
  principalComponentMinorUnits: number;
};

/**
 * Filters out a reversed repayment and its reversal row, leaving only the
 * repayments that should actually count toward outstanding/charts. Order is
 * preserved.
 */
export function selectEffectiveRepayments<
  T extends LendingRepaymentForOutstanding,
>(repayments: readonly T[]): T[] {
  const reversedIds = new Set(
    repayments
      .map((repayment) => repayment.reversesRepaymentId)
      .filter((id): id is string => id !== null),
  );
  return repayments.filter(
    (repayment) =>
      repayment.reversesRepaymentId === null && !reversedIds.has(repayment.id),
  );
}

export type LendingOutstandingResult = {
  outstandingMinorUnits: number;
  totalPrincipalRecoveredMinorUnits: number;
  totalInterestReceivedMinorUnits: number;
  totalExcessMinorUnits: number;
};

export function computeLendingOutstanding(
  amountLentMinorUnits: number,
  effectiveRepayments: readonly {
    principalComponentMinorUnits: number;
    interestComponentMinorUnits: number;
    excessAmountMinorUnits: number;
  }[],
): LendingOutstandingResult {
  const totalPrincipalRecoveredMinorUnits = effectiveRepayments.reduce(
    (sum, repayment) => sum + repayment.principalComponentMinorUnits,
    0,
  );
  const totalInterestReceivedMinorUnits = effectiveRepayments.reduce(
    (sum, repayment) => sum + repayment.interestComponentMinorUnits,
    0,
  );
  const totalExcessMinorUnits = effectiveRepayments.reduce(
    (sum, repayment) => sum + repayment.excessAmountMinorUnits,
    0,
  );

  return {
    outstandingMinorUnits: Math.max(
      0,
      amountLentMinorUnits - totalPrincipalRecoveredMinorUnits,
    ),
    totalPrincipalRecoveredMinorUnits,
    totalInterestReceivedMinorUnits,
    totalExcessMinorUnits,
  };
}

/**
 * The amount of a proposed principal component that would exceed the
 * lending's outstanding balance immediately before this repayment — 0 for
 * an ordinary repayment. The caller (recordLendingRepaymentAction) must
 * have this explicitly confirmed by the user before writing a nonzero
 * `excess_amount_minor_units` (PROMPT 23, mirroring PROMPT 21's overpayment
 * handling).
 */
export function computeExcessRepaymentAmount(
  outstandingBeforeRepaymentMinorUnits: number,
  proposedPrincipalComponentMinorUnits: number,
): number {
  return Math.max(
    0,
    proposedPrincipalComponentMinorUnits - outstandingBeforeRepaymentMinorUnits,
  );
}

export type LendingRecoveryPoint = {
  date: string;
  outstandingMinorUnits: number;
  cumulativePrincipalRecoveredMinorUnits: number;
  cumulativeInterestReceivedMinorUnits: number;
};

/**
 * The actual-recovery time series the "recovery history" view needs
 * (PROMPT 23) — one point per effective repayment, in date order, each
 * showing the running outstanding balance and cumulative principal/interest
 * recovered to date. Never a projection: every point here is built only
 * from real, already-recorded `lending_repayments` rows.
 */
export function computeLendingRecoveryHistory(
  amountLentMinorUnits: number,
  effectiveRepaymentsSortedByDate: readonly {
    repaymentDate: string;
    principalComponentMinorUnits: number;
    interestComponentMinorUnits: number;
  }[],
): LendingRecoveryPoint[] {
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  return effectiveRepaymentsSortedByDate.map((repayment) => {
    cumulativePrincipal += repayment.principalComponentMinorUnits;
    cumulativeInterest += repayment.interestComponentMinorUnits;

    return {
      date: repayment.repaymentDate,
      outstandingMinorUnits: Math.max(
        0,
        amountLentMinorUnits - cumulativePrincipal,
      ),
      cumulativePrincipalRecoveredMinorUnits: cumulativePrincipal,
      cumulativeInterestReceivedMinorUnits: cumulativeInterest,
    };
  });
}
