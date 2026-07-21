import { describe, expect, it, vi } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { recordActivityEvent } from "./index";

function fakeSupabase(error: PostgrestError | null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return {
    client: { from } as unknown as Parameters<typeof recordActivityEvent>[0],
    from,
    insert,
  };
}

describe("recordActivityEvent", () => {
  it("inserts a row shaped for the activity_events table", async () => {
    const { client, from, insert } = fakeSupabase(null);

    await recordActivityEvent(client, {
      householdId: "hh-1",
      eventType: "transaction.created",
      entityType: "transaction",
      entityId: "txn-1",
      metadata: { amountMinorUnits: 1000 },
    });

    expect(from).toHaveBeenCalledWith("activity_events");
    expect(insert).toHaveBeenCalledWith({
      household_id: "hh-1",
      event_type: "transaction.created",
      entity_type: "transaction",
      entity_id: "txn-1",
      metadata: { amountMinorUnits: 1000 },
    });
  });

  it("defaults entity_id to null and metadata to {} when omitted", async () => {
    const { client, insert } = fakeSupabase(null);

    await recordActivityEvent(client, {
      householdId: "hh-1",
      eventType: "account.closed",
      entityType: "financial_account",
    });

    expect(insert).toHaveBeenCalledWith({
      household_id: "hh-1",
      event_type: "account.closed",
      entity_type: "financial_account",
      entity_id: null,
      metadata: {},
    });
  });

  it("throws a mapped AppError, not the raw PostgrestError, on failure", async () => {
    const { client } = fakeSupabase({
      name: "PostgrestError",
      message: "insufficient_privilege",
      details: "",
      hint: "",
      code: "42501",
    } as PostgrestError);

    await expect(
      recordActivityEvent(client, {
        householdId: "hh-1",
        eventType: "transaction.created",
        entityType: "transaction",
      }),
    ).rejects.toThrow(/permission/i);
  });
});
