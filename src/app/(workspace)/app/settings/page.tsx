import type { Metadata } from "next";
import {
  canManageHousehold,
  requireHousehold,
} from "@/lib/households/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createSignedDownloadUrl } from "@/lib/storage";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ProfileSection } from "@/features/settings/profile-section";
import { HouseholdSection } from "@/features/settings/household-section";
import { HouseholdMembersSection } from "@/features/settings/household-members-section";
import { PrivacySection } from "@/features/settings/privacy-section";
import { DataSection } from "@/features/settings/data-section";
import { DangerousActionsSection } from "@/features/settings/dangerous-actions-section";
import { getArchivedRecordsSummary } from "@/features/settings/queries";

export const metadata: Metadata = {
  title: "Settings — DhanOS",
};

const AVATAR_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Settings (PROMPT 40): Profile, Household, Privacy, and Data, each its own
 * section. Household edits (name/base currency/timezone/financial
 * month/default goal assumptions) are gated to owner/admin both here
 * (`canManage`, hiding the submit control) and, independently, at the RLS
 * and Server Action layer (`updateHouseholdSettingsAction`'s
 * `allowedRoles`) — "Only owner/admin can update household settings" holds
 * even if a viewer/editor bypassed this page's own UI gating entirely.
 */
export default async function SettingsPage() {
  const { household, membership } = await requireHousehold();
  const profile = await getCurrentProfile();

  if (!profile) {
    // Every authenticated user has a profile row provisioned by the
    // handle_new_user trigger (see supabase/migrations/20260721024731_profiles.sql)
    // — reaching this branch would mean that invariant broke.
    return null;
  }

  const supabase = await createClient();
  const [archivedRecords, avatarUrl] = await Promise.all([
    getArchivedRecordsSummary(supabase, household.id),
    profile.avatar_path
      ? createSignedDownloadUrl(
          "avatars",
          profile.avatar_path,
          AVATAR_SIGNED_URL_TTL_SECONDS,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  const canManage = canManageHousehold(membership.role);
  const isOwner = membership.role === "owner";

  return (
    <PageShell size="default">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Settings" }]} />}
        title="Settings"
        description="Profile, household, privacy, and data controls."
      />
      <div className="space-y-6">
        <ProfileSection profile={profile} avatarUrl={avatarUrl} />
        <HouseholdSection household={household} canManage={canManage} />
        <HouseholdMembersSection currentUserRole={membership.role} />
        <PrivacySection profile={profile} />
        <DataSection
          householdId={household.id}
          archivedRecords={archivedRecords}
          canExport={canManage}
        />
        <DangerousActionsSection
          householdId={household.id}
          householdName={household.name}
          isOwner={isOwner}
        />
      </div>
    </PageShell>
  );
}
