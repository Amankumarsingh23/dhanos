import { describe, expect, it } from "vitest";
import {
  findAccountBalanceDuplicate,
  findInvestmentValuationDuplicate,
  findTransactionDuplicate,
  type TransactionDuplicateCandidate,
} from "./import-duplicate-matching";

const baseRow = {
  accountId: "acct-1",
  transactionDate: "2026-01-15",
  amountMinorUnits: 150000,
  description: "Grocery run",
  externalReference: null,
};

describe("findTransactionDuplicate", () => {
  it("returns null when nothing matches", () => {
    expect(findTransactionDuplicate(baseRow, [])).toBeNull();
  });

  it("matches on external reference, scoped to the same account", () => {
    const candidates: TransactionDuplicateCandidate[] = [
      {
        label: "an existing transaction",
        accountId: "acct-1",
        transactionDate: "1999-01-01",
        amountMinorUnits: 1,
        description: "unrelated",
        externalReference: "TXN-42",
      },
    ];
    const result = findTransactionDuplicate(
      { ...baseRow, externalReference: "TXN-42" },
      candidates,
    );
    expect(result).toContain("TXN-42");
  });

  it("does not match an external reference from a different account", () => {
    const candidates: TransactionDuplicateCandidate[] = [
      {
        label: "an existing transaction",
        accountId: "acct-2",
        transactionDate: baseRow.transactionDate,
        amountMinorUnits: baseRow.amountMinorUnits,
        description: baseRow.description,
        externalReference: "TXN-42",
      },
    ];
    const result = findTransactionDuplicate(
      { ...baseRow, accountId: "acct-1", externalReference: "TXN-42" },
      candidates,
    );
    // Falls through to the weaker signals, which also don't match (different account).
    expect(result).toBeNull();
  });

  it("matches on account + date + amount + description (case/whitespace-insensitive)", () => {
    const candidates: TransactionDuplicateCandidate[] = [
      {
        label: "row 3 of this file",
        accountId: "acct-1",
        transactionDate: "2026-01-15",
        amountMinorUnits: 150000,
        description: "  GROCERY RUN  ",
        externalReference: null,
      },
    ];
    const result = findTransactionDuplicate(baseRow, candidates);
    expect(result).toContain("row 3 of this file");
    expect(result).toContain("description");
  });

  it("matches on account + date + amount alone when description differs", () => {
    const candidates: TransactionDuplicateCandidate[] = [
      {
        label: "an existing transaction dated 2026-01-15",
        accountId: "acct-1",
        transactionDate: "2026-01-15",
        amountMinorUnits: 150000,
        description: "Something else entirely",
        externalReference: null,
      },
    ];
    const result = findTransactionDuplicate(baseRow, candidates);
    expect(result).toContain("description differs or is missing");
  });

  it("does not match when the amount differs", () => {
    const candidates: TransactionDuplicateCandidate[] = [
      {
        label: "an existing transaction",
        accountId: "acct-1",
        transactionDate: "2026-01-15",
        amountMinorUnits: 999,
        description: "Grocery run",
        externalReference: null,
      },
    ];
    expect(findTransactionDuplicate(baseRow, candidates)).toBeNull();
  });
});

describe("findAccountBalanceDuplicate / findInvestmentValuationDuplicate", () => {
  it("matches an existing snapshot on the same date", () => {
    const result = findAccountBalanceDuplicate("2026-01-31", [
      { label: "a manual entry", asOfDate: "2026-01-31" },
    ]);
    expect(result).toContain("2026-01-31");
  });

  it("returns null when no snapshot exists for that date", () => {
    expect(
      findInvestmentValuationDuplicate("2026-01-31", [
        { label: "a snapshot", asOfDate: "2026-02-28" },
      ]),
    ).toBeNull();
  });
});
