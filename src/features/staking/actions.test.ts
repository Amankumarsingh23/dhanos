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

const {
  createStakingPositionAction,
  pauseStakingPositionAction,
  recordDailySnapshotAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const HOLDING_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const PLATFORM_ID = "44444444-4444-4444-8444-444444444444";
const POSITION_ID = "55555555-5555-4555-8555-555555555555";

const BASE_POSITION = {
  id: POSITION_ID,
  household_id: HOUSEHOLD_ID,
  name: "ETH staking on Binance",
  investment_holding_id: HOLDING_ID,
  opening_principal_minor_units: 10000000,
  opening_date: "2026-07-01",
  currency_code: "INR",
  expected_daily_rate: 0.0005,
  lock_in_end_date: null,
  fee_notes: null,
  risk_notes: null,
  status: "active",
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const BASE_POSITION_INPUT = {
  name: "ETH staking on Binance",
  investmentAssetId: ASSET_ID,
  investmentAccountId: PLATFORM_ID,
  openingPrincipal: "1,00,000.00",
  openingDate: "2026-07-01",
  currencyCode: "INR",
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("staking actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createStakingPositionAction", () => {
    it("resolves an existing holding and creates the position", async () => {
      const existingHolding = queryStub({
        data: { id: HOLDING_ID },
        error: null,
      });
      const positionInsert = queryStub({ data: BASE_POSITION, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(existingHolding)
        .mockReturnValueOnce(positionInsert);
      createClient.mockResolvedValue({ from });

      const result = await createStakingPositionAction(
        HOUSEHOLD_ID,
        BASE_POSITION_INPUT,
      );

      expect(result.ok).toBe(true);
      expect(positionInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          household_id: HOUSEHOLD_ID,
          investment_holding_id: HOLDING_ID,
          opening_principal_minor_units: 10000000,
          currency_code: "INR",
        }),
      );
    });

    it("rejects an impossible expected daily rate before ever attempting the write", async () => {
      const existingHolding = queryStub({
        data: { id: HOLDING_ID },
        error: null,
      });
      const from = vi.fn().mockReturnValue(existingHolding);
      createClient.mockResolvedValue({ from });

      const result = await createStakingPositionAction(HOUSEHOLD_ID, {
        ...BASE_POSITION_INPUT,
        expectedDailyRatePercent: "500", // meant 5%, typed as a raw percent -> 500% decimal, impossible
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/not realistic|whole-number percentage/i);
      }
    });
  });

  describe("recordDailySnapshotAction", () => {
    it("derives the reward from the closing-value equation and records revision 1 for a new date", async () => {
      const fetchPosition = queryStub({ data: BASE_POSITION, error: null });
      const existingRevisions = queryStub({ data: [], error: null });
      const snapshotInsert = queryStub({
        data: { id: "snap-1", revision: 1, snapshot_date: "2026-07-05" },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(fetchPosition)
        .mockReturnValueOnce(existingRevisions)
        .mockReturnValueOnce(snapshotInsert);
      createClient.mockResolvedValue({ from });

      const result = await recordDailySnapshotAction(HOUSEHOLD_ID, {
        stakingPositionId: POSITION_ID,
        snapshotDate: "2026-07-05",
        openingValue: "1,00,000.00",
        contribution: "0",
        withdrawal: "0",
        fee: "0",
        closingValue: "1,00,050.00",
      });

      expect(result.ok).toBe(true);
      expect(snapshotInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 1,
          opening_value_minor_units: 10000000,
          closing_value_minor_units: 10005000,
          reward_minor_units: 5000,
          adjustment_reason: null,
        }),
      );
    });

    it("requires an adjustment reason when a snapshot already exists for the date, and records the next revision", async () => {
      const fetchPosition = queryStub({ data: BASE_POSITION, error: null });
      const existingRevisions = queryStub({
        data: [{ revision: 1 }],
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(fetchPosition)
        .mockReturnValueOnce(existingRevisions);
      createClient.mockResolvedValue({ from });

      const withoutReason = await recordDailySnapshotAction(HOUSEHOLD_ID, {
        stakingPositionId: POSITION_ID,
        snapshotDate: "2026-07-05",
        openingValue: "1,00,000.00",
        contribution: "0",
        withdrawal: "0",
        fee: "0",
        closingValue: "1,00,060.00",
      });
      expect(withoutReason.ok).toBe(false);
      if (!withoutReason.ok) {
        expect(withoutReason.error).toMatch(/adjustment/i);
      }

      const fetchPosition2 = queryStub({ data: BASE_POSITION, error: null });
      const existingRevisions2 = queryStub({
        data: [{ revision: 1 }],
        error: null,
      });
      const snapshotInsert = queryStub({
        data: { id: "snap-2", revision: 2, snapshot_date: "2026-07-05" },
        error: null,
      });
      const from2 = vi
        .fn()
        .mockReturnValueOnce(fetchPosition2)
        .mockReturnValueOnce(existingRevisions2)
        .mockReturnValueOnce(snapshotInsert);
      createClient.mockResolvedValue({ from: from2 });

      const withReason = await recordDailySnapshotAction(HOUSEHOLD_ID, {
        stakingPositionId: POSITION_ID,
        snapshotDate: "2026-07-05",
        openingValue: "1,00,000.00",
        contribution: "0",
        withdrawal: "0",
        fee: "0",
        closingValue: "1,00,060.00",
        adjustmentReason: "Platform corrected the reward retroactively",
      });

      expect(withReason.ok).toBe(true);
      expect(snapshotInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 2,
          adjustment_reason: "Platform corrected the reward retroactively",
        }),
      );
    });
  });

  describe("pauseStakingPositionAction", () => {
    it("updates status to paused", async () => {
      const updateResult = queryStub({
        data: { ...BASE_POSITION, status: "paused" },
        error: null,
      });
      createClient.mockResolvedValue({ from: () => updateResult });

      const result = await pauseStakingPositionAction(HOUSEHOLD_ID, {
        stakingPositionId: POSITION_ID,
      });

      expect(result.ok).toBe(true);
      expect(updateResult.update).toHaveBeenCalledWith({ status: "paused" });
    });
  });
});
