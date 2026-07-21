import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHouseholdRole = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const recordActivityEvent = vi.fn();
const getRefundedAmount = vi.fn();

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
vi.mock("./queries", () => ({
  getRefundedAmount: (...args: unknown[]) => getRefundedAmount(...args),
}));

const {
  archiveTransactionAction,
  createTransactionAction,
  recordRefundAction,
  restoreTransactionAction,
  updateTransactionAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const TRANSACTION_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";

const TRANSACTION_ROW = {
  id: TRANSACTION_ID,
  household_id: HOUSEHOLD_ID,
  kind: "expense",
  amount_minor_units: 50_000,
  currency_code: "INR",
  transaction_date: "2026-07-01",
  account_id: ACCOUNT_ID,
  transfer_account_id: null,
  category_id: CATEGORY_ID,
  counterparty: null,
  description: "Groceries",
  status: "cleared",
  source_type: "manual",
  recurring_rule_id: null,
  related_person_id: null,
  reverses_transaction_id: null,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("transactions actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createTransactionAction", () => {
    it("rejects a transfer with no destination account before touching the database", async () => {
      const result = await createTransactionAction(HOUSEHOLD_ID, {
        kind: "transfer",
        amount: "100",
        currencyCode: "INR",
        transactionDate: "2026-07-01",
        accountId: ACCOUNT_ID,
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("calls the atomic RPC with converted minor units and no splits", async () => {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSACTION_ROW, error: null });
      createClient.mockResolvedValue({ rpc });

      const result = await createTransactionAction(HOUSEHOLD_ID, {
        kind: "expense",
        amount: "500.00",
        currencyCode: "INR",
        transactionDate: "2026-07-01",
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({
          p_amount_minor_units: 50_000,
          p_kind: "expense",
        }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/app/cash-flow");
    });

    it("rejects splits that don't sum to the transaction total before calling the RPC", async () => {
      const rpc = vi.fn();
      createClient.mockResolvedValue({ rpc });

      const result = await createTransactionAction(HOUSEHOLD_ID, {
        kind: "expense",
        amount: "500.00",
        currencyCode: "INR",
        transactionDate: "2026-07-01",
        accountId: ACCOUNT_ID,
        splits: [
          { categoryId: CATEGORY_ID, amount: "200.00" },
          { categoryId: CATEGORY_ID, amount: "200.00" },
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/add up/i);
      }
      expect(rpc).not.toHaveBeenCalled();
    });

    it("accepts splits that sum exactly to the transaction total", async () => {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSACTION_ROW, error: null });
      createClient.mockResolvedValue({ rpc });

      const result = await createTransactionAction(HOUSEHOLD_ID, {
        kind: "expense",
        amount: "500.00",
        currencyCode: "INR",
        transactionDate: "2026-07-01",
        accountId: ACCOUNT_ID,
        splits: [
          { categoryId: CATEGORY_ID, amount: "300.00" },
          { categoryId: CATEGORY_ID, amount: "200.00" },
        ],
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({
          p_splits: [
            {
              category_id: CATEGORY_ID,
              amount_minor_units: 30_000,
              notes: null,
            },
            {
              category_id: CATEGORY_ID,
              amount_minor_units: 20_000,
              notes: null,
            },
          ],
        }),
      );
    });

    it("never exposes a raw database error", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "check constraint violated" },
      });
      createClient.mockResolvedValue({ rpc });

      const result = await createTransactionAction(HOUSEHOLD_ID, {
        kind: "expense",
        amount: "100",
        currencyCode: "INR",
        transactionDate: "2026-07-01",
        accountId: ACCOUNT_ID,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/check constraint|23514/i);
      }
    });
  });

  describe("updateTransactionAction", () => {
    it("calls the atomic update RPC", async () => {
      const rpc = vi
        .fn()
        .mockResolvedValue({ data: TRANSACTION_ROW, error: null });
      createClient.mockResolvedValue({ rpc });

      const result = await updateTransactionAction(
        HOUSEHOLD_ID,
        TRANSACTION_ID,
        {
          kind: "expense",
          amount: "500.00",
          currencyCode: "INR",
          transactionDate: "2026-07-01",
          accountId: ACCOUNT_ID,
        },
      );

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "update_transaction_with_splits",
        expect.objectContaining({ p_transaction_id: TRANSACTION_ID }),
      );
    });
  });

  describe("archive / restore", () => {
    it("archives by setting status to cancelled", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...TRANSACTION_ROW, status: "cancelled" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      await archiveTransactionAction(HOUSEHOLD_ID, TRANSACTION_ID);

      const updateBuilder = from.mock.results[0]?.value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(updateBuilder.update).toHaveBeenCalledWith({
        status: "cancelled",
      });
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "transaction.archived" }),
      );
    });

    it("restores by setting status back to cleared", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...TRANSACTION_ROW, status: "cleared" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await restoreTransactionAction(
        HOUSEHOLD_ID,
        TRANSACTION_ID,
      );

      expect(result.ok).toBe(true);
      const updateBuilder = from.mock.results[0]?.value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(updateBuilder.update).toHaveBeenCalledWith({ status: "cleared" });
    });
  });

  describe("recordRefundAction", () => {
    it("rejects refunding a non-expense transaction", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: { ...TRANSACTION_ROW, kind: "income" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await recordRefundAction(HOUSEHOLD_ID, {
        originalTransactionId: TRANSACTION_ID,
        amount: "100",
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/expense/i);
      }
    });

    it("rejects a refund exceeding the remaining refundable amount", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: TRANSACTION_ROW, error: null }));
      createClient.mockResolvedValue({ from });
      getRefundedAmount.mockResolvedValue(40_000); // 400.00 already refunded of 500.00

      const result = await recordRefundAction(HOUSEHOLD_ID, {
        originalTransactionId: TRANSACTION_ID,
        amount: "200.00", // exceeds the remaining 100.00
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/exceed/i);
      }
    });

    it("creates a refund transaction linked via reverses_transaction_id", async () => {
      const insertResult = queryStub({
        data: {
          ...TRANSACTION_ROW,
          id: "refund-1",
          kind: "refund",
          reverses_transaction_id: TRANSACTION_ID,
        },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: TRANSACTION_ROW, error: null }))
        .mockReturnValueOnce(insertResult);
      createClient.mockResolvedValue({ from });
      getRefundedAmount.mockResolvedValue(0);

      const result = await recordRefundAction(HOUSEHOLD_ID, {
        originalTransactionId: TRANSACTION_ID,
        amount: "100.00",
        transactionDate: "2026-07-05",
      });

      expect(result.ok).toBe(true);
      expect(insertResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "refund",
          amount_minor_units: 10_000,
          reverses_transaction_id: TRANSACTION_ID,
        }),
      );
    });
  });
});
