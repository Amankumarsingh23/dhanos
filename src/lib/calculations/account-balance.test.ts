import { describe, expect, it } from "vitest";
import {
  computeAccountBalance,
  signedContribution,
  type BalanceAffectingTransaction,
} from "./account-balance";

const ACCOUNT_ID = "account-1";
const OTHER_ACCOUNT_ID = "account-2";

function transaction(
  overrides: Partial<BalanceAffectingTransaction>,
): BalanceAffectingTransaction {
  return {
    kind: "expense",
    amountMinorUnits: 100,
    accountId: ACCOUNT_ID,
    transferAccountId: null,
    transactionDate: "2026-01-15",
    ...overrides,
  };
}

describe("signedContribution", () => {
  it("adds income, investment withdrawals, loan disbursements, lending repayments, and refunds", () => {
    for (const kind of [
      "income",
      "investment_withdrawal",
      "loan_disbursement",
      "lending_repayment",
      "refund",
    ] as const) {
      expect(
        signedContribution(
          transaction({ kind, amountMinorUnits: 500 }),
          ACCOUNT_ID,
        ),
      ).toBe(500);
    }
  });

  it("subtracts expenses, investment contributions, loan payments, and lending disbursements", () => {
    for (const kind of [
      "expense",
      "investment_contribution",
      "loan_payment",
      "lending_disbursement",
    ] as const) {
      expect(
        signedContribution(
          transaction({ kind, amountMinorUnits: 500 }),
          ACCOUNT_ID,
        ),
      ).toBe(-500);
    }
  });

  it("takes an adjustment's stored amount as-is, including negative", () => {
    expect(
      signedContribution(
        transaction({ kind: "adjustment", amountMinorUnits: -300 }),
        ACCOUNT_ID,
      ),
    ).toBe(-300);
  });

  it("subtracts a transfer from the source account and adds it to the destination account", () => {
    const outgoing = transaction({
      kind: "transfer",
      amountMinorUnits: 200,
      accountId: ACCOUNT_ID,
      transferAccountId: OTHER_ACCOUNT_ID,
    });
    expect(signedContribution(outgoing, ACCOUNT_ID)).toBe(-200);
    expect(signedContribution(outgoing, OTHER_ACCOUNT_ID)).toBe(200);
  });
});

describe("computeAccountBalance", () => {
  it("uses opening balance + all transactions when there is no snapshot", () => {
    const result = computeAccountBalance({
      accountId: ACCOUNT_ID,
      currencyCode: "INR",
      openingBalanceMinorUnits: 10_000,
      openedDate: "2026-01-01",
      latestSnapshot: null,
      transactions: [
        transaction({
          kind: "income",
          amountMinorUnits: 5_000,
          transactionDate: "2026-01-05",
        }),
        transaction({
          kind: "expense",
          amountMinorUnits: 2_000,
          transactionDate: "2026-01-10",
        }),
      ],
    });

    expect(result.balance).toEqual({
      amountMinorUnits: 13_000,
      currencyCode: "INR",
    });
    expect(result.baseline).toEqual({ kind: "opening" });
  });

  it("uses the latest snapshot + only later transactions, excluding same-date transactions", () => {
    const result = computeAccountBalance({
      accountId: ACCOUNT_ID,
      currencyCode: "INR",
      openingBalanceMinorUnits: 0,
      openedDate: "2026-01-01",
      latestSnapshot: { asOfDate: "2026-01-15", balanceMinorUnits: 50_000 },
      transactions: [
        // Predates the snapshot baseline entirely — already reflected in it.
        transaction({
          kind: "income",
          amountMinorUnits: 1_000,
          transactionDate: "2026-01-05",
        }),
        // Same date as the snapshot — already reflected, excluded.
        transaction({
          kind: "income",
          amountMinorUnits: 2_000,
          transactionDate: "2026-01-15",
        }),
        // After the snapshot — included.
        transaction({
          kind: "expense",
          amountMinorUnits: 3_000,
          transactionDate: "2026-01-20",
        }),
      ],
    });

    expect(result.balance.amountMinorUnits).toBe(50_000 - 3_000);
    expect(result.baseline).toEqual({
      kind: "snapshot",
      asOfDate: "2026-01-15",
    });
  });

  it("correctly nets a transfer pair across both accounts", () => {
    const shared = transaction({
      kind: "transfer",
      amountMinorUnits: 4_000,
      accountId: ACCOUNT_ID,
      transferAccountId: OTHER_ACCOUNT_ID,
      transactionDate: "2026-02-01",
    });

    const source = computeAccountBalance({
      accountId: ACCOUNT_ID,
      currencyCode: "INR",
      openingBalanceMinorUnits: 10_000,
      openedDate: null,
      latestSnapshot: null,
      transactions: [shared],
    });
    const destination = computeAccountBalance({
      accountId: OTHER_ACCOUNT_ID,
      currencyCode: "INR",
      openingBalanceMinorUnits: 1_000,
      openedDate: null,
      latestSnapshot: null,
      transactions: [shared],
    });

    expect(source.balance.amountMinorUnits).toBe(6_000);
    expect(destination.balance.amountMinorUnits).toBe(5_000);
  });
});
