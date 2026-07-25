"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { recordActivityEvent } from "@/lib/activity";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { reportActionError } from "@/lib/observability/report-action-error";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { sanitizeFileName } from "@/lib/calculations/documents";
import {
  archiveHouseholdSchema,
  updateHouseholdSettingsSchema,
  updatePrivacyPreferencesSchema,
  updateProfileSchema,
  type ArchiveHouseholdInput,
  type UpdateHouseholdSettingsInput,
  type UpdatePrivacyPreferencesInput,
  type UpdateProfileInput,
} from "@/lib/validation/settings";
import {
  EXPORT_ACTIVITY_EVENT_TYPE,
  exportCsvTablesSchema,
  type ExportCsvTablesInput,
} from "@/lib/validation/export";
import {
  buildHouseholdJsonExport,
  buildHouseholdTablesCsv,
  type HouseholdCsvExport,
  type HouseholdJsonExport,
} from "./export/build";
import { checkExportRateLimit } from "./export/rate-limit";

/**
 * Settings Server Actions (PROMPT 40). Profile and privacy preferences are
 * self-scoped (RLS: "users can update their own profile", `id = auth.uid()`
 * — no household role check applies, the same shape completeOnboardingAction
 * already uses for the profile row). Household settings and household
 * archival go through the standard household-scoped mutation contract (see
 * docs/data-access-patterns.md) with an explicit `allowedRoles` check —
 * "Only owner/admin can update household settings" (archival is
 * owner-only, stricter than the general manage_household permission, since
 * it's the one action here that's meant to feel deliberately harder to
 * reach than an ordinary settings edit).
 */

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<ActionResult<undefined>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        timezone: parsed.data.timezone,
        locale: parsed.data.locale,
        default_currency_code: parsed.data.defaultCurrencyCode,
      })
      .eq("id", user.id);

    if (error) {
      throw mapSupabaseError(error);
    }

    revalidatePath("/app/settings");
    return actionOk(undefined);
  } catch (error) {
    return actionError(reportActionError(error, "settings.update_profile"));
  }
}

function buildAvatarStoragePath(userId: string, fileName: string): string {
  return `${userId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export async function prepareAvatarUploadAction(
  fileName: string,
): Promise<ActionResult<{ storagePath: string }>> {
  try {
    const user = await requireUser();
    return actionOk({ storagePath: buildAvatarStoragePath(user.id, fileName) });
  } catch (error) {
    return actionError(
      reportActionError(error, "settings.prepare_avatar_upload"),
    );
  }
}

/** Saves the already-uploaded avatar's Storage path and removes the previous one, if any — one avatar per profile, never an accumulating set of orphaned objects. */
export async function saveAvatarAction(
  storagePath: string,
): Promise<ActionResult<undefined>> {
  try {
    const user = await requireUser();
    // Defense in depth alongside the avatars bucket's own RLS (see
    // supabase/migrations/20260727100000_settings_preferences.sql): never
    // trust a client-submitted path without re-checking its own claimed
    // ownership segment (docs/security-model.md §6, IDOR).
    if (!storagePath.startsWith(`${user.id}/`)) {
      return actionError("That upload doesn't belong to your account.");
    }

    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: storagePath })
      .eq("id", user.id);
    if (error) {
      throw mapSupabaseError(error);
    }

    if (profile?.avatar_path && profile.avatar_path !== storagePath) {
      await supabase.storage.from("avatars").remove([profile.avatar_path]);
    }

    revalidatePath("/app/settings");
    return actionOk(undefined);
  } catch (error) {
    return actionError(reportActionError(error, "settings.save_avatar"));
  }
}

export async function removeAvatarAction(): Promise<ActionResult<undefined>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", user.id);
    if (error) {
      throw mapSupabaseError(error);
    }

    if (profile?.avatar_path) {
      await supabase.storage.from("avatars").remove([profile.avatar_path]);
    }

    revalidatePath("/app/settings");
    return actionOk(undefined);
  } catch (error) {
    return actionError(reportActionError(error, "settings.remove_avatar"));
  }
}

export async function updatePrivacyPreferencesAction(
  input: UpdatePrivacyPreferencesInput,
): Promise<ActionResult<undefined>> {
  const parsed = updatePrivacyPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        privacy_default_concealed: parsed.data.privacyDefaultConcealed,
        privacy_conceal_dashboard_on_launch:
          parsed.data.privacyConcealDashboardOnLaunch,
        privacy_screenshot_sensitive_mode:
          parsed.data.privacyScreenshotSensitiveMode,
        privacy_inactivity_timeout_minutes:
          parsed.data.privacyInactivityTimeoutMinutes,
        notifications_include_amounts: parsed.data.notificationsIncludeAmounts,
      })
      .eq("id", user.id);

    if (error) {
      throw mapSupabaseError(error);
    }

    revalidatePath("/app/settings");
    return actionOk(undefined);
  } catch (error) {
    return actionError(
      reportActionError(error, "settings.update_privacy_preferences"),
    );
  }
}

export async function updateHouseholdSettingsAction(
  householdId: string,
  input: UpdateHouseholdSettingsInput,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: updateHouseholdSettingsSchema,
    input,
    actionName: "settings.update_household",
    run: async ({ supabase, input }) => {
      const { error } = await supabase
        .from("households")
        .update({
          name: input.name,
          base_currency_code: input.baseCurrencyCode,
          timezone: input.timezone,
          financial_month_start_day: input.financialMonthStartDay,
          default_goal_annual_inflation_rate:
            input.defaultGoalAnnualInflationRate,
          default_goal_annual_expected_return:
            input.defaultGoalAnnualExpectedReturn,
        })
        .eq("id", householdId);
      if (error) {
        throw mapSupabaseError(error);
      }
      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "household.settings_updated",
      entityType: "household",
      entityId: householdId,
    }),
    revalidatePaths: [
      "/app/settings",
      "/app",
      "/app/goals",
      "/app/net-worth",
      "/app/reminders",
      "/app/monthly-closing",
    ],
  });
}

/**
 * The one "dangerous action" this Settings page offers (PROMPT 40) — safe
 * by construction: it only ever sets households.deleted_at, the same
 * append-only-history-preserving "archived, not deleted" convention every
 * other entity in this app already follows (docs/money-calculation-rules.md
 * §3). Owner-only (stricter than updateHouseholdSettingsAction's
 * owner-or-admin), and requires typing the household's *current* exact
 * name — a deliberate confirmation, not a single "are you sure?" click.
 */
export async function archiveHouseholdAction(
  householdId: string,
  input: ArchiveHouseholdInput,
): Promise<ActionResult<undefined>> {
  const parsed = archiveHouseholdSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const { user } = await requireHouseholdRole(householdId, ["owner"]);
    const supabase = await createClient();

    const { data: household } = await supabase
      .from("households")
      .select("name, deleted_at")
      .eq("id", householdId)
      .maybeSingle();

    if (!household || household.deleted_at) {
      return actionError("This household is already archived.");
    }
    if (parsed.data.confirmName.trim() !== household.name) {
      return actionError("Type the household's exact name to confirm.");
    }

    const { error } = await supabase
      .from("households")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", householdId);
    if (error) {
      throw mapSupabaseError(error);
    }

    await recordActivityEvent(supabase, {
      householdId,
      eventType: "household.archived",
      entityType: "household",
      entityId: householdId,
      metadata: { archivedBy: user.id },
    });

    return actionOk(undefined);
  } catch (error) {
    return actionError(
      reportActionError(error, "settings.archive_household", {
        householdId,
      }),
    );
  }
}

/**
 * Full household data export, JSON format (PROMPT 42 — supersedes PROMPT
 * 40's original, which allowed any active member). "Owner/admin only for
 * complete household export" (PROMPT 42's own security requirement) is
 * enforced here via requireHouseholdRole, not just hidden in the UI — see
 * DataSection's canExport prop for the matching client-side gate.
 *
 * Order matters: role check → rate limit check (cheap, before doing any
 * real work) → the actual export queries → activity event logged last,
 * after the export data is already known to exist, so the log always
 * reflects a real completed export rather than an attempt that later
 * failed.
 */
export async function exportHouseholdDataAction(
  householdId: string,
): Promise<ActionResult<HouseholdJsonExport>> {
  try {
    const { user } = await requireHouseholdRole(householdId, [
      "owner",
      "admin",
    ]);
    const supabase = await createClient();
    await checkExportRateLimit(supabase, householdId);

    const data = await buildHouseholdJsonExport(supabase, householdId);

    await recordActivityEvent(supabase, {
      householdId,
      eventType: EXPORT_ACTIVITY_EVENT_TYPE,
      entityType: "household",
      entityId: householdId,
      metadata: {
        exportedBy: user.id,
        format: "json",
        schemaVersion: data.schemaVersion,
        truncatedTables: data.truncatedTables,
        failedTables: data.failedTables,
      },
    });

    return actionOk(data);
  } catch (error) {
    return actionError(
      reportActionError(error, "settings.export_household_json", {
        householdId,
      }),
    );
  }
}

/**
 * Selected-table CSV export (PROMPT 42's other format). One Server Action
 * call covers every table the user checked, so exactly one rate-limit
 * check and one activity event cover the whole batch — clicking five
 * checkboxes and exporting is one "export" for rate-limiting purposes,
 * not five. Same owner/admin gate as the JSON export above; a table that
 * fails to fetch is reported back in `failedTables` rather than failing
 * the whole request, so the other selected tables still come through.
 */
export async function exportHouseholdTablesCsvAction(
  householdId: string,
  input: ExportCsvTablesInput,
): Promise<ActionResult<HouseholdCsvExport>> {
  const parsed = exportCsvTablesSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    const { user } = await requireHouseholdRole(householdId, [
      "owner",
      "admin",
    ]);
    const supabase = await createClient();
    await checkExportRateLimit(supabase, householdId);

    const result = await buildHouseholdTablesCsv(
      supabase,
      householdId,
      parsed.data.tables,
    );

    await recordActivityEvent(supabase, {
      householdId,
      eventType: EXPORT_ACTIVITY_EVENT_TYPE,
      entityType: "household",
      entityId: householdId,
      metadata: {
        exportedBy: user.id,
        format: "csv",
        tables: parsed.data.tables,
        failedTables: result.failedTables,
      },
    });

    return actionOk(result);
  } catch (error) {
    return actionError(
      reportActionError(error, "settings.export_household_csv", {
        householdId,
      }),
    );
  }
}
