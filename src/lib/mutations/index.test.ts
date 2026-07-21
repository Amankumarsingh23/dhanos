import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { NotFoundError, PermissionDeniedError } from "@/lib/errors/app-error";

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

// Imported after the mocks above so the module under test picks them up —
// vi.mock calls are hoisted by Vitest, but this keeps the intent explicit.
const { runHouseholdMutation } = await import("./index");

const FAKE_USER = { id: "user-1" };
const FAKE_MEMBERSHIP = { role: "editor" };
const FAKE_SUPABASE = { from: vi.fn() };

describe("runHouseholdMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireHouseholdRole.mockResolvedValue({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
    });
    createClient.mockResolvedValue(FAKE_SUPABASE);
    recordActivityEvent.mockResolvedValue(undefined);
  });

  const schema = z.object({ name: z.string().min(1, "Name is required") });

  it("rejects invalid input before ever resolving household authorization", async () => {
    const run = vi.fn();

    const result = await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner", "admin", "editor"],
      schema,
      input: { name: "" },
      run,
    });

    expect(result).toEqual({ ok: false, error: "Name is required" });
    expect(requireHouseholdRole).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("resolves user + household authorization, runs the write, and returns a typed ok result", async () => {
    const run = vi.fn().mockResolvedValue({ id: "created-1" });

    const result = await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner", "admin", "editor"],
      schema,
      input: { name: "Groceries" },
      run,
    });

    expect(requireHouseholdRole).toHaveBeenCalledWith("hh-1", [
      "owner",
      "admin",
      "editor",
    ]);
    expect(run).toHaveBeenCalledWith({
      user: FAKE_USER,
      membership: FAKE_MEMBERSHIP,
      supabase: FAKE_SUPABASE,
      householdId: "hh-1",
      input: { name: "Groceries" },
    });
    expect(result).toEqual({ ok: true, data: { id: "created-1" } });
  });

  it("records an activity event using the describer's output, against the same supabase client", async () => {
    const run = vi.fn().mockResolvedValue({ id: "created-1" });
    const activityEvent = vi.fn().mockReturnValue({
      householdId: "hh-1",
      eventType: "category.created",
      entityType: "transaction_category",
      entityId: "created-1",
    });

    await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner"],
      schema,
      input: { name: "Groceries" },
      run,
      activityEvent,
    });

    expect(activityEvent).toHaveBeenCalledWith({
      input: { name: "Groceries" },
      output: { id: "created-1" },
    });
    expect(recordActivityEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      householdId: "hh-1",
      eventType: "category.created",
      entityType: "transaction_category",
      entityId: "created-1",
    });
  });

  it("skips recording an activity event when the describer returns null", async () => {
    const run = vi.fn().mockResolvedValue({ id: "created-1" });
    const activityEvent = vi.fn().mockReturnValue(null);

    await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner"],
      schema,
      input: { name: "Groceries" },
      run,
      activityEvent,
    });

    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  it("revalidates every given path after a successful write", async () => {
    const run = vi.fn().mockResolvedValue({ id: "created-1" });

    await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner"],
      schema,
      input: { name: "Groceries" },
      run,
      revalidatePaths: ["/app/expenses", "/app/dashboard"],
    });

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, "/app/expenses");
    expect(revalidatePath).toHaveBeenNthCalledWith(2, "/app/dashboard");
  });

  it("does not revalidate or record an activity event when the write itself fails", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom"));
    const activityEvent = vi.fn();

    const result = await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner"],
      schema,
      input: { name: "Groceries" },
      run,
      activityEvent,
      revalidatePaths: ["/app/expenses"],
    });

    expect(result.ok).toBe(false);
    expect(activityEvent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // Workspace-scoping acceptance criterion: a caller who isn't an active
  // member of householdId (or isn't in an allowed role) never reaches
  // `run` at all — requireHouseholdRole is the sole gate, exercised here
  // via its own thrown errors rather than a live database, mirroring how
  // tests/e2e/household-isolation.spec.ts proves the same boundary against
  // the real RLS-enforced API.
  it("never runs the write when the caller is not a member of the household", async () => {
    requireHouseholdRole.mockRejectedValue(new NotFoundError());
    const run = vi.fn();

    const result = await runHouseholdMutation({
      householdId: "someone-elses-household",
      allowedRoles: ["owner", "admin", "editor"],
      schema,
      input: { name: "Groceries" },
      run,
    });

    expect(run).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: "The requested item could not be found.",
    });
  });

  it("never runs the write when the caller's role isn't allowed", async () => {
    requireHouseholdRole.mockRejectedValue(new PermissionDeniedError());
    const run = vi.fn();

    const result = await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner", "admin"],
      schema,
      input: { name: "Groceries" },
      run,
    });

    expect(run).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("never exposes a raw database error message to the client", async () => {
    const rawDbError = new Error(
      'insert or update on table "transactions" violates foreign key constraint "transactions_account_id_fkey"',
    );
    const run = vi.fn().mockRejectedValue(rawDbError);

    const result = await runHouseholdMutation({
      householdId: "hh-1",
      allowedRoles: ["owner"],
      schema,
      input: { name: "Groceries" },
      run,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Something went wrong. Please try again.");
      expect(result.error).not.toMatch(/constraint|foreign key|sql/i);
    }
  });
});
