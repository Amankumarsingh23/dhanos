import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHouseholdRole = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const recordActivityEvent = vi.fn();

vi.mock("@/lib/households/permissions", () => ({
  requireHouseholdRole: (...args: unknown[]) => requireHouseholdRole(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));
vi.mock("@/lib/activity", () => ({
  recordActivityEvent: (...args: unknown[]) => recordActivityEvent(...args),
}));

const { createTransferAction, reverseTransferAction, updateTransferAction } =
  await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const USD_ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const TRANSACTION_ID = "55555555-5555-4555-8555-555555555555";

const TRANSFER_ROW = {
  id: TRANSACTION_ID,
  household_id: HOUSEHOLD_ID,
  kind: "transfer",
  amount_minor_units: 50_000,
  currency_code: "INR",
  transaction_date: "2026-07-01",
  account_id: ACCOUNT_ID,
  transfer_account_id: OTHER_ACCOUNT_ID,
  category_id: null,
  counterparty: null,
  description: null,
  status: "cleared",
  source_type: "manual",
  recurring_rule_id: null,
  related_person_id: null,
  reverses_transaction_id: null,
  income_source_id: null,
  is_planned: true,
  transfer_fee_minor_units: null,
  transfer_destination_amount_minor_units: null,
  exchange_rate: null,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const BASE_INPUT = {
  amount: "500.00",
  currencyCode: "INR",
  transactionDate: "2026-07-01",
  accountId: ACCOUNT_ID,
  transferAccountId: OTHER_ACCOUNT_ID,
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

function accountsStub(accounts: { id: string; currency_code: string }[]) {
  return queryStub({ data: accounts, error: null });
}

describe("transfers actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createTransferAction", () => {
    it("rejects a transfer to the same account before touching the database", async () => {
      const result = await createTransferAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        transferAccountId: ACCOUNT_ID,
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("calls the atomic RPC for a same-currency transfer with no fee/exchange fields", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: OTHER_ACCOUNT_ID, currency_code: "INR" },
        ]),
      );
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSFER_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await createTransferAction(HOUSEHOLD_ID, BASE_INPUT);

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({
          p_kind: "transfer",
          p_amount_minor_units: 50_000,
          p_transfer_fee_minor_units: undefined,
          p_transfer_destination_amount_minor_units: undefined,
          p_exchange_rate: undefined,
        }),
      );
    });

    it("parses a fee and passes it to the RPC", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: OTHER_ACCOUNT_ID, currency_code: "INR" },
        ]),
      );
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSFER_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await createTransferAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        feeAmount: "10.00",
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({ p_transfer_fee_minor_units: 1_000 }),
      );
    });

    it("rejects a cross-currency transfer with no destination amount or exchange rate", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: USD_ACCOUNT_ID, currency_code: "USD" },
        ]),
      );
      const rpc = vi.fn();
      createClient.mockResolvedValue({ from, rpc });

      const result = await createTransferAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        transferAccountId: USD_ACCOUNT_ID,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/explicit converted amount/i);
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it("accepts a cross-currency transfer with an explicit destination amount and rate", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: USD_ACCOUNT_ID, currency_code: "USD" },
        ]),
      );
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSFER_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await createTransferAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        transferAccountId: USD_ACCOUNT_ID,
        destinationAmount: "6.00",
        exchangeRate: "83.5",
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({
          p_transfer_destination_amount_minor_units: 600,
          p_exchange_rate: 83.5,
        }),
      );
    });

    it("never exposes a raw database error", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: OTHER_ACCOUNT_ID, currency_code: "INR" },
        ]),
      );
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "check constraint violated" },
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await createTransferAction(HOUSEHOLD_ID, BASE_INPUT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/check constraint|23514/i);
      }
    });
  });

  describe("updateTransferAction", () => {
    it("calls the atomic update RPC", async () => {
      const from = vi.fn(() =>
        accountsStub([
          { id: ACCOUNT_ID, currency_code: "INR" },
          { id: OTHER_ACCOUNT_ID, currency_code: "INR" },
        ]),
      );
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSFER_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await updateTransferAction(
        HOUSEHOLD_ID,
        TRANSACTION_ID,
        BASE_INPUT,
      );

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "update_transaction_with_splits",
        expect.objectContaining({ p_transaction_id: TRANSACTION_ID }),
      );
    });
  });

  describe("reverseTransferAction", () => {
    it("rejects reversing a non-transfer transaction", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: { ...TRANSFER_ROW, kind: "expense" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await reverseTransferAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/transfer/i);
      }
    });

    it("rejects reversing a cross-currency transfer", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: {
            ...TRANSFER_ROW,
            transfer_destination_amount_minor_units: 600,
          },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await reverseTransferAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/currencies/i);
      }
    });

    it("rejects reversing a transfer that's already been reversed", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: TRANSFER_ROW, error: null }))
        .mockReturnValueOnce(
          queryStub({ data: { id: "existing-reversal" }, error: null }),
        );
      createClient.mockResolvedValue({ from });

      const result = await reverseTransferAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/already been reversed/i);
      }
    });

    it("creates a new swapped transfer linked via reverses_transaction_id", async () => {
      const insertResult = queryStub({
        data: {
          ...TRANSFER_ROW,
          id: "reversal-1",
          account_id: OTHER_ACCOUNT_ID,
          transfer_account_id: ACCOUNT_ID,
          reverses_transaction_id: TRANSACTION_ID,
        },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: TRANSFER_ROW, error: null }))
        .mockReturnValueOnce(queryStub({ data: null, error: null }))
        .mockReturnValueOnce(insertResult);
      createClient.mockResolvedValue({ from });

      const result = await reverseTransferAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(true);
      expect(insertResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "transfer",
          account_id: OTHER_ACCOUNT_ID,
          transfer_account_id: ACCOUNT_ID,
          reverses_transaction_id: TRANSACTION_ID,
        }),
      );
    });
  });
});
