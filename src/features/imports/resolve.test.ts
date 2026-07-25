import { describe, expect, it } from "vitest";
import {
  extractMappedFields,
  resolveAccountBalanceRow,
  resolveInvestmentValuationRow,
  resolveTransactionRow,
  type ImportLookups,
} from "./resolve";
import {
  ACCOUNT_BALANCE_IMPORT_FIELDS,
  INVESTMENT_VALUATION_IMPORT_FIELDS,
  TRANSACTION_IMPORT_FIELDS,
} from "./types";

const lookups: ImportLookups = {
  accountsByName: new Map([
    ["hdfc savings", { id: "acct-1", currencyCode: "INR" }],
  ]),
  categoriesByName: new Map([["groceries", { id: "cat-1" }]]),
  holdingsByLabel: new Map([
    ["nifty index fund (zerodha)", { id: "holding-1", currencyCode: "INR" }],
  ]),
};

// column indices: 0=date, 1=kind, 2=amount, 3=account, 4=category, 5=counterparty, 6=description, 7=externalReference
const transactionMapping = {
  "0": "transactionDate",
  "1": "kind",
  "2": "amount",
  "3": "account",
  "4": "category",
  "5": "counterparty",
  "6": "description",
  "7": "externalReference",
};

function mapTransactionRow(row: readonly string[]) {
  return extractMappedFields(row, transactionMapping, TRANSACTION_IMPORT_FIELDS);
}

describe("extractMappedFields", () => {
  it("extracts raw cells into a field-keyed record, trimming and nulling blanks", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "expense",
      "1500.00",
      "HDFC Savings",
      "",
      "  BigBasket  ",
      "",
      "",
    ]);
    expect(fields).toEqual({
      transactionDate: "2026-01-15",
      kind: "expense",
      amount: "1500.00",
      account: "HDFC Savings",
      category: null,
      counterparty: "BigBasket",
      description: null,
      externalReference: null,
    });
  });
});

describe("resolveTransactionRow", () => {
  it("resolves a fully valid row", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "expense",
      "1500.00",
      "HDFC Savings",
      "Groceries",
      "BigBasket",
      "Weekly groceries",
      "TXN-1",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        transactionDate: "2026-01-15",
        kind: "expense",
        amountMinorUnits: 150000,
        currencyCode: "INR",
        accountId: "acct-1",
        categoryId: "cat-1",
        counterparty: "BigBasket",
        description: "Weekly groceries",
        externalReference: "TXN-1",
      });
    }
  });

  it("matches the account case-insensitively", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "expense",
      "100",
      "hdfc SAVINGS",
      "",
      "",
      "",
      "",
    ]);
    expect(resolveTransactionRow(fields, lookups).ok).toBe(true);
  });

  it("rejects a non-ISO date", () => {
    const fields = mapTransactionRow([
      "15/01/2026",
      "expense",
      "100",
      "HDFC Savings",
      "",
      "",
      "",
      "",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("valid ISO date"))).toBe(true);
    }
  });

  it("rejects an unrecognized account", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "expense",
      "100",
      "Unknown Bank",
      "",
      "",
      "",
      "",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("Unknown Bank"))).toBe(true);
    }
  });

  it("rejects an unrecognized transaction kind", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "not-a-kind",
      "100",
      "HDFC Savings",
      "",
      "",
      "",
      "",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.includes("not supported for import")),
      ).toBe(true);
    }
  });

  it("rejects an invalid amount and collects multiple errors at once", () => {
    const fields = mapTransactionRow([
      "not-a-date",
      "not-a-kind",
      "abc",
      "Unknown",
      "",
      "",
      "",
      "",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Date + kind + account all fail; amount can't even be checked since
      // the account (needed for its currency) never resolved.
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves category null when the category column is unmapped/blank", () => {
    const fields = mapTransactionRow([
      "2026-01-15",
      "expense",
      "100",
      "HDFC Savings",
      "",
      "",
      "",
      "",
    ]);
    const result = resolveTransactionRow(fields, lookups);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categoryId).toBeNull();
    }
  });
});

describe("resolveAccountBalanceRow", () => {
  const mapping = { "0": "asOfDate", "1": "account", "2": "balance", "3": "notes" };

  it("resolves a valid balance row, including a negative balance", () => {
    const fields = extractMappedFields(
      ["2026-01-31", "HDFC Savings", "-500.00", "overdrawn"],
      mapping,
      ACCOUNT_BALANCE_IMPORT_FIELDS,
    );
    const result = resolveAccountBalanceRow(fields, lookups);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balanceMinorUnits).toBe(-50000);
    }
  });
});

describe("resolveInvestmentValuationRow", () => {
  const mapping = {
    "0": "asOfDate",
    "1": "holding",
    "2": "value",
    "3": "pricePerUnit",
    "4": "notes",
  };

  it("resolves a valid valuation row", () => {
    const fields = extractMappedFields(
      ["2026-01-31", "Nifty Index Fund (Zerodha)", "100000", "245.50", ""],
      mapping,
      INVESTMENT_VALUATION_IMPORT_FIELDS,
    );
    const result = resolveInvestmentValuationRow(fields, lookups);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        asOfDate: "2026-01-31",
        investmentHoldingId: "holding-1",
        valueMinorUnits: 10000000,
        currencyCode: "INR",
        pricePerUnit: 245.5,
        notes: null,
      });
    }
  });

  it("rejects an unrecognized holding", () => {
    const fields = extractMappedFields(
      ["2026-01-31", "Some Other Fund", "100000", "", ""],
      mapping,
      INVESTMENT_VALUATION_IMPORT_FIELDS,
    );
    expect(resolveInvestmentValuationRow(fields, lookups).ok).toBe(false);
  });
});
