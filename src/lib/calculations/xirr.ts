import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * XIRR (the money-weighted annualized rate of return for irregular cash
 * flows) — PROMPT 18: "Do not implement annualized return incorrectly...
 * document the formula, use a reliable numerical method, add extensive
 * tests, show when calculation cannot converge, label assumptions."
 *
 * ## The formula
 *
 * XIRR is the rate `r` that satisfies:
 *
 *   sum_i [ CF_i / (1 + r) ^ ((d_i - d_0) / 365) ] = 0
 *
 * where `d_0` is the date of the first cash flow, `d_i`/`CF_i` are each
 * cash flow's date and signed amount (negative = money paid in — a
 * contribution/purchase/fee; positive = money received — a sale,
 * withdrawal, dividend, interest, or, for an as-of-today calculation, the
 * portfolio/holding's *current value* treated as a final hypothetical
 * liquidation on that date). This is the exact definition Excel's XIRR
 * function uses (actual/365 day count, not 365.25 or actual/actual) — see
 * `computePortfolioXirr` in src/features/investments/queries.ts for how
 * the current-value cash flow is added.
 *
 * ## Numerical method
 *
 * There is no closed-form solution — `r` is found by root-finding on
 * `xnpv(r) = 0`. This implementation is a hybrid, in order of attempt:
 *
 *   1. **Newton-Raphson** (fast, quadratic convergence near the root),
 *      using the analytic derivative (`xnpvDerivative`). Aborted early if
 *      a step produces a non-finite value, the derivative is ~0 (a flat
 *      spot Newton can't step off), or the next rate would be ≤ -1 (an
 *      invalid rate — `(1+r)` would be ≤ 0, undefined for a fractional
 *      exponent).
 *   2. **Bisection fallback**, only reached if Newton-Raphson didn't
 *      converge: scans a wide, bounded rate range (-99% to +1000%) for a
 *      sign change in `xnpv`, then bisects within that bracket. Bisection
 *      always converges *if* a bracket exists — it's the robustness
 *      backstop Newton-Raphson alone can't guarantee.
 *
 * Both methods are capped at `maxIterations` (default 100) and a
 * tolerance (default 1e-7 on `|xnpv(r)|`) — this function never loops
 * unbounded, and always returns a typed result rather than throwing, so a
 * caller can render "could not be calculated" instead of a wrong number
 * or a crash (PROMPT 18: "show when calculation cannot converge").
 *
 * ## Assumptions this function does NOT verify for you
 *
 * - Every cash flow must already be net of any conversion the caller
 *   wants reflected — this function performs no currency conversion; all
 *   cash flows must already be in one currency (see
 *   docs/money-calculation-rules.md §1 and this app's broader "never
 *   combine currencies without an explicit conversion" rule).
 * - A rate is found, not validated as "reasonable" — an XIRR of e.g.
 *   +500% from a short, volatile cash-flow history is mathematically
 *   correct but should be *displayed* with context (a short history makes
 *   any annualized rate unstable), not treated as a dependable forecast.
 *   See docs/money-calculation-rules.md §4 ("projections are assumptions,
 *   not facts").
 */

const DAYS_PER_YEAR = 365;

export type CashFlow = {
  /** YYYY-MM-DD. */
  date: string;
  /** Signed — negative for money paid in, positive for money received. Any consistent unit (minor units recommended) since only the rate, not the absolute NPV, is returned. */
  amountMinorUnits: number;
};

export type NonConvergenceReason =
  | "insufficient_cash_flows"
  | "no_sign_change"
  | "same_date_cash_flows"
  | "no_bracket_found"
  | "max_iterations_exceeded";

export type XirrResult =
  | { converged: true; rate: number; iterations: number }
  | { converged: false; reason: NonConvergenceReason };

/** Human-readable explanation for each non-convergence reason — for UI display, never a raw enum value. */
export const XIRR_NON_CONVERGENCE_MESSAGES: Record<
  NonConvergenceReason,
  string
> = {
  insufficient_cash_flows:
    "Not enough recorded activity yet — at least two cash flows on different dates are needed.",
  no_sign_change:
    "All cash flows point the same direction (e.g. only contributions, no current value yet) — an annualized return isn't defined until money has both gone in and could come out.",
  same_date_cash_flows:
    "Every cash flow is on the same date — there's no time elapsed to annualize a return over.",
  no_bracket_found:
    "No plausible annual rate (from -99% to +1000%) fits this activity — the figures may be unusual or incomplete.",
  max_iterations_exceeded:
    "The calculation did not converge within the allowed iterations.",
};

type TimedFlow = { years: number; amount: number };

function toTimedFlows(cashFlows: readonly CashFlow[]): TimedFlow[] {
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const epoch = parseISO(sorted[0]!.date);
  return sorted.map((cf) => ({
    years: differenceInCalendarDays(parseISO(cf.date), epoch) / DAYS_PER_YEAR,
    amount: cf.amountMinorUnits,
  }));
}

/** The net present value of `flows` at annual rate `rate` — the function XIRR finds the root of. Exported for self-consistency testing and for a caller that wants to display "at this rate, the NPV would be X". */
export function computeXnpv(rate: number, flows: readonly TimedFlow[]): number {
  return flows.reduce(
    (sum, flow) => sum + flow.amount / Math.pow(1 + rate, flow.years),
    0,
  );
}

function computeXnpvDerivative(
  rate: number,
  flows: readonly TimedFlow[],
): number {
  return flows.reduce((sum, flow) => {
    if (flow.years === 0) {
      return sum;
    }
    return (
      sum - (flow.years * flow.amount) / Math.pow(1 + rate, flow.years + 1)
    );
  }, 0);
}

const MIN_VALID_RATE = -0.999999;
const BISECTION_SCAN_LOW = -0.99;
const BISECTION_SCAN_HIGH = 10; // +1000%/yr — generous upper bound for volatile short histories
const BISECTION_SCAN_STEPS = 2000;

function bisectionFallback(
  flows: readonly TimedFlow[],
  tolerance: number,
  maxIterations: number,
): XirrResult {
  let previousRate = BISECTION_SCAN_LOW;
  let previousValue = computeXnpv(previousRate, flows);
  let bracketLow: number | null = null;
  let bracketHigh: number | null = null;

  const step =
    (BISECTION_SCAN_HIGH - BISECTION_SCAN_LOW) / BISECTION_SCAN_STEPS;
  for (let i = 1; i <= BISECTION_SCAN_STEPS; i++) {
    const rate = BISECTION_SCAN_LOW + i * step;
    const value = computeXnpv(rate, flows);
    if (
      Number.isFinite(previousValue) &&
      Number.isFinite(value) &&
      previousValue !== 0 &&
      Math.sign(previousValue) !== Math.sign(value)
    ) {
      bracketLow = previousRate;
      bracketHigh = rate;
      break;
    }
    previousRate = rate;
    previousValue = value;
  }

  if (bracketLow === null || bracketHigh === null) {
    return { converged: false, reason: "no_bracket_found" };
  }

  let low = bracketLow;
  let high = bracketHigh;
  let lowValue = computeXnpv(low, flows);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const mid = (low + high) / 2;
    const midValue = computeXnpv(mid, flows);
    if (Math.abs(midValue) < tolerance || (high - low) / 2 < tolerance) {
      return { converged: true, rate: mid, iterations: iteration };
    }
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }

  return { converged: false, reason: "max_iterations_exceeded" };
}

export type XirrOptions = {
  guess?: number;
  maxIterations?: number;
  tolerance?: number;
};

/**
 * Solves for XIRR — see the module doc comment for the formula and
 * method. Never throws: every failure mode (too few cash flows, no sign
 * change, all same date, no root in the scanned range, non-convergence)
 * returns a typed `{ converged: false, reason }` instead.
 */
export function computeXirr(
  cashFlows: readonly CashFlow[],
  options: XirrOptions = {},
): XirrResult {
  const { guess = 0.1, maxIterations = 100, tolerance = 1e-7 } = options;

  const nonZeroFlows = cashFlows.filter((cf) => cf.amountMinorUnits !== 0);
  if (nonZeroFlows.length < 2) {
    return { converged: false, reason: "insufficient_cash_flows" };
  }

  const flows = toTimedFlows(nonZeroFlows);

  const hasPositive = flows.some((f) => f.amount > 0);
  const hasNegative = flows.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) {
    return { converged: false, reason: "no_sign_change" };
  }

  if (flows.every((f) => f.years === 0)) {
    return { converged: false, reason: "same_date_cash_flows" };
  }

  let rate = guess;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const value = computeXnpv(rate, flows);
    if (Math.abs(value) < tolerance) {
      return { converged: true, rate, iterations: iteration };
    }

    const derivative = computeXnpvDerivative(rate, flows);
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(derivative) ||
      Math.abs(derivative) < 1e-12
    ) {
      break;
    }

    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= MIN_VALID_RATE) {
      break;
    }
    rate = nextRate;
  }

  return bisectionFallback(flows, tolerance, maxIterations);
}
