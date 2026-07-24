import { describe, expect, it } from "vitest";
import {
  classifyLiquidity,
  classifyRisk,
  computeAbsoluteReturn,
  computeHoldingCostBasis,
  computeUnrealizedGainLoss,
  type HoldingTransactionInput,
} from "./portfolio-performance";

function tx(
  overrides: Partial<HoldingTransactionInput> &
    Pick<HoldingTransactionInput, "transactionType" | "amountMinorUnits">,
): HoldingTransactionInput {
  return {
    transactionDate: "2026-01-01",
    quantity: null,
    feeMinorUnits: null,
    ...overrides,
  };
}

describe("computeHoldingCostBasis", () => {
  it("a contribution-only holding has no gain/loss yet", () => {
    const result = computeHoldingCostBasis([
      tx({ transactionType: "contribution", amountMinorUnits: 100000 }),
      tx({
        transactionType: "contribution",
        amountMinorUnits: 100000,
        transactionDate: "2026-02-01",
      }),
    ]);
    expect(result.totalContributedMinorUnits).toBe(200000);
    expect(result.remainingCostBasisMinorUnits).toBe(200000);
    expect(result.realizedGainLossMinorUnits).toBe(0);
    expect(result.totalWithdrawnMinorUnits).toBe(0);
  });

  it("a full sale at a gain realizes exactly the gain, leaving no cost basis behind", () => {
    const result = computeHoldingCostBasis([
      tx({
        transactionType: "purchase",
        amountMinorUnits: 500000, // ₹5000 for 100 units @ ₹50
        quantity: 100,
        transactionDate: "2026-01-01",
      }),
      tx({
        transactionType: "sale",
        amountMinorUnits: 800000, // sold all 100 units @ ₹80 = ₹8000
        quantity: 100,
        transactionDate: "2026-06-01",
      }),
    ]);
    expect(result.realizedGainLossMinorUnits).toBe(300000); // 8000 - 5000
    expect(result.remainingCostBasisMinorUnits).toBe(0);
    expect(result.remainingUnits).toBe(0);
    expect(result.hasQuantity).toBe(true);
  });

  it("weighted-average cost basis across two purchases at different prices, then a partial sale", () => {
    const result = computeHoldingCostBasis([
      // 100 units @ ₹50 = ₹5000
      tx({
        transactionType: "purchase",
        amountMinorUnits: 500000,
        quantity: 100,
        transactionDate: "2026-01-01",
      }),
      // 100 units @ ₹70 = ₹7000 -> running: 200 units, ₹12000 cost, avg ₹60/unit
      tx({
        transactionType: "purchase",
        amountMinorUnits: 700000,
        quantity: 100,
        transactionDate: "2026-02-01",
      }),
      // sell 50 units @ ₹90 = ₹4500; cost basis removed = 50/200 * 12000 = ₹3000
      tx({
        transactionType: "sale",
        amountMinorUnits: 450000,
        quantity: 50,
        transactionDate: "2026-06-01",
      }),
    ]);
    // realized gain = 4500 - 3000 = 1500
    expect(result.realizedGainLossMinorUnits).toBe(150000);
    // remaining: 150 units, cost basis 12000 - 3000 = 9000
    expect(result.remainingUnits).toBe(150);
    expect(result.remainingCostBasisMinorUnits).toBe(900000);
  });

  it("a lump-sum asset (no quantity) treats amount as its own unit count for proportional withdrawal", () => {
    const result = computeHoldingCostBasis([
      tx({ transactionType: "contribution", amountMinorUnits: 1000000 }), // ₹10,000 FD
      tx({
        transactionType: "withdrawal",
        amountMinorUnits: 400000, // ₹4,000 principal-only withdrawal (40%)
        transactionDate: "2026-06-01",
      }),
    ]);
    expect(result.hasQuantity).toBe(false);
    // A principal-only withdrawal at the same proportion realizes no gain.
    expect(result.realizedGainLossMinorUnits).toBe(0);
    expect(result.remainingCostBasisMinorUnits).toBe(600000);
  });

  it("interest on a lump-sum asset is income, never conflated with the principal withdrawal's realized gain", () => {
    const result = computeHoldingCostBasis([
      tx({ transactionType: "contribution", amountMinorUnits: 1000000 }),
      tx({
        transactionType: "interest",
        amountMinorUnits: 65000,
        transactionDate: "2026-12-31",
      }),
      tx({
        transactionType: "withdrawal",
        amountMinorUnits: 1000000, // principal recovered in full at maturity
        transactionDate: "2027-01-01",
      }),
    ]);
    expect(result.incomeReceivedMinorUnits).toBe(65000);
    expect(result.realizedGainLossMinorUnits).toBe(0);
    expect(result.remainingCostBasisMinorUnits).toBe(0);
  });

  it("sums both inline transaction fees and standalone fee rows", () => {
    const result = computeHoldingCostBasis([
      tx({
        transactionType: "purchase",
        amountMinorUnits: 500000,
        quantity: 100,
        feeMinorUnits: 2000, // brokerage on the purchase
      }),
      tx({
        transactionType: "fee",
        amountMinorUnits: 5000, // a standalone annual AMC charge
        transactionDate: "2026-12-01",
      }),
    ]);
    expect(result.totalFeesMinorUnits).toBe(7000);
  });
});

describe("computeUnrealizedGainLoss", () => {
  it("returns null when there is no valuation to compare against — never a fabricated zero", () => {
    expect(computeUnrealizedGainLoss(null, 500000)).toBeNull();
  });

  it("computes current value minus remaining cost basis", () => {
    expect(computeUnrealizedGainLoss(650000, 500000)).toBe(150000);
    expect(computeUnrealizedGainLoss(400000, 500000)).toBe(-100000);
  });
});

describe("computeAbsoluteReturn", () => {
  it("returns null when unrealized gain/loss is unknown", () => {
    expect(
      computeAbsoluteReturn({
        realizedGainLossMinorUnits: 1000,
        unrealizedGainLossMinorUnits: null,
        incomeReceivedMinorUnits: 500,
        totalFeesMinorUnits: 100,
      }),
    ).toBeNull();
  });

  it("sums realized + unrealized + income, minus fees", () => {
    expect(
      computeAbsoluteReturn({
        realizedGainLossMinorUnits: 150000,
        unrealizedGainLossMinorUnits: 150000,
        incomeReceivedMinorUnits: 65000,
        totalFeesMinorUnits: 7000,
      }),
    ).toBe(358000);
  });
});

describe("classifyLiquidity / classifyRisk", () => {
  it("classifies known asset classes", () => {
    expect(classifyLiquidity("stock")).toBe("liquid");
    expect(classifyLiquidity("real_estate")).toBe("illiquid");
    expect(classifyRisk("fixed_deposit")).toBe("low");
    expect(classifyRisk("crypto")).toBe("high");
  });

  it("falls back to a middle default for an unrecognized asset class rather than guessing an extreme", () => {
    expect(classifyLiquidity("other")).toBe("semi_liquid");
    expect(classifyRisk("other")).toBe("medium");
    expect(classifyLiquidity("something_new")).toBe("semi_liquid");
    expect(classifyRisk("something_new")).toBe("medium");
  });
});
