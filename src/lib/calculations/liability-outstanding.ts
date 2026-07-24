/**
 * Pure arithmetic behind the liabilities module (PROMPT 24). No database
 * access, so every function here is fully unit-testable in isolation —
 * mirrors src/lib/calculations/lending-outstanding.ts's shape exactly,
 * from the household's own borrower side instead of the lender's.
 *
 * **Outstanding is always derived, never a stored, mutable field** —
 * `outstanding = amount - totalPrincipalPaid`, floored at zero. A payment
 * whose principal component would otherwise push the balance below zero
 * has its excess captured separately as an *excess payment*, rather than
 * silently producing a negative outstanding figure or being rejected
 * outright.
 *
 * **Corrections use the reversal pattern, not revision-versioning** —
 * `liability_payments` is append-only, and a mis-entered payment is
 * corrected by a new row whose `reversesPaymentId` points at the original.
 * `selectEffectivePayments` is what removes both the original and its
 * reversal from every balance computation below, so their net effect is
 * zero while both rows remain in the table forever — this is what makes
 * "payment history remains auditable" (PROMPT 24 acceptance criterion) a
 * structural fact, not a convention someone could break.
 */

export type LiabilityPaymentForOutstanding = {
  id: string;
  reversesPaymentId: string | null;
  principalComponentMinorUnits: number;
};

/**
 * Filters out a reversed payment and its reversal row, leaving only the
 * payments that should actually count toward outstanding. Order is
 * preserved.
 */
export function selectEffectivePayments<
  T extends LiabilityPaymentForOutstanding,
>(payments: readonly T[]): T[] {
  const reversedIds = new Set(
    payments
      .map((payment) => payment.reversesPaymentId)
      .filter((id): id is string => id !== null),
  );
  return payments.filter(
    (payment) =>
      payment.reversesPaymentId === null && !reversedIds.has(payment.id),
  );
}

export type LiabilityOutstandingResult = {
  outstandingMinorUnits: number;
  totalPrincipalPaidMinorUnits: number;
  totalInterestPaidMinorUnits: number;
  totalExcessMinorUnits: number;
};

export function computeLiabilityOutstanding(
  amountMinorUnits: number,
  effectivePayments: readonly {
    principalComponentMinorUnits: number;
    interestComponentMinorUnits: number;
    excessAmountMinorUnits: number;
  }[],
): LiabilityOutstandingResult {
  const totalPrincipalPaidMinorUnits = effectivePayments.reduce(
    (sum, payment) => sum + payment.principalComponentMinorUnits,
    0,
  );
  const totalInterestPaidMinorUnits = effectivePayments.reduce(
    (sum, payment) => sum + payment.interestComponentMinorUnits,
    0,
  );
  const totalExcessMinorUnits = effectivePayments.reduce(
    (sum, payment) => sum + payment.excessAmountMinorUnits,
    0,
  );

  return {
    outstandingMinorUnits: Math.max(
      0,
      amountMinorUnits - totalPrincipalPaidMinorUnits,
    ),
    totalPrincipalPaidMinorUnits,
    totalInterestPaidMinorUnits,
    totalExcessMinorUnits,
  };
}

/**
 * The amount of a proposed principal component that would exceed the
 * liability's outstanding balance immediately before this payment — 0 for
 * an ordinary payment. The caller (recordLiabilityPaymentAction) must have
 * this explicitly confirmed by the user before writing a nonzero
 * `excess_amount_minor_units`.
 */
export function computeExcessPaymentAmount(
  outstandingBeforePaymentMinorUnits: number,
  proposedPrincipalComponentMinorUnits: number,
): number {
  return Math.max(
    0,
    proposedPrincipalComponentMinorUnits - outstandingBeforePaymentMinorUnits,
  );
}

export type LiabilityBalancePoint = {
  date: string;
  outstandingMinorUnits: number;
  cumulativePrincipalPaidMinorUnits: number;
  cumulativeInterestPaidMinorUnits: number;
};

/**
 * The actual-payments-and-balance time series for a liability's payment
 * history — one point per effective payment, in date order. Never a
 * projection: every point here is built only from real, already-recorded
 * `liability_payments` rows.
 */
export function computeLiabilityBalanceHistory(
  amountMinorUnits: number,
  effectivePaymentsSortedByDate: readonly {
    paymentDate: string;
    principalComponentMinorUnits: number;
    interestComponentMinorUnits: number;
  }[],
): LiabilityBalancePoint[] {
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  return effectivePaymentsSortedByDate.map((payment) => {
    cumulativePrincipal += payment.principalComponentMinorUnits;
    cumulativeInterest += payment.interestComponentMinorUnits;

    return {
      date: payment.paymentDate,
      outstandingMinorUnits: Math.max(
        0,
        amountMinorUnits - cumulativePrincipal,
      ),
      cumulativePrincipalPaidMinorUnits: cumulativePrincipal,
      cumulativeInterestPaidMinorUnits: cumulativeInterest,
    };
  });
}
