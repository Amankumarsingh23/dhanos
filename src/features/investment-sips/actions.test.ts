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
  catchUpSipContributionsAction,
  createSipAction,
  pauseSipAction,
  reactivateSipAction,
  recordSipContributionAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const HOLDING_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";
const PLATFORM_ID = "44444444-4444-4444-8444-444444444444";
const CONTRIBUTION_ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const SIP_ID = "66666666-6666-4666-8666-666666666666";

const BASE_SIP = {
  id: SIP_ID,
  household_id: HOUSEHOLD_ID,
  name: "PhonePe Daily Gold",
  investment_holding_id: HOLDING_ID,
  provider: null,
  contribution_amount_minor_units: 2000,
  currency_code: "INR",
  frequency: "daily",
  interval_count: 1,
  start_date: "2026-07-01",
  end_date: null,
  contribution_account_id: CONTRIBUTION_ACCOUNT_ID,
  next_due_date: "2026-07-01",
  last_contribution_date: null,
  expected_duration_months: null,
  status: "active",
  notes: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

const BASE_INPUT = {
  name: "PhonePe Daily Gold",
  investmentAssetId: ASSET_ID,
  investmentAccountId: PLATFORM_ID,
  provider: null,
  contributionAmount: "20.00",
  currencyCode: "INR",
  frequency: "daily" as const,
  intervalCount: 1,
  startDate: "2026-07-01",
  contributionAccountId: CONTRIBUTION_ACCOUNT_ID,
  initialStatus: "active" as const,
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("investment-sips actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createSipAction", () => {
    it("resolves an existing holding, computes next_due_date as the start date, and logs a 'created' event", async () => {
      const existingHolding = queryStub({
        data: { id: HOLDING_ID },
        error: null,
      });
      const sipInsert = queryStub({ data: BASE_SIP, error: null });
      const eventInsert = queryStub({ data: null, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(existingHolding) // select existing investment_holdings
        .mockReturnValueOnce(sipInsert) // insert investment_sips
        .mockReturnValueOnce(eventInsert); // insert investment_sip_events
      createClient.mockResolvedValue({ from });

      const result = await createSipAction(HOUSEHOLD_ID, BASE_INPUT);

      expect(result.ok).toBe(true);
      expect(sipInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          household_id: HOUSEHOLD_ID,
          investment_holding_id: HOLDING_ID,
          contribution_amount_minor_units: 2000,
          next_due_date: "2026-07-01",
          status: "active",
        }),
      );
      expect(eventInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          investment_sip_id: SIP_ID,
          event_type: "created",
        }),
      );
    });
  });

  describe("recordSipContributionAction", () => {
    it("records a daily contribution and advances next_due_date without ending the SIP", async () => {
      const fetchSip = queryStub({ data: BASE_SIP, error: null });
      const rpcResult = {
        data: { id: "investment-txn-1" },
        error: null,
      };
      const rpc = vi.fn().mockResolvedValue(rpcResult);
      const refetchSip = queryStub({
        data: { ...BASE_SIP, next_due_date: "2026-07-02" },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(fetchSip)
        .mockReturnValueOnce(refetchSip);
      createClient.mockResolvedValue({ from, rpc });

      const result = await recordSipContributionAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
        occurrenceDate: "2026-07-01",
        amount: "20.00",
        status: "cleared",
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "record_investment_sip_contribution",
        expect.objectContaining({
          p_investment_sip_id: SIP_ID,
          p_occurrence_date: "2026-07-01",
          p_amount_minor_units: 2000,
          p_currency_code: "INR",
          p_next_due_date: "2026-07-02",
        }),
      );
      // Daily cadence with no end_date always has a next occurrence, so the
      // SIP must never be auto-completed here.
      expect(rpc).not.toHaveBeenCalledWith(
        "set_investment_sip_status",
        expect.anything(),
      );
    });

    it("auto-completes the SIP once its schedule is exhausted", async () => {
      const sipAtEnd = { ...BASE_SIP, end_date: "2026-07-01" };
      const fetchSip = queryStub({ data: sipAtEnd, error: null });
      const rpc = vi.fn().mockResolvedValue({
        data: { id: "investment-txn-1" },
        error: null,
      });
      const refetchSip = queryStub({
        data: { ...sipAtEnd, next_due_date: null, status: "completed" },
        error: null,
      });
      const from = vi
        .fn()
        .mockReturnValueOnce(fetchSip)
        .mockReturnValueOnce(refetchSip);
      createClient.mockResolvedValue({ from, rpc });

      const result = await recordSipContributionAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
        occurrenceDate: "2026-07-01",
        amount: "20.00",
        status: "cleared",
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "record_investment_sip_contribution",
        expect.objectContaining({ p_next_due_date: undefined }),
      );
      expect(rpc).toHaveBeenCalledWith(
        "set_investment_sip_status",
        expect.objectContaining({
          p_status: "completed",
          p_event_type: "completed",
        }),
      );
    });

    it("rejects recording a contribution against a non-active SIP", async () => {
      const pausedSip = { ...BASE_SIP, status: "paused" };
      const fetchSip = queryStub({ data: pausedSip, error: null });
      const rpc = vi.fn();
      createClient.mockResolvedValue({ from: () => fetchSip, rpc });

      const result = await recordSipContributionAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
        occurrenceDate: "2026-07-01",
        amount: "20.00",
        status: "cleared",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/active/i);
      }
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe("pauseSipAction", () => {
    it("calls set_investment_sip_status with status = paused", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { ...BASE_SIP, status: "paused" },
        error: null,
      });
      createClient.mockResolvedValue({ rpc });

      const result = await pauseSipAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "set_investment_sip_status",
        expect.objectContaining({
          p_investment_sip_id: SIP_ID,
          p_status: "paused",
          p_event_type: "paused",
        }),
      );
    });
  });

  describe("reactivateSipAction", () => {
    it("calls set_investment_sip_status with status = active, event_type = reactivated — undoing a misclicked 'completed'/'cancelled'", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { ...BASE_SIP, status: "active" },
        error: null,
      });
      createClient.mockResolvedValue({ rpc });

      const result = await reactivateSipAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "set_investment_sip_status",
        expect.objectContaining({
          p_investment_sip_id: SIP_ID,
          p_status: "active",
          p_event_type: "reactivated",
        }),
      );
    });
  });

  describe("catchUpSipContributionsAction", () => {
    it("bulk-records every elapsed daily contribution up to today as cleared, in one call", async () => {
      // start_date/next_due_date are weeks in the past — the exact "found
      // live" scenario (a 71-day-old daily SIP otherwise needing 71
      // separate recordSipContributionAction dialog submits).
      const fetchSip = queryStub({ data: BASE_SIP, error: null });
      const rpc = vi.fn().mockResolvedValue({
        data: { id: "investment-txn-1" },
        error: null,
      });
      createClient.mockResolvedValue({ from: () => fetchSip, rpc });

      const result = await catchUpSipContributionsAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
      });

      expect(result.ok).toBe(true);
      const contributionCalls = rpc.mock.calls.filter(
        (call) => call[0] === "record_investment_sip_contribution",
      );
      // BASE_SIP.next_due_date ("2026-07-01") is well in the past, so a
      // daily SIP with no end_date must catch up more than one occurrence.
      expect(contributionCalls.length).toBeGreaterThan(1);
      for (const call of contributionCalls) {
        expect(call[1]).toMatchObject({
          p_investment_sip_id: SIP_ID,
          p_amount_minor_units: BASE_SIP.contribution_amount_minor_units,
          p_status: "cleared",
        });
      }
      if (result.ok) {
        expect(result.data.recordedCount).toBe(contributionCalls.length);
      }
      // No end_date, so the schedule is never exhausted by catching up —
      // must not auto-complete the SIP.
      expect(rpc).not.toHaveBeenCalledWith(
        "set_investment_sip_status",
        expect.anything(),
      );
    });

    it("rejects catching up a non-active SIP", async () => {
      const pausedSip = { ...BASE_SIP, status: "paused" };
      const fetchSip = queryStub({ data: pausedSip, error: null });
      const rpc = vi.fn();
      createClient.mockResolvedValue({ from: () => fetchSip, rpc });

      const result = await catchUpSipContributionsAction(HOUSEHOLD_ID, {
        investmentSipId: SIP_ID,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/active/i);
      }
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
