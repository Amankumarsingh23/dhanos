import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { NotFoundError, PermissionDeniedError } from "@/lib/errors/app-error";
import { can, type HouseholdRole } from "@/lib/permissions";
import type { Tables } from "@/types/database";

/**
 * Centralized household authorization helpers (see docs/security-model.md
 * §3 and §6). `requireUser` is re-exported here so every one of the five
 * documented helpers — requireUser, requireHousehold, requireHouseholdMember,
 * requireHouseholdRole, canManageHousehold — has one import surface.
 *
 * `requireHousehold` is a *page-gating* helper (redirects) for Server
 * Components that need "the current user's household" with no id in the
 * URL. `requireHouseholdMember`/`requireHouseholdRole` are *data-layer*
 * helpers (throw) for anything that receives a household_id from client
 * input (a route param, a form field) — they always re-check that id
 * against the database, never trusting it just because it was submitted
 * (see docs/security-model.md §6, IDOR). Row Level Security remains the
 * actual enforcement point underneath all of these; they exist to fail
 * fast with a sensible UX/error before a query would have been rejected
 * anyway.
 */
export { requireUser };
export type { HouseholdRole };

export type Household = Tables<"households">;
export type HouseholdMembership = Tables<"household_memberships">;

/**
 * Requires a session and an active household membership, redirecting to
 * /onboarding otherwise. There is currently one household per user (see
 * the household_memberships_one_owner_per_user index in
 * supabase/migrations/20260721051051_household_memberships.sql), so "the"
 * household is unambiguous; a future multi-household UI would take an
 * explicit id and use requireHouseholdMember instead.
 */
export async function requireHousehold(): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  household: Household;
  membership: HouseholdMembership;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("household_memberships")
    .select("*, households(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!data?.households) {
    redirect("/onboarding");
  }

  const { households: household, ...membership } = data;
  return { user, household, membership };
}

/**
 * Returns the current user's household, or `null` if none exists yet —
 * the non-redirecting counterpart to requireHousehold, for pages (like
 * onboarding) that need to know whether one already exists without
 * forcing navigation.
 */
export async function getCurrentHousehold(): Promise<{
  household: Household;
  membership: HouseholdMembership;
} | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("household_memberships")
    .select("*, households(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!data?.households) {
    return null;
  }

  const { households: household, ...membership } = data;
  return { household, membership };
}

/**
 * Verifies the current user has an *active* membership in the specific
 * `householdId` given. Throws NotFoundError (not PermissionDeniedError)
 * when they don't — a non-member probing household ids should see "not
 * found" either way, whether the id exists at all or just isn't theirs.
 */
export async function requireHouseholdMember(householdId: string): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  membership: HouseholdMembership;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("household_memberships")
    .select("*")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    throw new NotFoundError("Household not found.");
  }

  return { user, membership };
}

/**
 * Like requireHouseholdMember, but also requires the membership's role to
 * be one of `allowedRoles`. Throws PermissionDeniedError (not NotFound) —
 * the caller is already a confirmed member at this point, so "forbidden"
 * is the honest answer.
 */
export async function requireHouseholdRole(
  householdId: string,
  allowedRoles: HouseholdRole[],
): Promise<{
  user: Awaited<ReturnType<typeof requireUser>>;
  membership: HouseholdMembership;
}> {
  const { user, membership } = await requireHouseholdMember(householdId);
  if (!allowedRoles.includes(membership.role as HouseholdRole)) {
    throw new PermissionDeniedError();
  }
  return { user, membership };
}

/** Owner and admin can manage household settings and membership; editor/viewer cannot. */
export function canManageHousehold(
  role: HouseholdRole | string | null | undefined,
): boolean {
  return role != null && can(role as HouseholdRole, "manage_household");
}
