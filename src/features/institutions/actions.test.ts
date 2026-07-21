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
  archiveInstitutionAction,
  createInstitutionAction,
  restoreInstitutionAction,
  updateInstitutionAction,
} = await import("./actions");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";
const INSTITUTION_ID = "22222222-2222-4222-8222-222222222222";

const INSTITUTION_ROW = {
  id: INSTITUTION_ID,
  household_id: HOUSEHOLD_ID,
  name: "HDFC Bank",
  institution_type: "bank",
  website: "hdfcbank.com",
  platform_name: null,
  support_phone: null,
  support_email: null,
  notes: null,
  is_archived: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
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

describe("institutions actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    recordActivityEvent.mockResolvedValue(undefined);
  });

  describe("createInstitutionAction", () => {
    it("rejects a blank name before touching the database", async () => {
      const result = await createInstitutionAction(HOUSEHOLD_ID, {
        name: "",
        institutionType: "bank",
      });
      expect(result.ok).toBe(false);
      expect(requireHouseholdRole).not.toHaveBeenCalled();
    });

    it("creates when no existing institution matches, and records institution.created", async () => {
      const from = vi
        .fn()
        // 1st call: the duplicate-check select — no existing institutions.
        .mockReturnValueOnce(queryStub({ data: [], error: null }))
        // 2nd call: the insert.
        .mockReturnValueOnce(queryStub({ data: INSTITUTION_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createInstitutionAction(HOUSEHOLD_ID, {
        name: "HDFC Bank",
        institutionType: "bank",
        website: "hdfcbank.com",
      });

      expect(result).toEqual({
        ok: true,
        data: { kind: "created", institution: INSTITUTION_ROW },
      });
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: "institution.created",
          entityId: INSTITUTION_ID,
        }),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/app/institutions");
    });

    it("warns instead of creating when an existing institution matches, and does not record an activity event", async () => {
      const from = vi.fn().mockReturnValueOnce(
        queryStub({
          data: [
            {
              id: "existing-1",
              name: "HDFC Bank",
              website: "hdfcbank.com",
              support_phone: null,
            },
          ],
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await createInstitutionAction(HOUSEHOLD_ID, {
        name: "HDFC MobileBanking",
        institutionType: "bank",
        website: "hdfcbank.com",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({
          kind: "duplicate_warning",
          matches: [
            {
              institutionId: "existing-1",
              institutionName: "HDFC Bank",
              reasons: ["domain"],
            },
          ],
        });
      }
      // Only the duplicate-check select ran — no insert.
      expect(from).toHaveBeenCalledTimes(1);
      expect(recordActivityEvent).not.toHaveBeenCalled();
    });

    it("creates anyway when confirmDuplicate is set, bypassing the warning", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(
          queryStub({
            data: [
              {
                id: "existing-1",
                name: "HDFC Bank",
                website: "hdfcbank.com",
                support_phone: null,
              },
            ],
            error: null,
          }),
        )
        .mockReturnValueOnce(queryStub({ data: INSTITUTION_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await createInstitutionAction(HOUSEHOLD_ID, {
        name: "HDFC MobileBanking",
        institutionType: "bank",
        website: "hdfcbank.com",
        confirmDuplicate: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.kind).toBe("created");
      }
      expect(recordActivityEvent).toHaveBeenCalled();
    });

    it("never exposes a raw database error", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: [], error: null }))
        .mockReturnValueOnce(
          queryStub({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          }),
        );
      createClient.mockResolvedValue({ from });

      const result = await createInstitutionAction(HOUSEHOLD_ID, {
        name: "HDFC Bank",
        institutionType: "bank",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).not.toMatch(/duplicate key|23505/i);
      }
    });
  });

  describe("updateInstitutionAction", () => {
    it("returns a not-found style error when no row matches the id + household", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: [], error: null }))
        .mockReturnValueOnce(queryStub({ data: null, error: null }));
      createClient.mockResolvedValue({ from });

      const result = await updateInstitutionAction(
        HOUSEHOLD_ID,
        INSTITUTION_ID,
        { name: "HDFC Bank", institutionType: "bank" },
      );

      expect(result.ok).toBe(false);
    });

    it("excludes itself from the duplicate check", async () => {
      const from = vi
        .fn()
        .mockReturnValueOnce(queryStub({ data: [], error: null }))
        .mockReturnValueOnce(queryStub({ data: INSTITUTION_ROW, error: null }));
      createClient.mockResolvedValue({ from });

      await updateInstitutionAction(HOUSEHOLD_ID, INSTITUTION_ID, {
        name: "HDFC Bank",
        institutionType: "bank",
      });

      const duplicateCheckBuilder = from.mock.results[0]?.value as {
        neq: ReturnType<typeof vi.fn>;
      };
      expect(duplicateCheckBuilder.neq).toHaveBeenCalledWith(
        "id",
        INSTITUTION_ID,
      );
    });
  });

  describe("archive / restore", () => {
    it("archives with the owner/admin role gate, not owner/admin/editor", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...INSTITUTION_ROW, is_archived: true },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      await archiveInstitutionAction(HOUSEHOLD_ID, INSTITUTION_ID);

      expect(requireHouseholdRole).toHaveBeenCalledWith(HOUSEHOLD_ID, [
        "owner",
        "admin",
      ]);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "institution.archived" }),
      );
    });

    it("restores an archived institution back to active", async () => {
      const from = vi.fn(() =>
        queryStub({
          data: { ...INSTITUTION_ROW, is_archived: false },
          error: null,
        }),
      );
      createClient.mockResolvedValue({ from });

      const result = await restoreInstitutionAction(
        HOUSEHOLD_ID,
        INSTITUTION_ID,
      );

      expect(result.ok).toBe(true);
      expect(recordActivityEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: "institution.restored" }),
      );
    });
  });
});
