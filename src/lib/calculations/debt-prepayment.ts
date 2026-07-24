/**
 * The debt dashboard's prepayment simulator (PROMPT 22) — compares up to
 * four scenarios against a *real* loan's current outstanding/rate/EMI (as
 * opposed to src/lib/calculations/calculators/loan-prepayment.ts, the
 * standalone PROMPT 20 calculator that takes fully manual inputs and only
 * ever compares two runs). All four scenarios reduce to the same
 * `amortizeLoan` engine with a different effective payment-per-period or a
 * different one-time prepayment map — see `toEffectivePayment` below —
 * rather than four separate amortization loops.
 *
 * PROMPT 22: "clearly state that lender calculations may differ because
 * of fees, day-count conventions and repayment rules" — this module
 * itself has no way to express that caveat (it returns numbers, not UI),
 * so the caller (the prepayment simulator component) must render it
 * prominently next to every result this module produces.
 */

import { addMonths, formatISO, parseISO } from "date-fns";
import { amortizeLoan } from "./amortization";

export type PrepaymentScenarioInput =
  | { kind: "no_prepayment" }
  | {
      kind: "one_time_prepayment";
      prepaymentMinorUnits: number;
      /** How many regular EMIs are paid before the lump sum lands; 0 = applied alongside the very next EMI. */
      afterPeriods: number;
    }
  | { kind: "increased_emi"; newEmiMinorUnits: number }
  | { kind: "regular_extra_payment"; extraPerPeriodMinorUnits: number };

export type PrepaymentScenarioFailureReason =
  "invalid_input" | "does_not_amortize";

export type PrepaymentScenarioResult =
  | {
      ok: true;
      tenureMonths: number;
      totalInterestMinorUnits: number;
      /** YYYY-MM-DD — asOfDate advanced by tenureMonths, always labeled a projection by the caller (PROMPT 22: "revised payoff date"). */
      payoffDate: string;
    }
  | { ok: false; reason: PrepaymentScenarioFailureReason; message: string };

function toEffectivePayment(
  currentEmiMinorUnits: number,
  scenario: PrepaymentScenarioInput,
): { paymentMinorUnits: number; onceOffPrepayments: Map<number, number> } {
  switch (scenario.kind) {
    case "no_prepayment":
      return {
        paymentMinorUnits: currentEmiMinorUnits,
        onceOffPrepayments: new Map(),
      };
    case "one_time_prepayment": {
      const onceOffPrepayments = new Map<number, number>();
      if (scenario.prepaymentMinorUnits > 0) {
        onceOffPrepayments.set(
          Math.max(1, Math.round(scenario.afterPeriods) + 1),
          scenario.prepaymentMinorUnits,
        );
      }
      return { paymentMinorUnits: currentEmiMinorUnits, onceOffPrepayments };
    }
    case "increased_emi":
      return {
        paymentMinorUnits: scenario.newEmiMinorUnits,
        onceOffPrepayments: new Map(),
      };
    case "regular_extra_payment":
      return {
        paymentMinorUnits:
          currentEmiMinorUnits + scenario.extraPerPeriodMinorUnits,
        onceOffPrepayments: new Map(),
      };
  }
}

/**
 * Runs one scenario against a loan's current state. `asOfDate` is the
 * simulation's starting point (typically today) — the payoff date is
 * computed relative to it, never relative to the loan's original start
 * date, since a simulation always begins from where the loan actually
 * stands right now.
 */
export function computePrepaymentScenario(
  outstandingPrincipalMinorUnits: number,
  annualInterestRate: number,
  currentEmiMinorUnits: number,
  asOfDate: string,
  scenario: PrepaymentScenarioInput,
): PrepaymentScenarioResult {
  if (outstandingPrincipalMinorUnits <= 0) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "This loan has no outstanding balance to simulate against.",
    };
  }
  if (currentEmiMinorUnits <= 0) {
    return {
      ok: false,
      reason: "invalid_input",
      message:
        "This loan has no EMI set, so a simulation needs one entered first.",
    };
  }

  const { paymentMinorUnits, onceOffPrepayments } = toEffectivePayment(
    currentEmiMinorUnits,
    scenario,
  );
  if (paymentMinorUnits <= 0) {
    return {
      ok: false,
      reason: "invalid_input",
      message: "Enter a positive payment amount.",
    };
  }

  const monthlyRate = annualInterestRate / 12;
  if (paymentMinorUnits <= outstandingPrincipalMinorUnits * monthlyRate) {
    return {
      ok: false,
      reason: "does_not_amortize",
      message:
        "This payment amount does not even cover a month's interest, so the loan would never be paid off.",
    };
  }

  const run = amortizeLoan(
    outstandingPrincipalMinorUnits,
    monthlyRate,
    paymentMinorUnits,
    onceOffPrepayments,
  );
  if (!run) {
    return {
      ok: false,
      reason: "does_not_amortize",
      message:
        "This loan would take more than 100 years to pay off at this payment amount — check the inputs.",
    };
  }

  const tenureMonths = run.schedule.length;
  const payoffDate = formatISO(addMonths(parseISO(asOfDate), tenureMonths), {
    representation: "date",
  });

  return {
    ok: true,
    tenureMonths,
    totalInterestMinorUnits: run.totalInterestMinorUnits,
    payoffDate,
  };
}

export type PrepaymentComparison = {
  baseline: PrepaymentScenarioResult;
  scenario: PrepaymentScenarioResult;
  /** null when either run failed to converge — never a fabricated number. */
  interestSavedMinorUnits: number | null;
  tenureReducedMonths: number | null;
};

/**
 * Compares "no prepayment" (the baseline every other scenario is judged
 * against) with the requested scenario. PROMPT 22: "estimated interest
 * saved / estimated tenure reduced / revised payoff date" all come from
 * this one comparison.
 */
export function comparePrepaymentScenarios(
  outstandingPrincipalMinorUnits: number,
  annualInterestRate: number,
  currentEmiMinorUnits: number,
  asOfDate: string,
  scenario: PrepaymentScenarioInput,
): PrepaymentComparison {
  const baseline = computePrepaymentScenario(
    outstandingPrincipalMinorUnits,
    annualInterestRate,
    currentEmiMinorUnits,
    asOfDate,
    { kind: "no_prepayment" },
  );
  const scenarioResult = computePrepaymentScenario(
    outstandingPrincipalMinorUnits,
    annualInterestRate,
    currentEmiMinorUnits,
    asOfDate,
    scenario,
  );

  const bothConverged = baseline.ok && scenarioResult.ok;

  return {
    baseline,
    scenario: scenarioResult,
    interestSavedMinorUnits: bothConverged
      ? baseline.totalInterestMinorUnits -
        scenarioResult.totalInterestMinorUnits
      : null,
    tenureReducedMonths: bothConverged
      ? baseline.tenureMonths - scenarioResult.tenureMonths
      : null,
  };
}
