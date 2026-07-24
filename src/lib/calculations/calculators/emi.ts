/**
 * EMI (equated periodic installment) calculator — PROMPT 20. Standard
 * amortizing-loan formula:
 *
 *   payment = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *
 * where `r` is the *periodic* rate (annual rate / payments-per-year) and
 * `n` is the total number of payments. When `r` is 0 (an interest-free
 * loan), the formula degenerates to a plain `P / n` — handled as an
 * explicit branch below rather than dividing by zero.
 *
 * The full amortization schedule is also returned so principal and
 * interest stay distinguishable per docs/money-calculation-rules.md §2
 * ("loan principal and loan interest must be distinguishable"). The final
 * row's principal component is forced to exactly close out the remaining
 * balance, so accumulated per-period rounding can never leave a stray
 * minor-unit balance outstanding after the "last" payment.
 */

export type EmiPaymentFrequency = "weekly" | "monthly" | "quarterly";

export const EMI_PERIODS_PER_YEAR: Record<EmiPaymentFrequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
};

export type EmiInput = {
  principalMinorUnits: number;
  /** Decimal annual rate, e.g. 0.09 for 9%/year. */
  annualInterestRate: number;
  tenureYears: number;
  paymentFrequency: EmiPaymentFrequency;
};

export type EmiScheduleRow = {
  periodIndex: number;
  openingBalanceMinorUnits: number;
  paymentMinorUnits: number;
  principalComponentMinorUnits: number;
  interestComponentMinorUnits: number;
  closingBalanceMinorUnits: number;
};

export type EmiResult = {
  paymentMinorUnits: number;
  totalPayments: number;
  totalInterestMinorUnits: number;
  totalPaymentMinorUnits: number;
  schedule: EmiScheduleRow[];
};

const EMPTY_RESULT: EmiResult = {
  paymentMinorUnits: 0,
  totalPayments: 0,
  totalInterestMinorUnits: 0,
  totalPaymentMinorUnits: 0,
  schedule: [],
};

export function computeEmi(input: EmiInput): EmiResult {
  const periodsPerYear = EMI_PERIODS_PER_YEAR[input.paymentFrequency];
  const totalPayments = Math.max(
    0,
    Math.round(input.tenureYears * periodsPerYear),
  );

  if (totalPayments <= 0 || input.principalMinorUnits <= 0) {
    return EMPTY_RESULT;
  }

  const periodRate = input.annualInterestRate / periodsPerYear;
  const payment =
    periodRate === 0
      ? input.principalMinorUnits / totalPayments
      : (input.principalMinorUnits *
          periodRate *
          Math.pow(1 + periodRate, totalPayments)) /
        (Math.pow(1 + periodRate, totalPayments) - 1);

  const schedule: EmiScheduleRow[] = [];
  let balance = input.principalMinorUnits;

  for (let period = 1; period <= totalPayments; period++) {
    const interestComponent = balance * periodRate;
    const isLastPayment = period === totalPayments;
    const principalComponent = isLastPayment
      ? balance
      : payment - interestComponent;
    const closingBalance = isLastPayment ? 0 : balance - principalComponent;
    const periodPayment = isLastPayment
      ? principalComponent + interestComponent
      : payment;

    schedule.push({
      periodIndex: period,
      openingBalanceMinorUnits: Math.round(balance),
      paymentMinorUnits: Math.round(periodPayment),
      principalComponentMinorUnits: Math.round(principalComponent),
      interestComponentMinorUnits: Math.round(interestComponent),
      closingBalanceMinorUnits: Math.round(closingBalance),
    });

    balance = closingBalance;
  }

  const totalInterestMinorUnits = schedule.reduce(
    (sum, row) => sum + row.interestComponentMinorUnits,
    0,
  );
  const totalPaymentMinorUnits = schedule.reduce(
    (sum, row) => sum + row.paymentMinorUnits,
    0,
  );

  return {
    paymentMinorUnits: Math.round(payment),
    totalPayments,
    totalInterestMinorUnits,
    totalPaymentMinorUnits,
    schedule,
  };
}
