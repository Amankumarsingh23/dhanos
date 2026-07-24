"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { toIsoDateString } from "@/lib/dates";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { toUserMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  computeInitialNextDueDate,
  computeNextOccurrenceAfter,
  resolveAmountForDate,
  type RecurringScheduleSource,
} from "@/lib/calculations/recurring-schedule";
import {
  pauseResumeRuleSchema,
  recordOccurrenceSchema,
  recurringRuleInputSchema,
  recurringRuleUpdateSchema,
  scheduleAmountChangeSchema,
  skipOccurrenceSchema,
  type PauseResumeRuleInput,
  type RecordOccurrenceInput,
  type RecurringFrequency,
  type RecurringRuleInput,
  type RecurringRuleUpdateInput,
  type ScheduleAmountChangeInput,
  type SkipOccurrenceInput,
} from "@/lib/validation/recurring-rules";
import type {
  RecurringRuleAmountScheduleRecord,
  RecurringRuleRecord,
} from "./queries";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Recurring commitments feature (PROMPT 14) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Pause/resume/skip/record
 * each go through a dedicated SECURITY INVOKER RPC (set_recurring_rule_status/
 * skip_recurring_rule_occurrence/record_recurring_rule_occurrence) because
 * each is a write spanning recurring_rules (+ transactions, for a
 * recorded occurrence) and recurring_rule_events together, and PostgREST
 * cannot span a client-visible transaction across two separate REST
 * calls. Creating a rule and scheduling a future amount change are each a
 * single authoritative write plus a best-effort history-log insert —
 * lower stakes than the RPCs above, so they're sequential, the same
 * convention runHouseholdMutation's own activityEvent step already uses.
 */

export type RecurringTransactionRecord = Tables<"transactions">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const RECURRING_REVALIDATE_PATHS = ["/app/recurring"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function toScheduleSource(rule: {
  frequency: string;
  interval_count: number;
  start_date: string;
  end_date: string | null;
}): RecurringScheduleSource {
  return {
    frequency: rule.frequency as RecurringFrequency,
    intervalCount: rule.interval_count,
    startDate: rule.start_date,
    endDate: rule.end_date,
  };
}

async function fetchRule(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleId: string,
): Promise<RecurringRuleRecord> {
  const response = await supabase
    .from("recurring_rules")
    .select("*")
    .eq("id", recurringRuleId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  if (!response.data) {
    throw new NotFoundError();
  }
  return response.data;
}

async function fetchAmountSchedule(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleId: string,
): Promise<RecurringRuleAmountScheduleRecord[]> {
  const response = await supabase
    .from("recurring_rule_amount_schedules")
    .select("*")
    .eq("household_id", householdId)
    .eq("recurring_rule_id", recurringRuleId)
    .order("effective_date", { ascending: true });
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  return response.data;
}

export async function createRecurringRuleAction(
  householdId: string,
  input: RecurringRuleInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recurringRuleInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        values.currencyCode,
      );
      const nextDueDate = computeInitialNextDueDate({
        frequency: values.frequency,
        intervalCount: values.intervalCount,
        startDate: values.startDate,
        endDate: values.endDate ?? null,
      });

      const response = await supabase
        .from("recurring_rules")
        .insert({
          household_id: householdId,
          name: values.name,
          kind: values.kind,
          amount_minor_units: amountMinorUnits,
          currency_code: values.currencyCode,
          account_id: values.accountId,
          transfer_account_id: values.transferAccountId ?? null,
          category_id: values.categoryId ?? null,
          counterparty: values.counterparty ?? null,
          related_person_id: values.relatedPersonId ?? null,
          frequency: values.frequency,
          interval_count: values.intervalCount,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          next_due_date: nextDueDate,
          auto_create_mode: values.autoCreateMode,
          reminder_lead_days: values.reminderLeadDays,
          status: "active",
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      await supabase.from("recurring_rule_events").insert({
        household_id: householdId,
        recurring_rule_id: response.data.id,
        event_type: "created",
      });

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "recurring_rule.created",
      entityType: "recurring_rule",
      entityId: output.id,
    }),
    revalidatePaths: [...RECURRING_REVALIDATE_PATHS],
  });
}

const updateRecurringRuleSchema = recurringRuleUpdateSchema.and(
  z.object({ recurringRuleId: uuidSchema }),
);

/**
 * Updates a rule's template fields only — never amount_minor_units
 * (see scheduleAmountChangeAction), status, or next_due_date (managed by
 * pause/resume/skip/record). Changing frequency/intervalCount/startDate
 * here only affects occurrences computed *after* this edit — the rule's
 * current next_due_date is left untouched.
 */
export async function updateRecurringRuleAction(
  householdId: string,
  recurringRuleId: string,
  input: RecurringRuleUpdateInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateRecurringRuleSchema,
    input: { ...input, recurringRuleId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("recurring_rules")
        .update({
          name: values.name,
          kind: values.kind,
          currency_code: values.currencyCode,
          account_id: values.accountId,
          transfer_account_id: values.transferAccountId ?? null,
          category_id: values.categoryId ?? null,
          counterparty: values.counterparty ?? null,
          related_person_id: values.relatedPersonId ?? null,
          frequency: values.frequency,
          interval_count: values.intervalCount,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          auto_create_mode: values.autoCreateMode,
          reminder_lead_days: values.reminderLeadDays,
          notes: values.notes ?? null,
        })
        .eq("id", values.recurringRuleId)
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
      eventType: "recurring_rule.updated",
      entityType: "recurring_rule",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...RECURRING_REVALIDATE_PATHS,
      `/app/recurring/${recurringRuleId}`,
    ],
  });
}

/**
 * Schedules a future amount change — PROMPT 14 "amount change from a
 * particular date." Always a new (or re-scheduled, same effective date)
 * recurring_rule_amount_schedules row, never an edit of the rule's own
 * amount_minor_units — an occurrence already generated keeps its own
 * independently-stored amount forever regardless.
 */
export async function scheduleAmountChangeAction(
  householdId: string,
  input: ScheduleAmountChangeInput,
): Promise<ActionResult<RecurringRuleAmountScheduleRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: scheduleAmountChangeSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const rule = await fetchRule(
        supabase,
        householdId,
        values.recurringRuleId,
      );
      const today = toIsoDateString(new Date());
      if (values.effectiveDate < today) {
        throw new ValidationError(
          "The effective date must be today or in the future — a past amount change would rewrite history.",
        );
      }

      const existingSchedule = await fetchAmountSchedule(
        supabase,
        householdId,
        values.recurringRuleId,
      );
      const previousAmountMinorUnits = resolveAmountForDate(
        rule.amount_minor_units,
        existingSchedule.map((s) => ({
          effectiveDate: s.effective_date,
          amountMinorUnits: s.amount_minor_units,
        })),
        values.effectiveDate,
      );
      const newAmountMinorUnits = parseDecimalToMinorUnits(
        values.newAmount,
        rule.currency_code,
      );

      const response = await supabase
        .from("recurring_rule_amount_schedules")
        .upsert(
          {
            household_id: householdId,
            recurring_rule_id: values.recurringRuleId,
            effective_date: values.effectiveDate,
            amount_minor_units: newAmountMinorUnits,
          },
          { onConflict: "recurring_rule_id,effective_date" },
        )
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      await supabase.from("recurring_rule_events").insert({
        household_id: householdId,
        recurring_rule_id: values.recurringRuleId,
        event_type: "amount_scheduled",
        effective_date: values.effectiveDate,
        previous_amount_minor_units: previousAmountMinorUnits,
        new_amount_minor_units: newAmountMinorUnits,
      });

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "recurring_rule.amount_scheduled",
      entityType: "recurring_rule",
      entityId: output.recurring_rule_id,
      metadata: { effectiveDate: output.effective_date },
    }),
    revalidatePaths: [
      ...RECURRING_REVALIDATE_PATHS,
      `/app/recurring/${input.recurringRuleId}`,
    ],
  });
}

async function setStatus(
  householdId: string,
  input: PauseResumeRuleInput,
  status: "active" | "paused" | "ended",
  eventType: "paused" | "resumed" | "ended",
): Promise<ActionResult<RecurringRuleRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: pauseResumeRuleSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase.rpc("set_recurring_rule_status", {
        p_household_id: householdId,
        p_recurring_rule_id: values.recurringRuleId,
        p_status: status,
        p_event_type: eventType,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: `recurring_rule.${eventType}`,
      entityType: "recurring_rule",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...RECURRING_REVALIDATE_PATHS,
      `/app/recurring/${input.recurringRuleId}`,
    ],
  });
}

/** Freezes a rule — next_due_date does not advance while paused, and no occurrence can be recorded or skipped. */
export async function pauseRecurringRuleAction(
  householdId: string,
  input: PauseResumeRuleInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return setStatus(householdId, input, "paused", "paused");
}

export async function resumeRecurringRuleAction(
  householdId: string,
  input: PauseResumeRuleInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return setStatus(householdId, input, "active", "resumed");
}

/** Permanently stops a rule — history (events, generated occurrences) is preserved, never deleted. */
export async function endRecurringRuleAction(
  householdId: string,
  input: PauseResumeRuleInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return setStatus(householdId, input, "ended", "ended");
}

/**
 * Skips one occurrence — logs it and advances next_due_date past it,
 * without ever writing a transaction. See PROMPT 14 "skip one occurrence."
 */
export async function skipOccurrenceAction(
  householdId: string,
  input: SkipOccurrenceInput,
): Promise<ActionResult<RecurringRuleRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: skipOccurrenceSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const rule = await fetchRule(
        supabase,
        householdId,
        values.recurringRuleId,
      );
      if (rule.status !== "active") {
        throw new ValidationError(
          "Only an active rule can skip an occurrence.",
        );
      }
      if (!rule.next_due_date) {
        throw new ValidationError("This rule has no further occurrences.");
      }

      const nextDueDate = computeNextOccurrenceAfter(
        toScheduleSource(rule),
        rule.next_due_date,
      );

      const response = await supabase.rpc("skip_recurring_rule_occurrence", {
        p_household_id: householdId,
        p_recurring_rule_id: values.recurringRuleId,
        p_occurrence_date: rule.next_due_date,
        p_next_due_date: nextDueDate ?? undefined,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      if (nextDueDate === null) {
        await supabase.rpc("set_recurring_rule_status", {
          p_household_id: householdId,
          p_recurring_rule_id: values.recurringRuleId,
          p_status: "ended",
          p_event_type: "ended",
          p_notes:
            "Automatically ended — no further occurrences before end date.",
        });
      }

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "recurring_rule.occurrence_skipped",
      entityType: "recurring_rule",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...RECURRING_REVALIDATE_PATHS,
      `/app/recurring/${input.recurringRuleId}`,
    ],
  });
}

/**
 * Manually confirms/records one occurrence — the reminder_only path, or
 * an early/late confirmation for any rule. Always writes a transaction
 * (this is an explicit human action, not silent automation) and advances
 * next_due_date past it.
 */
export async function recordOccurrenceAction(
  householdId: string,
  input: RecordOccurrenceInput,
): Promise<ActionResult<RecurringTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordOccurrenceSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const rule = await fetchRule(
        supabase,
        householdId,
        values.recurringRuleId,
      );
      if (rule.status !== "active") {
        throw new ValidationError(
          "Only an active rule can record an occurrence.",
        );
      }
      if (!rule.next_due_date) {
        throw new ValidationError("This rule has no further occurrences.");
      }

      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        rule.currency_code,
      );
      const nextDueDate = computeNextOccurrenceAfter(
        toScheduleSource(rule),
        rule.next_due_date,
      );

      const response = await supabase.rpc("record_recurring_rule_occurrence", {
        p_household_id: householdId,
        p_recurring_rule_id: values.recurringRuleId,
        p_occurrence_date: rule.next_due_date,
        p_next_due_date: nextDueDate ?? undefined,
        p_kind: rule.kind,
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: rule.currency_code,
        p_account_id: rule.account_id,
        p_transfer_account_id: rule.transfer_account_id ?? undefined,
        p_category_id: rule.category_id ?? undefined,
        p_counterparty: rule.counterparty ?? undefined,
        p_description: values.description ?? rule.name,
        p_status: values.status,
        p_related_person_id: rule.related_person_id ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      if (nextDueDate === null) {
        await supabase.rpc("set_recurring_rule_status", {
          p_household_id: householdId,
          p_recurring_rule_id: values.recurringRuleId,
          p_status: "ended",
          p_event_type: "ended",
          p_notes:
            "Automatically ended — no further occurrences before end date.",
        });
      }

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "recurring_rule.occurrence_recorded",
      entityType: "transaction",
      entityId: output.id,
      metadata: { recurringRuleId: input.recurringRuleId },
    }),
    revalidatePaths: [
      ...RECURRING_REVALIDATE_PATHS,
      `/app/recurring/${input.recurringRuleId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

const MAX_OCCURRENCES_PER_RULE_PER_RUN = 60;

/**
 * The concrete implementation of "auto-create behavior": for every
 * active, auto_create_mode = 'planned_transaction' rule whose
 * next_due_date has arrived, generates a status = 'planned' transaction
 * for each elapsed occurrence (never 'cleared' — PROMPT 14: "prefer
 * generating planned occurrences ... rather than silently marking money
 * as paid") and advances next_due_date past it. No scheduled/cron
 * infrastructure exists in this app yet, so this is invoked by an
 * explicit "Generate due occurrences" action in the UI — the same
 * function a future scheduled job would call.
 */
export async function generateDueOccurrencesAction(
  householdId: string,
): Promise<ActionResult<{ generatedCount: number }>> {
  try {
    await requireHouseholdRole(householdId, [...WRITE_ROLES]);
    const supabase = await createClient();
    const asOfDate = toIsoDateString(new Date());

    const dueRulesResponse = await supabase
      .from("recurring_rules")
      .select("*")
      .eq("household_id", householdId)
      .eq("status", "active")
      .eq("auto_create_mode", "planned_transaction")
      .not("next_due_date", "is", null)
      .lte("next_due_date", asOfDate);
    if (dueRulesResponse.error) {
      throw mapSupabaseError(dueRulesResponse.error);
    }

    let generatedCount = 0;

    for (const rule of dueRulesResponse.data) {
      const schedule = await fetchAmountSchedule(
        supabase,
        householdId,
        rule.id,
      );
      const scheduleEntries = schedule.map((s) => ({
        effectiveDate: s.effective_date,
        amountMinorUnits: s.amount_minor_units,
      }));

      let currentDueDate: string | null = rule.next_due_date;
      for (
        let iteration = 0;
        currentDueDate !== null &&
        currentDueDate <= asOfDate &&
        iteration < MAX_OCCURRENCES_PER_RULE_PER_RUN;
        iteration++
      ) {
        const amountMinorUnits = resolveAmountForDate(
          rule.amount_minor_units,
          scheduleEntries,
          currentDueDate,
        );
        const nextDueDate = computeNextOccurrenceAfter(
          toScheduleSource(rule),
          currentDueDate,
        );

        const response = await supabase.rpc(
          "record_recurring_rule_occurrence",
          {
            p_household_id: householdId,
            p_recurring_rule_id: rule.id,
            p_occurrence_date: currentDueDate,
            p_next_due_date: nextDueDate ?? undefined,
            p_kind: rule.kind,
            p_amount_minor_units: amountMinorUnits,
            p_currency_code: rule.currency_code,
            p_account_id: rule.account_id,
            p_transfer_account_id: rule.transfer_account_id ?? undefined,
            p_category_id: rule.category_id ?? undefined,
            p_counterparty: rule.counterparty ?? undefined,
            p_description: rule.name,
            p_status: "planned",
            p_related_person_id: rule.related_person_id ?? undefined,
          },
        );
        if (response.error) {
          throw mapSupabaseError(response.error);
        }
        generatedCount += 1;
        currentDueDate = nextDueDate;
      }

      if (currentDueDate === null && rule.next_due_date !== null) {
        await supabase.rpc("set_recurring_rule_status", {
          p_household_id: householdId,
          p_recurring_rule_id: rule.id,
          p_status: "ended",
          p_event_type: "ended",
          p_notes:
            "Automatically ended — no further occurrences before end date.",
        });
      }
    }

    // Mirrors runHouseholdMutation's own revalidation step — this action
    // loops per-rule rather than going through that helper, so it
    // revalidates directly.
    revalidatePath("/app/recurring");
    revalidatePath("/app/cash-flow");
    revalidatePath("/app/accounts");

    return actionOk({ generatedCount });
  } catch (error) {
    return actionError(toUserMessage(error));
  }
}
