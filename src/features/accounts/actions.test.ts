import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHouseholdRole = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const recordActivityEvent = vi.fn();
const getCalculatedAccountBalance = vi.fn();

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
  getCalculatedAccountBalance: (...args: unknown[]) =>
    getCalculatedAccountBalance(...args),
}));

const {
  closeAccountAction,
  createAccountAction,
  recordBalanceCorrectionAction,
  reopenAccountAction,
  updateAccountAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

const ACCOUNT_ROW = {
  id: ACCOUNT_ID,
  household_id: HOUSEHOLD_ID,
  name: "HDFC Savings",
  account_type: "savings",
  institution_id: null,
  owner_person_id: null,
  masked_identifier: "1234",
  currency_code: "INR",
  opening_balance_minor_units: 100_000,
  is_active: true,
  opened_date: "2026-01-01",
  closed_date: null,
  include_in_net_worth: true,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("accounts actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createAccountAction", () => {
    it("rejects a blank name before touching the database", async () => {
      const result = await createAccountAction(HOUSEHOLD_ID, {
        name: "",
        accountType: "savings",
        currencyCode: "INR",
        openingBalance: "0",
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("converts the decimal opening balance to minor units and creates the account", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: ACCOUNT_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createAccountAction(HOUSEHOLD_ID, {
        name: "HDFC Savings",
        accountType: "savings",
        currencyCode: "inr",
        openingBalance: "1,000.00",
      });

      expect(result.ok).toBe(true);
      const insertBuilder = from.mock.results[0]?.value as {
        insert: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          currency_code: "INR",
          opening_balance_minor_units: 100_000,
        }),
      );
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "account.created" }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/app/accounts");
    });

    it("never exposes a raw database error", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await createAccountAction(HOUSEHOLD_ID, {
        name: "HDFC Savings",
        accountType: "savings",
        currencyCode: "INR",
        openingBalance: "0",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/duplicate key|23505/i);
      }
    });
  });

  describe("updateAccountAction", () => {
    it("returns a not-found style error when no row matches the id + household", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: null, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await updateAccountAction(HOUSEHOLD_ID, ACCOUNT_ID, {
        name: "HDFC Savings",
        accountType: "savings",
        currencyCode: "INR",
        openingBalance: "0",
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("close / reopen", () => {
    it("closes with the owner/admin role gate, not owner/admin/editor", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...ACCOUNT_ROW, is_active: false, closed_date: "2026-07-01" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      await closeAccountAction(HOUSEHOLD_ID, ACCOUNT_ID, "2026-07-01");

      expect(requireHouseholdRole).toHaveBeenCalledWith(HOUSEHOLD_ID, [
        "owner",
        "admin",
      ]);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "account.closed" }),
      );
    });

    it("reopens a closed account, clearing closed_date", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...ACCOUNT_ROW, is_active: true, closed_date: null },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await reopenAccountAction(HOUSEHOLD_ID, ACCOUNT_ID);

      expect(result.ok).toBe(true);
      const updateBuilder = from.mock.results[0]?.value as {
        update: ReturnType<typeof vi.fn>;
      };
      expect(updateBuilder.update).toHaveBeenCalledWith({
        is_active: true,
        closed_date: null,
      });
    });
  });

  describe("recordBalanceCorrectionAction", () => {
    it("computes the signed difference and calls the atomic RPC", async () => {
      getCalculatedAccountBalance.mockResolvedValue({
        amountMinorUnits: 90_000,
        currencyCode: "INR",
      });
      const rpc = vi.fn().mockResolvedValue({
        data: [{ snapshot_id: "snap-1", adjustment_transaction_id: "txn-1" }],
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(
          queryStub({ data: { currency_code: "INR" }, error: null }),
        );
      createClient.mockResolvedValue({ from, rpc });

      const result = await recordBalanceCorrectionAction(HOUSEHOLD_ID, {
        accountId: ACCOUNT_ID,
        asOfDate: "2026-07-21",
        confirmedBalance: "1,000.00",
      });

      expect(result).toEqual({
        ok: true,
        data: { snapshotId: "snap-1", adjustmentTransactionId: "txn-1" },
      });
      expect(rpc).toHaveBeenCalledWith(
        "record_account_balance_correction",
        expect.objectContaining({
          p_household_id: HOUSEHOLD_ID,
          p_account_id: ACCOUNT_ID,
          p_as_of_date: "2026-07-21",
          p_confirmed_balance_minor_units: 100_000,
          p_prior_calculated_balance_minor_units: 90_000,
        }),
      );
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "account.balance_corrected" }),
      );
    });

    it("never exposes a raw database error from the RPC", async () => {
      getCalculatedAccountBalance.mockResolvedValue({
        amountMinorUnits: 90_000,
        currencyCode: "INR",
      });
      const rpc = vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "insufficient_privilege" },
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(
          queryStub({ data: { currency_code: "INR" }, error: null }),
        );
      createClient.mockResolvedValue({ from, rpc });

      const result = await recordBalanceCorrectionAction(HOUSEHOLD_ID, {
        accountId: ACCOUNT_ID,
        asOfDate: "2026-07-21",
        confirmedBalance: "1000",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/insufficient_privilege|42501/i);
      }
    });
  });
});
