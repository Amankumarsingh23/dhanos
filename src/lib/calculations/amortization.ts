/**
 * Shared amortizing-loan schedule engine. Originally private to the
 * standalone loan-prepayment calculator (PROMPT 20's
 * src/lib/calculations/calculators/loan-prepayment.ts), extracted here so
 * PROMPT 22's debt-dashboard prepayment simulator
 * (src/lib/calculations/debt-prepayment.ts) can reuse the exact same
 * amortization loop rather than a second, possibly-drifting copy. Monthly
 * cadence throughout — an "EMI" is conventionally monthly in this app's
 * domain (see loan-prepayment.ts's own note on this).
 */

/** A monthly amortization running longer than this (100 years) is treated as non-convergent, not an infinite loop. */
const MAX_PERIODS = 1200;

export type AmortizationRow = {
  periodIndex: number;
  openingBalanceMinorUnits: number;
  paymentMinorUnits: number;
  interestComponentMinorUnits: number;
  principalComponentMinorUnits: number;
  prepaymentMinorUnits: number;
  closingBalanceMinorUnits: number;
};

export type AmortizationRun = {
  schedule: AmortizationRow[];
  totalInterestMinorUnits: number;
};

/**
 * Runs a fixed monthly payment against a principal at a fixed monthly
 * rate, applying any one-time prepayments keyed by period index, until the
 * balance reaches zero. Returns `null` — never throws — when the payment
 * doesn't even cover a period's interest, or the schedule wouldn't close
 * out within a century; both are non-convergence cases the caller must
 * handle explicitly, same "typed result, never a wrong number or a crash"
 * convention as src/lib/calculations/xirr.ts. The final period's principal
 * component always absorbs whatever balance remains, so accumulated
 * rounding can never leave a stray minor-unit balance outstanding.
 */
export function amortizeLoan(
  principalMinorUnits: number,
  monthlyRate: number,
  paymentMinorUnits: number,
  onceOffPrepayments: ReadonlyMap<number, number> = new Map(),
): AmortizationRun | null {
  const schedule: AmortizationRow[] = [];
  let balance = principalMinorUnits;
  let totalInterest = 0;
  let period = 0;

  while (balance > 0 && period < MAX_PERIODS) {
    period += 1;
    const interestComponent = balance * monthlyRate;
    let principalComponent = paymentMinorUnits - interestComponent;
    if (principalComponent <= 0) {
      return null;
    }

    let closingBalance = balance - principalComponent;
    let actualPayment = paymentMinorUnits;
    if (closingBalance < 0) {
      principalComponent = balance;
      closingBalance = 0;
      actualPayment = principalComponent + interestComponent;
    }

    const scheduledPrepayment = onceOffPrepayments.get(period) ?? 0;
    const appliedPrepayment = Math.min(scheduledPrepayment, closingBalance);
    closingBalance -= appliedPrepayment;

    schedule.push({
      periodIndex: period,
      openingBalanceMinorUnits: Math.round(balance),
      paymentMinorUnits: Math.round(actualPayment),
      interestComponentMinorUnits: Math.round(interestComponent),
      principalComponentMinorUnits: Math.round(principalComponent),
      prepaymentMinorUnits: Math.round(appliedPrepayment),
      closingBalanceMinorUnits: Math.round(closingBalance),
    });

    totalInterest += interestComponent;
    balance = closingBalance;
  }

  if (balance > 0) {
    return null;
  }

  return { schedule, totalInterestMinorUnits: Math.round(totalInterest) };
}
