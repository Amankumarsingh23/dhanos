"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError, toUserMessage } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  reminderIdSchema,
  snoozeReminderSchema,
  type SnoozeReminderInput,
} from "@/lib/validation/reminders";
import { syncReminders } from "./sync";
import type { ReminderRecord } from "./queries";
import type { TablesUpdate } from "@/types/database";

/**
 * Server Actions for the financial calendar (PROMPT 35) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation.
 *
 * snoozeReminderAction/skipReminderAction/completeReminderAction/
 * reopenReminderAction each touch exactly one column set on this table
 * alone — never any source table (loans, investment_sips, ...). That is
 * the entire mechanism behind "reminder completion and payment remain
 * separate" (PROMPT 35 acceptance criterion): there is no code path from
 * here into a payment/contribution/premium table to even accidentally
 * write to.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const REMINDERS_REVALIDATE_PATHS = ["/app/reminders"];

/**
 * Regenerates this household's reminders on demand (the manual "Refresh"
 * button) — the same syncReminders() the reminders page itself calls
 * best-effort on every load (src/app/(workspace)/app/reminders/page.tsx).
 * Not built on runHouseholdMutation: there is no single-shaped input to
 * validate, matching generateDueOccurrencesAction's own manual
 * try/catch/revalidate shape (src/features/recurring/actions.ts) for the
 * same reason.
 */
export async function syncRemindersAction(
  householdId: string,
): Promise<ActionResult<undefined>> {
  try {
    await requireHouseholdRole(householdId, [...WRITE_ROLES]);
    const supabase = await createClient();

    const householdResponse = await supabase
      .from("households")
      .select("id, timezone")
      .eq("id", householdId)
      .maybeSingle();
    if (householdResponse.error) {
      throw mapSupabaseError(householdResponse.error);
    }
    if (!householdResponse.data) {
      throw new NotFoundError();
    }

    await syncReminders(supabase, householdResponse.data);

    revalidatePath("/app/reminders");
    return actionOk(undefined);
  } catch (error) {
    return actionError(toUserMessage(error));
  }
}

async function updateReminder(
  householdId: string,
  reminderId: string,
  fields: TablesUpdate<"reminders">,
  eventType: string,
): Promise<ActionResult<ReminderRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reminderIdSchema,
    input: { reminderId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("reminders")
        .update(fields)
        .eq("id", values.reminderId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType,
      entityType: "reminder",
      entityId: output.id,
      metadata: { reminderType: output.reminder_type },
    }),
    revalidatePaths: [...REMINDERS_REVALIDATE_PATHS],
  });
}

export async function completeReminderAction(
  householdId: string,
  reminderId: string,
): Promise<ActionResult<ReminderRecord>> {
  return updateReminder(
    householdId,
    reminderId,
    { status: "completed", completed_at: new Date().toISOString() },
    "reminder.completed",
  );
}

export async function skipReminderAction(
  householdId: string,
  reminderId: string,
): Promise<ActionResult<ReminderRecord>> {
  return updateReminder(
    householdId,
    reminderId,
    { status: "skipped", completed_at: null },
    "reminder.skipped",
  );
}

/** Back to pending, clearing every acknowledgement field — undoes a mistaken complete/skip/snooze. */
export async function reopenReminderAction(
  householdId: string,
  reminderId: string,
): Promise<ActionResult<ReminderRecord>> {
  return updateReminder(
    householdId,
    reminderId,
    { status: "pending", completed_at: null, snoozed_until: null },
    "reminder.reopened",
  );
}

export async function snoozeReminderAction(
  householdId: string,
  input: SnoozeReminderInput,
): Promise<ActionResult<ReminderRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: snoozeReminderSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("reminders")
        .update({ snoozed_until: values.snoozedUntil })
        .eq("id", values.reminderId)
        .eq("household_id", householdId)
        .eq("status", "pending")
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "reminder.snoozed",
      entityType: "reminder",
      entityId: output.id,
      metadata: {
        reminderType: output.reminder_type,
        snoozedUntil: output.snoozed_until,
      },
    }),
    revalidatePaths: [...REMINDERS_REVALIDATE_PATHS],
  });
}
