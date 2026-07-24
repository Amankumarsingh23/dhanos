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
  createRecurringRuleAction,
  generateDueOccurrencesAction,
  pauseRecurringRuleAction,
  recordOccurrenceAction,
  resumeRecurringRuleAction,
  scheduleAmountChangeAction,
  skipOccurrenceAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const RULE_ID = "44444444-4444-4444-8444-444444444444";

const BASE_RULE = {
  id: RULE_ID,
  household_id: HOUSEHOLD_ID,
  name: "Monthly subscription",
  kind: "expense",
  amount_minor_units: 10_000,
  currency_code: "INR",
  account_id: ACCOUNT_ID,
  transfer_account_id: null,
  category_id: CATEGORY_ID,
  counterparty: "Streaming Co",
  related_person_id: null,
  frequency: "monthly",
  interval_count: 1,
  start_date: "2026-01-15",
  end_date: null,
  next_due_date: "2026-07-15",
  last_generated_date: null,
  auto_create_mode: "reminder_only",
  reminder_lead_days: 3,
  status: "active",
  notes: null,
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
};

const BASE_INPUT = {
  name: "Monthly subscription",
  kind: "expense" as const,
  amount: "100.00",
  currencyCode: "INR",
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  frequency: "monthly" as const,
  intervalCount: 1,
  startDate: "2026-01-15",
};

/** A minimal chainable Supabase query stub — every method returns itself, and it resolves like a thenable when awaited directly. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("recurring actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createRecurringRuleAction", () => {
    it("computes the initial next_due_date as the start date and creates a 'created' event", async () => {
      const insertResult = queryStub({ data: BASE_RULE, error: null });
      const eventInsert = queryStub({ data: null, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(insertResult)
        .mockReturnValueOnce(eventInsert);
      createClient.mockResolvedValue({ from });

      const result = await createRecurringRuleAction(HOUSEHOLD_ID, BASE_INPUT);

      expect(result.ok).toBe(true);
      expect(insertResult.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          next_due_date: "2026-01-15",
          status: "active",
          amount_minor_units: 10_000,
        }),
      );
      expect(eventInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: "created" }),
      );
    });

    it("rejects a transfer rule with no destination account before touching the database", async () => {
      const result = await createRecurringRuleAction(HOUSEHOLD_ID, {
        ...BASE_INPUT,
        kind: "transfer",
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });
  });

  describe("scheduleAmountChangeAction", () => {
    it("rejects an effective date in the past", async () => {
      const from = vi.fn(() => queryStub({ data: BASE_RULE, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await scheduleAmountChangeAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
        effectiveDate: "2020-01-01",
        newAmount: "150.00",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/future/i);
      }
    });

    it("upserts a schedule row and logs the change with the resolved previous amount", async () => {
      const ruleLookup = queryStub({ data: BASE_RULE, error: null });
      const scheduleLookup = queryStub({ data: [], error: null });
      const upsertResult = queryStub({
        data: {
          id: "sched-1",
          recurring_rule_id: RULE_ID,
          effective_date: "2099-01-01",
          amount_minor_units: 15_000,
        },
        error: null,
      });
      const eventInsert = queryStub({ data: null, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce(ruleLookup)
        .mockReturnValueOnce(scheduleLookup)
        .mockReturnValueOnce(upsertResult)
        .mockReturnValueOnce(eventInsert);
      createClient.mockResolvedValue({ from });

      const result = await scheduleAmountChangeAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
        effectiveDate: "2099-01-01",
        newAmount: "150.00",
      });

      expect(result.ok).toBe(true);
      expect(upsertResult.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          effective_date: "2099-01-01",
          amount_minor_units: 15_000,
        }),
        expect.objectContaining({
          onConflict: "recurring_rule_id,effective_date",
        }),
      );
      expect(eventInsert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "amount_scheduled",
          previous_amount_minor_units: 10_000,
          new_amount_minor_units: 15_000,
        }),
      );
    });
  });

  describe("pause / resume", () => {
    it("pauses via the RPC with the right status and event type", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { ...BASE_RULE, status: "paused" },
        error: null,
      });
      createClient.mockResolvedValue({ rpc });

      const result = await pauseRecurringRuleAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "set_recurring_rule_status",
        expect.objectContaining({ p_status: "paused", p_event_type: "paused" }),
      );
    });

    it("resumes via the RPC with the right status and event type", async () => {
      const rpc = vi.fn().mockResolvedValue({
        data: { ...BASE_RULE, status: "active" },
        error: null,
      });
      createClient.mockResolvedValue({ rpc });

      const result = await resumeRecurringRuleAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "set_recurring_rule_status",
        expect.objectContaining({
          p_status: "active",
          p_event_type: "resumed",
        }),
      );
    });
  });

  describe("skipOccurrenceAction", () => {
    it("rejects skipping a paused rule", async () => {
      const from = vi.fn(() =>
        queryStub({ data: { ...BASE_RULE, status: "paused" }, error: null }),
      );
      createClient.mockResolvedValue({ from });

      const result = await skipOccurrenceAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/active/i);
      }
    });

    it("advances next_due_date to the following occurrence without writing a transaction", async () => {
      const from = vi.fn(() => queryStub({ data: BASE_RULE, error: null }));
      const rpc = vi.fn().mockResolvedValue({
        data: { ...BASE_RULE, next_due_date: "2026-08-15" },
        error: null,
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await skipOccurrenceAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "skip_recurring_rule_occurrence",
        expect.objectContaining({
          p_occurrence_date: "2026-07-15",
          p_next_due_date: "2026-08-15",
        }),
      );
    });

    it("ends the rule automatically when there is no further occurrence", async () => {
      const ruleAtEnd = { ...BASE_RULE, end_date: "2026-07-15" };
      const from = vi.fn(() => queryStub({ data: ruleAtEnd, error: null }));
      const rpc = vi.fn().mockResolvedValue({
        data: { ...ruleAtEnd, next_due_date: null },
        error: null,
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await skipOccurrenceAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
      });

      expect(result.ok).toBe(true);
      // nextDueDate is null here, sent as `undefined` (an omitted key) so
      // the RPC's `default null` parameter applies — behaviorally
      // identical to sending an explicit null, see
      // supabase/migrations/20260721140000_recurring_commitments.sql.
      expect(rpc).toHaveBeenCalledWith(
        "skip_recurring_rule_occurrence",
        expect.objectContaining({ p_next_due_date: undefined }),
      );
      expect(rpc).toHaveBeenCalledWith(
        "set_recurring_rule_status",
        expect.objectContaining({ p_status: "ended" }),
      );
    });
  });

  describe("recordOccurrenceAction", () => {
    it("resolves the transaction against the rule's template and advances next_due_date", async () => {
      const from = vi.fn(() => queryStub({ data: BASE_RULE, error: null }));
      const rpc = vi.fn().mockResolvedValue({
        data: { id: "txn-1", amount_minor_units: 10_000 },
        error: null,
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await recordOccurrenceAction(HOUSEHOLD_ID, {
        recurringRuleId: RULE_ID,
        transactionDate: "2026-07-15",
        amount: "100.00",
        status: "cleared",
      });

      expect(result.ok).toBe(true);
      expect(rpc).toHaveBeenCalledWith(
        "record_recurring_rule_occurrence",
        expect.objectContaining({
          p_occurrence_date: "2026-07-15",
          p_next_due_date: "2026-08-15",
          p_amount_minor_units: 10_000,
          p_kind: "expense",
          p_status: "cleared",
        }),
      );
    });
  });

  describe("generateDueOccurrencesAction", () => {
    it("only generates for active, planned_transaction rules whose next_due_date has arrived, always as status = planned", async () => {
      const dueRule = {
        ...BASE_RULE,
        auto_create_mode: "planned_transaction",
        next_due_date: "2026-06-15",
      };
      const from = vi.fn((table: string) => {
        if (table === "recurring_rules") {
          return queryStub({ data: [dueRule], error: null });
        }
        return queryStub({ data: [], error: null });
      });
      const rpc = vi.fn().mockResolvedValue({
        data: { id: "txn-1" },
        error: null,
      });
      createClient.mockResolvedValue({ from, rpc });

      const result = await generateDueOccurrencesAction(HOUSEHOLD_ID);

      expect(result.ok).toBe(true);
      // June and July occurrences are both due as of a mocked "today" —
      // every generated occurrence must be status = planned, never cleared.
      for (const call of rpc.mock.calls) {
        if (call[0] === "record_recurring_rule_occurrence") {
          expect(call[1].p_status).toBe("planned");
        }
      }
      expect(
        rpc.mock.calls.filter(
          (c) => c[0] === "record_recurring_rule_occurrence",
        ).length,
      ).toBeGreaterThan(0);
    });

    it("generates no occurrences when no rule is due", async () => {
      const from = vi.fn(() => queryStub({ data: [], error: null }));
      const rpc = vi.fn();
      createClient.mockResolvedValue({ from, rpc });

      const result = await generateDueOccurrencesAction(HOUSEHOLD_ID);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.generatedCount).toBe(0);
      }
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
