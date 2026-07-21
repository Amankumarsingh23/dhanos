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
  archivePersonAction,
  createPersonAction,
  restorePersonAction,
  updatePersonAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ROW = {
  id: "22222222-2222-4222-8222-222222222222",
  household_id: HOUSEHOLD_ID,
  display_name: "Priya Sharma",
  relationship_type: "spouse",
  user_id: null,
  birth_date: null,
  notes: null,
  is_active: true,
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

describe("people actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createPersonAction", () => {
    it("rejects a blank display name before touching the database", async () => {
      const result = await createPersonAction(HOUSEHOLD_ID, {
        displayName: "",
        relationshipType: "spouse",
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("creates a person, records an activity event, and revalidates /app/people", async () => {
      const from = vi.fn(() => queryStub({ data: PERSON_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createPersonAction(HOUSEHOLD_ID, {
        displayName: "Priya Sharma",
        relationshipType: "spouse",
      });

      expect(requireHouseholdRole).toHaveBeenCalledWith(HOUSEHOLD_ID, [
        "owner",
        "admin",
        "editor",
      ]);
      expect(from).toHaveBeenCalledWith("people");
      expect(result).toEqual({ ok: true, data: PERSON_ROW });
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          householdId: HOUSEHOLD_ID,
          eventType: "person.created",
          entityType: "person",
          entityId: PERSON_ROW.id,
        }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/app/people");
    });

    it("represents 'self' as a valid relationship — a person can be the user themself", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...PERSON_ROW, relationship_type: "self" },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await createPersonAction(HOUSEHOLD_ID, {
        displayName: "Me",
        relationshipType: "self",
      });

      expect(result.ok).toBe(true);
    });

    it("never exposes a raw database error", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: null,
          error: { code: "23505", message: "duplicate key value" },
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await createPersonAction(HOUSEHOLD_ID, {
        displayName: "Priya Sharma",
        relationshipType: "spouse",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/duplicate key|23505/i);
      }
    });
  });

  describe("updatePersonAction", () => {
    it("returns a not-found style error when no row matches the id + household", async () => {
      const from = vi.fn(() => queryStub({ data: null, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await updatePersonAction(
        HOUSEHOLD_ID,
        "33333333-3333-4333-8333-333333333333",
        {
          displayName: "Priya Sharma",
          relationshipType: "spouse",
        },
      );

      expect(result.ok).toBe(false);
    });

    it("updates and records person.updated", async () => {
      const from = vi.fn(() => queryStub({ data: PERSON_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await updatePersonAction(HOUSEHOLD_ID, PERSON_ROW.id, {
        displayName: "Priya Sharma",
        relationshipType: "spouse",
      });

      expect(result).toEqual({ ok: true, data: PERSON_ROW });
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "person.updated" }),
      );
    });
  });

  describe("archive / restore", () => {
    it("archives with the owner/admin role gate, not owner/admin/editor", async () => {
      const from = vi.fn(() =>
        queryStub({ data: { ...PERSON_ROW, is_active: false }, error: null }),
      );
      createClient.mockResolvedValue({ from });

      await archivePersonAction(HOUSEHOLD_ID, PERSON_ROW.id);

      expect(requireHouseholdRole).toHaveBeenCalledWith(HOUSEHOLD_ID, [
        "owner",
        "admin",
      ]);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "person.archived" }),
      );
    });

    it("restores an archived person back to active", async () => {
      const from = vi.fn(() =>
        queryStub({ data: { ...PERSON_ROW, is_active: true }, error: null }),
      );
      createClient.mockResolvedValue({ from });

      const result = await restorePersonAction(HOUSEHOLD_ID, PERSON_ROW.id);

      expect(result.ok).toBe(true);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "person.restored" }),
      );
    });
  });
});
