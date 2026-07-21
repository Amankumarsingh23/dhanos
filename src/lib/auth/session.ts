import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

/** Returns the authenticated user, or `null` if there is no active session. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the authenticated user, redirecting to sign-in if there is none.
 * Use at the top of any Server Component/layout that requires a session —
 * this is a UX convenience, not a security boundary. Row Level Security is
 * the actual enforcement point (see docs/security-model.md §3).
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Returns the current user's profile row, or `null` if there's no session.
 * Every authenticated user has exactly one profile row, provisioned by the
 * `handle_new_user` database trigger the moment their auth.users row is
 * created — see supabase/migrations/20260721024731_profiles.sql — so a
 * `null` result here (while a user IS present) would indicate a bug, not a
 * normal state to branch on.
 */
export async function getCurrentProfile(): Promise<Tables<"profiles"> | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

/** A profile counts as onboarded once it has a display name. */
export function isProfileOnboarded(profile: Tables<"profiles">): boolean {
  return Boolean(profile.full_name && profile.full_name.trim().length > 0);
}

/**
 * Requires both a session and a completed onboarding profile, redirecting
 * to /onboarding otherwise. Use at the top of the authenticated app shell
 * (not the onboarding page itself, which only needs `requireUser`).
 */
export async function requireOnboardedUser() {
  const user = await requireUser();
  const profile = await getCurrentProfile();
  if (!profile || !isProfileOnboarded(profile)) {
    redirect("/onboarding");
  }
  return { user, profile };
}
