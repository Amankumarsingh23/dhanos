import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getCurrentProfile } from "@/lib/auth/session";
import { getCurrentHousehold } from "@/lib/households/permissions";
import { PageShell } from "@/components/layout/page-shell";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";

export const metadata: Metadata = {
  title: "Set up your account — DhanOS",
};

export default async function OnboardingPage() {
  await requireUser();
  const profile = await getCurrentProfile();

  if (!profile) {
    // Every authenticated user has a profile row provisioned by the
    // handle_new_user trigger the instant their auth.users row is created
    // (see supabase/migrations/20260721024731_profiles.sql) — reaching this
    // branch would mean that invariant broke, not a normal empty state.
    redirect("/login");
  }

  // Non-null if the user already has a household (e.g. revisiting
  // onboarding to edit, or a retry after a prior successful submit) — used
  // to prefill the form rather than to skip it.
  const existing = await getCurrentHousehold();

  return (
    <PageShell size="narrow">
      <OnboardingForm
        profile={profile}
        household={existing?.household ?? null}
      />
    </PageShell>
  );
}
