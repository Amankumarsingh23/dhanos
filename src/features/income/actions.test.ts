import { beforeEach, describe, expect, it, vi } from "vitest";

const requireHouseholdRole = vi.fn();
const createClient = vi.fn();
const revalidatePath = vi.fn();
const recordActivityEvent = vi.fn();
const findNearbyIncomeReceipts = vi.fn();

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
  findNearbyIncomeReceipts: (...args: unknown[]) =>
    findNearbyIncomeReceipts(...args),
}));

const {
  archiveIncomeSourceAction,
  createIncomeSourceAction,
  recordIncomeAction,
  restoreIncomeSourceAction,
  updateIncomeSourceAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

const SOURCE_ROW = {
  id: SOURCE_ID,
  household_id: HOUSEHOLD_ID,
  name: "Acme Corp salary",
  source_type: "salary",
  institution_id: null,
  person_id: null,
  expected_amount_minor_units: 500_000,
  currency_code: "INR",
  frequency: "monthly",
  expected_day_of_month: 1,
  expected_payment_date_rule: null,
  receiving_account_id: ACCOUNT_ID,
  category_id: null,
  start_date: "2026-01-01",
  end_date: null,
  tax_withholding_expected: true,
  tax_withholding_notes: null,
  is_active: true,
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

describe("income actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createIncomeSourceAction", () => {
    it("rejects a blank name before touching the database", async () => {
      const result = await createIncomeSourceAction(HOUSEHOLD_ID, {
        name: "",
        sourceType: "salary",
        currencyCode: "INR",
        frequency: "monthly",
        expectedDayOfMonth: 1,
        receivingAccountId: ACCOUNT_ID,
        startDate: "2026-01-01",
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("rejects a monthly frequency with no expectedDayOfMonth", async () => {
      const result = await createIncomeSourceAction(HOUSEHOLD_ID, {
        name: "Acme Corp salary",
        sourceType: "salary",
        currencyCode: "INR",
        frequency: "monthly",
        receivingAccountId: ACCOUNT_ID,
        startDate: "2026-01-01",
      });
      expect(result.ok).toBe(false);
    });

    it("creates a source without ever writing a transaction (setup ≠ income)", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: SOURCE_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createIncomeSourceAction(HOUSEHOLD_ID, {
        name: "Acme Corp salary",
        sourceType: "salary",
        currencyCode: "INR",
        frequency: "monthly",
        expectedDayOfMonth: 1,
        receivingAccountId: ACCOUNT_ID,
        startDate: "2026-01-01",
        expectedAmount: "5000.00",
      });

      expect(result.ok).toBe(true);
      expect(from).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith("income_sources");
      const insertBuilder = from.mock.results[0]?.value as {
        insert: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ expected_amount_minor_units: 500_000 }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/app/income");
    });

    it("allows a weekly source with no expectedDayOfMonth", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: SOURCE_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createIncomeSourceAction(HOUSEHOLD_ID, {
        name: "Freelance gig",
        sourceType: "freelance",
        currencyCode: "INR",
        frequency: "weekly",
        receivingAccountId: ACCOUNT_ID,
        startDate: "2026-01-01",
      });

      expect(result.ok).toBe(true);
    });
  });

  describe("updateIncomeSourceAction", () => {
    it("returns a not-found style error when no row matches", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: null, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await updateIncomeSourceAction(HOUSEHOLD_ID, SOURCE_ID, {
        name: "Acme Corp salary",
        sourceType: "salary",
        currencyCode: "INR",
        frequency: "weekly",
        receivingAccountId: ACCOUNT_ID,
        startDate: "2026-01-01",
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("archive / restore", () => {
    it("archives with the owner/admin role gate, not owner/admin/editor", async () => {
      const from = vi.fn(() =>
        queryStub({ data: { ...SOURCE_ROW, is_active: false }, error: null }),
      );
      createClient.mockResolvedValue({ from });

      await archiveIncomeSourceAction(HOUSEHOLD_ID, SOURCE_ID);

      expect(requireHouseholdRole).toHaveBeenCalledWith(HOUSEHOLD_ID, [
        "owner",
        "admin",
      ]);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "income_source.archived" }),
      );
    });

    it("restores an archived source back to active", async () => {
      const from = vi.fn(() =>
        queryStub({ data: { ...SOURCE_ROW, is_active: true }, error: null }),
      );
      createClient.mockResolvedValue({ from });

      const result = await restoreIncomeSourceAction(HOUSEHOLD_ID, SOURCE_ID);

      expect(result.ok).toBe(true);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "income_source.restored" }),
      );
    });
  });

  describe("recordIncomeAction", () => {
    it("warns instead of recording when a nearby receipt already exists, and writes nothing", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: SOURCE_ROW, error: null }));
      createClient.mockResolvedValue({ from });
      findNearbyIncomeReceipts.mockResolvedValue([
        { id: "existing-1", transaction_date: "2026-07-02" },
      ]);

      const result = await recordIncomeAction(HOUSEHOLD_ID, {
        incomeSourceId: SOURCE_ID,
        amount: "5000.00",
        transactionDate: "2026-07-01",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.kind).toBe("duplicate_warning");
      }
      // Only the source lookup ran — no transaction insert.
      expect(from).toHaveBeenCalledTimes(1);
      expect(recordActivityEvent).not.toHaveBeenCalled();
    });

    it("records a kind='income' transaction linked via income_source_id, defaulting account/person from the source", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: SOURCE_ROW, error: null }))
        .mockReturnValueOnce(
          queryStub({
            data: { id: "txn-1", kind: "income", income_source_id: SOURCE_ID },
            error: null,
          }),
        );
      createClient.mockResolvedValue({ from });
      findNearbyIncomeReceipts.mockResolvedValue([]);

      const result = await recordIncomeAction(HOUSEHOLD_ID, {
        incomeSourceId: SOURCE_ID,
        amount: "5000.00",
        transactionDate: "2026-07-01",
      });

      expect(result.ok).toBe(true);
      const insertBuilder = from.mock.results[1]?.value as {
        insert: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "income",
          amount_minor_units: 500_000,
          account_id: ACCOUNT_ID,
          income_source_id: SOURCE_ID,
        }),
      );
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "income.recorded" }),
      );
    });

    it("records anyway when confirmDuplicate is set, bypassing the warning", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: SOURCE_ROW, error: null }))
        .mockReturnValueOnce(
          queryStub({ data: { id: "txn-2", kind: "income" }, error: null }),
        );
      createClient.mockResolvedValue({ from });

      const result = await recordIncomeAction(HOUSEHOLD_ID, {
        incomeSourceId: SOURCE_ID,
        amount: "5000.00",
        transactionDate: "2026-07-01",
        confirmDuplicate: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.kind).toBe("recorded");
      }
      // Duplicate check is skipped entirely when confirmDuplicate is set.
      expect(findNearbyIncomeReceipts).not.toHaveBeenCalled();
    });

    it("never exposes a raw database error", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: null,
          error: { code: "42501", message: "insufficient_privilege" },
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await recordIncomeAction(HOUSEHOLD_ID, {
        incomeSourceId: SOURCE_ID,
        amount: "5000.00",
        transactionDate: "2026-07-01",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/insufficient_privilege|42501/i);
      }
    });
  });
});
