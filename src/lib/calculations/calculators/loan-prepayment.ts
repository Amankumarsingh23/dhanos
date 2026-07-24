/**
 * Loan prepayment calculator — PROMPT 20. Unlike computeEmi (which derives
 * a payment from a known tenure), this calculator is given an existing EMI
 * and must derive the *remaining* tenure from it, then compare two
 * amortization runs — with and without a one-time lump-sum prepayment — to
 * report interest saved and months saved. Monthly cadence is assumed
 * throughout (an "EMI" is conventionally monthly in this app's domain; see
 * computeEmi for a calculator that supports other payment frequencies).
 *
 * Never throws: an EMI that doesn't even cover the period's interest (so
 * the balance would grow forever) or a schedule that wouldn't close out
 * within a century is reported as a typed failure, same "always a typed
 * result, never a wrong number or a crash" convention as
 * src/lib/calculations/xirr.ts.
 *
 * The amortization loop itself lives in src/lib/calculations/amortization.ts
 * (extracted for PROMPT 22, whose debt-dashboard prepayment simulator
 * needs the exact same engine against a real loan's data) — this module
 * is now just the "derive tenure from EMI, then compare two runs" layer on
 * top of it.
 */

import {
  amortizeLoan,
  type AmortizationRow,
  type AmortizationRun,
} from "@/lib/calculations/amortization";

export type LoanPrepaymentInput = {
  outstandingPrincipalMinorUnits: number;
  /** Decimal annual rate, e.g. 0.095 for 9.5%/year. */
  annualInterestRate: number;
  emiMinorUnits: number;
  /** 0 for no prepayment (the schedule then equals the original). */
  prepaymentMinorUnits: number;
  /** How many regular EMIs are paid before the lump sum lands; 0 = applied alongside the very next EMI. */
  prepaymentAfterPeriods: number;
};

export type LoanAmortizationRow = AmortizationRow;

export type LoanPrepaymentFailureReason = "invalid_input" | "does_not_amortize";

export type LoanPrepaymentResult =
  | {
      ok: true;
      originalTenureMonths: number;
      originalTotalInterestMinorUnits: number;
      newTenureMonths: number;
      newTotalInterestMinorUnits: number;
      interestSavedMinorUnits: number;
      monthsSaved: number;
      /** The amortization schedule *with* the prepayment applied. */
      schedule: LoanAmortizationRow[];
    }
  | { ok: false; reason: LoanPrepaymentFailureReason; message: string };

export function computeLoanPrepayment(
  input: LoanPrepaymentInput,
): LoanPrepaymentResult {
  if (input.outstandingPrincipalMinorUnits <= 0 || input.emiMinorUnits <= 0) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "Enter a positive outstanding principal and EMI.",
    };
  }

  const periodRate = input.annualInterestRate / 12;
  if (
    input.emiMinorUnits <=
    input.outstandingPrincipalMinorUnits * periodRate
  ) {
    return {
      ok: false,
      reason: "does_not_amortize",
      message:
        "This EMI does not even cover a month's interest, so the loan would never be paid off at this rate.",
    };
  }

  const original: AmortizationRun | null = amortizeLoan(
    input.outstandingPrincipalMinorUnits,
    periodRate,
    input.emiMinorUnits,
    new Map(),
  );
  if (!original) {
    return {
      ok: false,
      reason: "does_not_amortize",
      message:
        "This loan would take more than 100 years to pay off at this EMI — check the inputs.",
    };
  }

  const prepayments = new Map<number, number>();
  if (input.prepaymentMinorUnits > 0) {
    const period = Math.max(1, Math.round(input.prepaymentAfterPeriods) + 1);
    prepayments.set(period, input.prepaymentMinorUnits);
  }

  const withPrepayment: AmortizationRun | null = amortizeLoan(
    input.outstandingPrincipalMinorUnits,
    periodRate,
    input.emiMinorUnits,
    prepayments,
  );
  if (!withPrepayment) {
    return {
      ok: false,
      reason: "does_not_amortize",
      message:
        "Could not compute a schedule with this prepayment — check the inputs.",
    };
  }

  return {
    ok: true,
    originalTenureMonths: original.schedule.length,
    originalTotalInterestMinorUnits: original.totalInterestMinorUnits,
    newTenureMonths: withPrepayment.schedule.length,
    newTotalInterestMinorUnits: withPrepayment.totalInterestMinorUnits,
    interestSavedMinorUnits:
      original.totalInterestMinorUnits - withPrepayment.totalInterestMinorUnits,
    monthsSaved: original.schedule.length - withPrepayment.schedule.length,
    schedule: withPrepayment.schedule,
  };
}
