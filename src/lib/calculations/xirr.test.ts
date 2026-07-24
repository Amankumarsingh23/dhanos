import { describe, expect, it } from "vitest";
import {
  computeXirr,
  computeXnpv,
  XIRR_NON_CONVERGENCE_MESSAGES,
  type CashFlow,
} from "./xirr";

describe("computeXnpv", () => {
  it("is zero when a single-period flow exactly matches its discount rate", () => {
    // -100 now, +110 one year later, discounted at 10% -> NPV = -100 + 110/1.1 = 0
    const flows = [
      { years: 0, amount: -100 },
      { years: 1, amount: 110 },
    ];
    expect(computeXnpv(0.1, flows)).toBeCloseTo(0, 10);
  });
});

describe("computeXirr — analytically verifiable cases", () => {
  it("a single contribution and a payout exactly one non-leap year later at +20% gain", () => {
    // 2021 is not a leap year: 2021-01-01 to 2022-01-01 is exactly 365 days,
    // so (1+r)^(365/365) = 1.2 solves to r = 0.2 exactly.
    const cashFlows: CashFlow[] = [
      { date: "2021-01-01", amountMinorUnits: -1_000_000 },
      { date: "2022-01-01", amountMinorUnits: 1_200_000 },
    ];
    const result = computeXirr(cashFlows);
    expect(result.converged).toBe(true);
    if (result.converged) {
      expect(result.rate).toBeCloseTo(0.2, 6);
    }
  });

  it("a single contribution and a payout exactly one non-leap year later at a loss", () => {
    const cashFlows: CashFlow[] = [
      { date: "2021-01-01", amountMinorUnits: -1_000_000 },
      { date: "2022-01-01", amountMinorUnits: 900_000 },
    ];
    const result = computeXirr(cashFlows);
    expect(result.converged).toBe(true);
    if (result.converged) {
      expect(result.rate).toBeCloseTo(-0.1, 6);
    }
  });

  it("two non-leap years at a compounded +21% total (10% annually)", () => {
    // (1.1)^2 = 1.21 exactly.
    const cashFlows: CashFlow[] = [
      { date: "2021-01-01", amountMinorUnits: -1_000_000 },
      { date: "2023-01-01", amountMinorUnits: 1_210_000 },
    ];
    const result = computeXirr(cashFlows);
    expect(result.converged).toBe(true);
    if (result.converged) {
      expect(result.rate).toBeCloseTo(0.1, 5);
    }
  });
});

describe("computeXirr — self-consistency (NPV at the returned rate is ~0)", () => {
  function assertSelfConsistent(cashFlows: CashFlow[]) {
    const result = computeXirr(cashFlows);
    expect(result.converged).toBe(true);
    if (!result.converged) return;

    const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
    const epoch = new Date(sorted[0]!.date);
    const flows = sorted.map((cf) => ({
      years:
        (new Date(cf.date).getTime() - epoch.getTime()) /
        (1000 * 60 * 60 * 24 * 365),
      amount: cf.amountMinorUnits,
    }));
    expect(Math.abs(computeXnpv(result.rate, flows))).toBeLessThan(1);
  }

  it("a SIP-like series of monthly contributions plus a final valuation", () => {
    assertSelfConsistent([
      { date: "2026-01-05", amountMinorUnits: -500000 },
      { date: "2026-02-05", amountMinorUnits: -500000 },
      { date: "2026-03-05", amountMinorUnits: -500000 },
      { date: "2026-04-05", amountMinorUnits: -500000 },
      { date: "2026-05-05", amountMinorUnits: -500000 },
      { date: "2026-06-05", amountMinorUnits: -500000 },
      // current value as of today, treated as a hypothetical liquidation
      { date: "2026-07-22", amountMinorUnits: 3_250_000 },
    ]);
  });

  it("contributions, a partial sale, and a final valuation", () => {
    assertSelfConsistent([
      { date: "2024-01-01", amountMinorUnits: -2_000_000 },
      { date: "2024-06-01", amountMinorUnits: -1_000_000 },
      { date: "2025-03-01", amountMinorUnits: 800_000 }, // partial sale proceeds
      { date: "2026-07-22", amountMinorUnits: 2_600_000 }, // remaining current value
    ]);
  });

  it("irregular daily contributions (PhonePe-style) plus a final valuation", () => {
    const cashFlows: CashFlow[] = [];
    for (let day = 0; day < 30; day++) {
      const date = new Date(Date.UTC(2026, 5, 1 + day));
      cashFlows.push({
        date: date.toISOString().slice(0, 10),
        amountMinorUnits: -2000,
      });
    }
    cashFlows.push({ date: "2026-07-22", amountMinorUnits: 65000 });
    assertSelfConsistent(cashFlows);
  });
});

describe("computeXirr — non-convergence is reported, never thrown or silently wrong", () => {
  it("fewer than two nonzero cash flows", () => {
    expect(computeXirr([])).toEqual({
      converged: false,
      reason: "insufficient_cash_flows",
    });
    expect(
      computeXirr([{ date: "2026-01-01", amountMinorUnits: -1000 }]),
    ).toEqual({ converged: false, reason: "insufficient_cash_flows" });
    // A zero-amount row doesn't count as a real cash flow.
    expect(
      computeXirr([
        { date: "2026-01-01", amountMinorUnits: -1000 },
        { date: "2026-06-01", amountMinorUnits: 0 },
      ]),
    ).toEqual({ converged: false, reason: "insufficient_cash_flows" });
  });

  it("all cash flows the same sign — nothing to annualize a return from", () => {
    expect(
      computeXirr([
        { date: "2026-01-01", amountMinorUnits: -1000 },
        { date: "2026-06-01", amountMinorUnits: -2000 },
      ]),
    ).toEqual({ converged: false, reason: "no_sign_change" });

    expect(
      computeXirr([
        { date: "2026-01-01", amountMinorUnits: 1000 },
        { date: "2026-06-01", amountMinorUnits: 2000 },
      ]),
    ).toEqual({ converged: false, reason: "no_sign_change" });
  });

  it("every cash flow on the same date — no elapsed time to annualize over", () => {
    expect(
      computeXirr([
        { date: "2026-07-22", amountMinorUnits: -1000 },
        { date: "2026-07-22", amountMinorUnits: 1000 },
      ]),
    ).toEqual({ converged: false, reason: "same_date_cash_flows" });
  });

  it("no plausible annual rate in [-99%, +1000%] fits an extreme short-window swing", () => {
    // -100 today, +105000 the very next day: an actual 1-day 1050x return
    // annualizes to a rate far beyond the scanned bracket.
    const result = computeXirr([
      { date: "2026-01-01", amountMinorUnits: -100 },
      { date: "2026-01-02", amountMinorUnits: 105000 },
    ]);
    expect(result).toEqual({
      converged: false,
      reason: "no_bracket_found",
    });
  });

  it("reports max_iterations_exceeded rather than a wrong rate when starved of iterations", () => {
    const result = computeXirr(
      [
        { date: "2021-01-01", amountMinorUnits: -1_000_000 },
        { date: "2022-01-01", amountMinorUnits: 1_200_000 },
      ],
      { maxIterations: 1 },
    );
    expect(result).toEqual({
      converged: false,
      reason: "max_iterations_exceeded",
    });
  });

  it("every non-convergence reason has a human-readable message", () => {
    for (const reason of Object.keys(
      XIRR_NON_CONVERGENCE_MESSAGES,
    ) as (keyof typeof XIRR_NON_CONVERGENCE_MESSAGES)[]) {
      expect(XIRR_NON_CONVERGENCE_MESSAGES[reason].length).toBeGreaterThan(0);
    }
  });
});

describe("computeXirr — options", () => {
  it("converges to the same rate regardless of the initial guess", () => {
    const cashFlows: CashFlow[] = [
      { date: "2021-01-01", amountMinorUnits: -1_000_000 },
      { date: "2022-01-01", amountMinorUnits: 1_200_000 },
    ];
    const fromLowGuess = computeXirr(cashFlows, { guess: 0.01 });
    const fromHighGuess = computeXirr(cashFlows, { guess: 2 });
    expect(fromLowGuess.converged).toBe(true);
    expect(fromHighGuess.converged).toBe(true);
    if (fromLowGuess.converged && fromHighGuess.converged) {
      expect(fromLowGuess.rate).toBeCloseTo(fromHighGuess.rate, 5);
    }
  });
});
