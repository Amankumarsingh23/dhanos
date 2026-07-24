import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHouseholdRole = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const recordActivityEvent = vi.fn();
const createSignedDownloadUrl = vi.fn();

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
vi.mock("@/lib/storage", () => ({
  createSignedDownloadUrl: (...args: unknown[]) =>
    createSignedDownloadUrl(...args),
}));

const {
  attachExpenseReceiptAction,
  createExpenseAction,
  getExpenseReceiptUrlAction,
  removeExpenseReceiptAction,
  updateExpenseAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const TRANSACTION_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const RECURRING_RULE_ID = "55555555-5555-4555-8555-555555555555";
const ATTACHMENT_ID = "66666666-6666-4666-8666-666666666666";

const EXPENSE_ROW = {
  id: TRANSACTION_ID,
  household_id: HOUSEHOLD_ID,
  kind: "expense",
  amount_minor_units: 50_000,
  currency_code: "INR",
  transaction_date: "2026-07-01",
  account_id: ACCOUNT_ID,
  transfer_account_id: null,
  category_id: CATEGORY_ID,
  counterparty: "Store",
  description: null,
  status: "cleared",
  source_type: "manual",
  recurring_rule_id: null,
  related_person_id: null,
  reverses_transaction_id: null,
  income_source_id: null,
  is_planned: true,
  created_by: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const BASE_INPUT = {
  amount: "500.00",
  currencyCode: "INR",
  transactionDate: "2026-07-01",
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  counterparty: "Store",
  isPlanned: true,
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
    delete: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("expenses actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createExpenseAction", () => {
    it("rejects splits that don't sum to the expense total before touching the database", async () => {
      const rpc = vi.fn();
      createClient.mockResolvedValue({ rpc });

      const result = await createExpenseAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        splits: [
          { categoryId: CATEGORY_ID, amount: "100.00" },
          { categoryId: CATEGORY_ID, amount: "100.00" },
        ],
      });

      expect(result.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    });

    it("calls the atomic RPC with is_planned and no recurring rule when one-time", async () => {
      const rpc = vi.fn().mockResolvedValue({ data: EXPENSE_ROW, error: null });
      createClient.mockResolvedValue({ rpc, from: vi.fn() });

      const result = await createExpenseAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        isPlanned: false,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({
          p_kind: "expense",
          p_amount_minor_units: 50_000,
          p_is_planned: false,
          p_recurring_rule_id: undefined,
        }),
      );
    });

    it("creates a recurring_rules row first, then links it on the RPC call", async () => {
      const recurringInsert = queryStub({
        data: { id: RECURRING_RULE_ID },
        error: null,
      });
      const from = vi.fn(() => recurringInsert);
      const rpc = vi.fn().mockResolvedValue({
        data: { ...EXPENSE_ROW, recurring_rule_id: RECURRING_RULE_ID },
        error: null,
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await createExpenseAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringIntervalCount: 1,
      });

      expect(result.ok).toBe(true);
      expect(from).toHaveBeenCalledWith("recurring_rules");
      expect(recurringInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          household_id: HOUSEHOLD_ID,
          kind: "expense",
          frequency: "monthly",
          interval_count: 1,
        }),
      );
      expect(rpc).toHaveBeenCalledWith(
        "create_transaction_with_splits",
        expect.objectContaining({ p_recurring_rule_id: RECURRING_RULE_ID }),
      );
    });

    it("never exposes a raw database error", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "23514", message: "check constraint violated" },
      });
      createClient.mockResolvedValue({ rpc, from: vi.fn() });

      const result = await createExpenseAction(HOUSEHOLD_ID, BASE_INPUT);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/check constraint|23514/i);
      }
    });
  });

  describe("updateExpenseAction", () => {
    it("creates a new recurring rule when switching a one-time expense to recurring", async () => {
      const existingLookup = queryStub({
        data: { recurring_rule_id: null },
        error: null,
      });
      const recurringInsert = queryStub({
        data: { id: RECURRING_RULE_ID },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(existingLookup)
        .mockReturnValueOnce(recurringInsert);
      const rpc = vi.fn().mockResolvedValue({ data: EXPENSE_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await updateExpenseAction(HOUSEHOLD_ID, TRANSACTION_ID, {
        ...BASE_INPUT,
        isRecurring: true,
        recurringFrequency: "monthly",
        recurringIntervalCount: 1,
      });

      expect(result.ok).toBe(true);
      expect(recurringInsert.insert).toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith(
        "update_transaction_with_splits",
        expect.objectContaining({ p_recurring_rule_id: RECURRING_RULE_ID }),
      );
    });

    it("deactivates the existing recurring rule when switching back to one-time", async () => {
      const existingLookup = queryStub({
        data: { recurring_rule_id: RECURRING_RULE_ID },
        error: null,
      });
      const deactivateUpdate = queryStub({ data: null, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(existingLookup)
        .mockReturnValueOnce(deactivateUpdate);
      const rpc = vi.fn().mockResolvedValue({ data: EXPENSE_ROW, error: null });
      createClient.mockResolvedValue({ from, rpc });

      const result = await updateExpenseAction(HOUSEHOLD_ID, TRANSACTION_ID, {
        ...BASE_INPUT,
        isRecurring: false,
      });

      expect(result.ok).toBe(true);
      expect(deactivateUpdate.update).toHaveBeenCalledWith({
        status: "ended",
      });
      expect(rpc).toHaveBeenCalledWith(
        "update_transaction_with_splits",
        expect.objectContaining({ p_recurring_rule_id: undefined }),
      );
    });
  });

  describe("attachExpenseReceiptAction", () => {
    it("rejects attaching a receipt to a non-expense or missing transaction", async () => {
      const from = vi.fn(() => queryStub({ data: null, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await attachExpenseReceiptAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        storagePath: `${HOUSEHOLD_ID}/transactions/${TRANSACTION_ID}/receipt.png`,
        fileName: "receipt.png",
      });

      expect(result.ok).toBe(false);
    });

    it("inserts an attachment row referencing the transaction", async () => {
      const txLookup = queryStub({
        data: { id: TRANSACTION_ID, kind: "expense" },
        error: null,
      });
      const insertResult = queryStub({
        data: { id: ATTACHMENT_ID },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(txLookup)
        .mockReturnValueOnce(insertResult);
      createClient.mockResolvedValue({ from });

      const result = await attachExpenseReceiptAction(HOUSEHOLD_ID, {
        transactionId: TRANSACTION_ID,
        storagePath: `${HOUSEHOLD_ID}/transactions/${TRANSACTION_ID}/receipt.png`,
        fileName: "receipt.png",
      });

      expect(result.ok).toBe(true);
      expect(insertResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          attachable_type: "transaction",
          attachable_id: TRANSACTION_ID,
          storage_bucket: "documents",
        }),
      );
    });
  });

  describe("removeExpenseReceiptAction", () => {
    it("deletes the attachment row and removes the storage object", async () => {
      const lookup = queryStub({
        data: { storage_bucket: "documents", storage_path: "some/path.png" },
        error: null,
      });
      const deleteResult = queryStub({ data: null, error: null });
      const remove = vi.fn().mockResolvedValue({ data: null, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(lookup)
        .mockReturnValueOnce(deleteResult);
      createClient.mockResolvedValue({
        from,
        storage: { from: vi.fn(() => ({ remove })) },
      });

      const result = await removeExpenseReceiptAction(
        HOUSEHOLD_ID,
        ATTACHMENT_ID,
      );

      expect(result.ok).toBe(true);
      expect(remove).toHaveBeenCalledWith(["some/path.png"]);
    });
  });

  describe("getExpenseReceiptUrlAction", () => {
    it("returns a signed download url for an attachment in the household", async () => {
      const lookup = queryStub({
        data: { storage_bucket: "documents", storage_path: "some/path.png" },
        error: null,
      });
      createClient.mockResolvedValue({ from: vi.fn(() => lookup) });
      createSignedDownloadUrl.mockResolvedValue("https://signed.example/url");

      const result = await getExpenseReceiptUrlAction(
        HOUSEHOLD_ID,
        ATTACHMENT_ID,
      );

      expect(result).toEqual({ ok: true, data: "https://signed.example/url" });
    });
  });
});
