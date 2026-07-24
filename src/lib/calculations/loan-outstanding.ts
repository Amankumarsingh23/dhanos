/**
 * Pure arithmetic behind the loans/debt module (PROMPT 21). No database
 * access, so every function here is fully unit-testable in isolation.
 *
 * **Outstanding principal is always derived, never a stored, mutable
 * field** — the same rule as an account's calculated balance
 * (src/lib/calculations/account-balance.ts) and a staking position's
 * current value: `outstanding = disbursedAmount - totalPrincipalPaid`,
 * floored at zero. Flooring at zero is what makes "outstanding principal
 * cannot become negative" true by construction (PROMPT 21 acceptance
 * criterion) — a payment whose principal component would otherwise push
 * the balance below zero has its excess captured separately as an
 * *overpayment*, rather than silently producing a negative outstanding
 * figure or being rejected outright.
 *
 * **Corrections use the reversal pattern, not revision-versioning** —
 * `loan_payments` is append-only (docs/money-calculation-rules.md §3), and
 * a mis-entered payment is corrected by a new row whose
 * `reversesPaymentId` points at the original (same shape as
 * `transactions.reverses_transaction_id` for refunds/transfer-reversals).
 * `selectEffectivePayments` is what removes both the original and its
 * reversal from every balance/chart computation below, so their net
 * effect is zero while both rows remain in the table forever.
 */

export type LoanPaymentForOutstanding = {
  id: string;
  reversesPaymentId: string | null;
  principalComponentMinorUnits: number;
};

/**
 * Filters out a reversed payment and its reversal row, leaving only the
 * payments that should actually count toward outstanding/charts. Order is
 * preserved.
 */
export function selectEffectivePayments<T extends LoanPaymentForOutstanding>(
  payments: readonly T[],
): T[] {
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

export type LoanOutstandingResult = {
  outstandingMinorUnits: number;
  totalPrincipalPaidMinorUnits: number;
  totalOverpaidMinorUnits: number;
};

/**
 * `disbursedAmountMinorUnits` may be `null` for a loan that hasn't been
 * disbursed yet — nothing is outstanding before money has actually moved,
 * so this returns an all-zero result rather than treating an undisbursed
 * loan as though its full original principal were already owed.
 */
export function computeLoanOutstanding(
  disbursedAmountMinorUnits: number | null,
  effectivePayments: readonly {
    principalComponentMinorUnits: number;
    overpaymentAmountMinorUnits: number;
  }[],
): LoanOutstandingResult {
  if (disbursedAmountMinorUnits === null) {
    return {
      outstandingMinorUnits: 0,
      totalPrincipalPaidMinorUnits: 0,
      totalOverpaidMinorUnits: 0,
    };
  }

  const totalPrincipalPaidMinorUnits = effectivePayments.reduce(
    (sum, payment) => sum + payment.principalComponentMinorUnits,
    0,
  );
  const totalOverpaidMinorUnits = effectivePayments.reduce(
    (sum, payment) => sum + payment.overpaymentAmountMinorUnits,
    0,
  );

  return {
    outstandingMinorUnits: Math.max(
      0,
      disbursedAmountMinorUnits - totalPrincipalPaidMinorUnits,
    ),
    totalPrincipalPaidMinorUnits,
    totalOverpaidMinorUnits,
  };
}

/**
 * The amount of a proposed principal component that would exceed the
 * loan's outstanding balance immediately before this payment — 0 for an
 * ordinary payment. The caller (recordLoanPaymentAction) must have this
 * explicitly confirmed by the user before writing a nonzero
 * `overpayment_amount_minor_units` (PROMPT 21: "cannot become negative
 * without explicit overpayment handling").
 */
export function computeOverpaymentAmount(
  outstandingBeforePaymentMinorUnits: number,
  proposedPrincipalComponentMinorUnits: number,
): number {
  return Math.max(
    0,
    proposedPrincipalComponentMinorUnits - outstandingBeforePaymentMinorUnits,
  );
}

export type LoanBalancePoint = {
  date: string;
  outstandingMinorUnits: number;
  cumulativePrincipalPaidMinorUnits: number;
  cumulativeInterestPaidMinorUnits: number;
  cumulativeFeesPaidMinorUnits: number;
  cumulativePenaltyPaidMinorUnits: number;
};

/**
 * The actual-payments-and-balances time series debt charts need (PROMPT
 * 21 acceptance criterion "debt charts use actual payments and balances")
 * — one point per effective payment, in date order, each showing the
 * running outstanding balance and cumulative components paid to date.
 * Never a projection: every point here is built only from real,
 * already-recorded `loan_payments` rows.
 */
export function computeLoanBalanceHistory(
  disbursedAmountMinorUnits: number | null,
  effectivePaymentsSortedByDate: readonly {
    paymentDate: string;
    principalComponentMinorUnits: number;
    interestComponentMinorUnits: number;
    feeComponentMinorUnits: number;
    penaltyComponentMinorUnits: number;
  }[],
): LoanBalancePoint[] {
  if (disbursedAmountMinorUnits === null) {
    return [];
  }

  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;
  let cumulativeFees = 0;
  let cumulativePenalty = 0;

  return effectivePaymentsSortedByDate.map((payment) => {
    cumulativePrincipal += payment.principalComponentMinorUnits;
    cumulativeInterest += payment.interestComponentMinorUnits;
    cumulativeFees += payment.feeComponentMinorUnits;
    cumulativePenalty += payment.penaltyComponentMinorUnits;

    return {
      date: payment.paymentDate,
      outstandingMinorUnits: Math.max(
        0,
        disbursedAmountMinorUnits - cumulativePrincipal,
      ),
      cumulativePrincipalPaidMinorUnits: cumulativePrincipal,
      cumulativeInterestPaidMinorUnits: cumulativeInterest,
      cumulativeFeesPaidMinorUnits: cumulativeFees,
      cumulativePenaltyPaidMinorUnits: cumulativePenalty,
    };
  });
}
