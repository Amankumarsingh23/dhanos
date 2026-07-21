"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getRequestOrigin } from "@/lib/auth/request-origin";
import { mapAuthError } from "@/lib/errors/auth";
import { actionError, type ActionResult } from "@/lib/mutations";
import {
  emailSchema,
  forgotPasswordSchema,
  onboardingSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ForgotPasswordValues,
  type OnboardingValues,
  type ResetPasswordValues,
  type SignInValues,
  type SignUpValues,
} from "@/lib/validation/auth";

/**
 * Server Actions are the only place auth mutations happen — all of them go
 * through src/lib/supabase/server.ts's cookie-aware client, never the
 * service-role client (see docs/security-model.md §3). Every action
 * re-validates input with the same zod schema the form used client-side;
 * never trust the client payload as-is.
 *
 * `ActionResult` (imported from src/lib/mutations, not redefined here) is
 * the same typed-safe-result shape every household-scoped mutation uses
 * (see docs/data-access-patterns.md) — auth actions predate that module
 * but share its result type rather than a second, divergent one. A "use
 * server" file may only export async functions, so the type itself isn't
 * re-exported from here — import it from "@/lib/mutations" directly.
 * These actions don't go through runHouseholdMutation itself: they run
 * before a household exists (sign-up) or without one at all
 * (sign-in/reset), so there's no household authorization step to resolve.
 */

function invalid(message: string): ActionResult<never> {
  return actionError(message);
}

const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

export async function signInAction(
  values: SignInValues,
): Promise<ActionResult<{ userId: string }>> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return {
      ok: false,
      error: error ? mapAuthError(error) : "Invalid email or password.",
    };
  }

  return { ok: true, data: { userId: data.user.id } };
}

export async function signUpAction(
  values: SignUpValues,
): Promise<ActionResult<{ verified: boolean }>> {
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?type=signup&next=${encodeURIComponent("/onboarding")}`,
    },
  });

  if (error) {
    return { ok: false, error: mapAuthError(error) };
  }
  if (!data.user) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // No session yet means email confirmation is required before sign-in.
  return { ok: true, data: { verified: Boolean(data.session) } };
}

/** Bound directly to `<form action={signOutAction}>` — no client JS needed. */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordResetAction(
  values: ForgotPasswordValues,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${origin}/auth/callback?type=recovery&next=${encodeURIComponent("/reset-password")}`,
    },
  );

  // Whether the email exists or not, the response is identical — confirming
  // it either way is a user-enumeration leak (see docs/security-model.md
  // §6). Only a genuine rate limit is worth surfacing distinctly.
  if (error && error.code && RATE_LIMIT_CODES.has(error.code)) {
    return { ok: false, error: mapAuthError(error) };
  }

  return { ok: true, data: undefined };
}

export async function resetPasswordAction(
  values: ResetPasswordValues,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  // Reaching this page requires a session established via the recovery
  // link's /auth/callback exchange — no session means an expired/reused
  // link, not a normal "please sign in" case.
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error:
        "Your reset link has expired or was already used. Please request a new one.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: mapAuthError(error) };
  }

  return { ok: true, data: undefined };
}

export async function resendVerificationAction(
  email: string,
): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return invalid("Enter a valid email address.");
  }

  const origin = await getRequestOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback?type=signup&next=${encodeURIComponent("/onboarding")}`,
    },
  });

  if (error && error.code && RATE_LIMIT_CODES.has(error.code)) {
    return { ok: false, error: mapAuthError(error) };
  }

  return { ok: true, data: undefined };
}

export async function completeOnboardingAction(
  values: OnboardingValues,
): Promise<ActionResult<{ householdId: string }>> {
  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      error: "Your session has expired. Please sign in again.",
    };
  }

  const supabase = await createClient();
  // Explicit .eq("id", user.id) rather than relying on RLS alone to select
  // the right row — RLS is still the enforced boundary, this is the
  // redundant application-layer scoping docs/security-model.md §6 calls for.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      locale: parsed.data.locale,
      default_currency_code: parsed.data.baseCurrencyCode,
    })
    .eq("id", user.id);

  if (profileError) {
    return {
      ok: false,
      error: "Could not save your profile. Please try again.",
    };
  }

  // get_or_create_household is idempotent (see
  // supabase/migrations/20260721051051_household_memberships.sql) — a
  // retry (double submit, dropped response) returns the user's existing
  // household rather than creating a second one.
  const { data: householdId, error: householdError } = await supabase.rpc(
    "get_or_create_household",
    {
      p_name: parsed.data.householdName,
      p_base_currency_code: parsed.data.baseCurrencyCode,
      p_timezone: parsed.data.timezone,
      p_financial_month_start_day: parsed.data.financialMonthStartDay,
    },
  );

  if (householdError || !householdId) {
    return {
      ok: false,
      error: "Could not set up your household. Please try again.",
    };
  }

  return { ok: true, data: { householdId } };
}
