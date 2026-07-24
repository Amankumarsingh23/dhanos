"use server";

import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import {
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import {
  createDecisionSchema,
  decisionIdSchema,
  markReversedSchema,
  recordOutcomeSchema,
  setReviewDateSchema,
  supersedeDecisionSchema,
  type CreateDecisionInput,
  type DecisionFieldsInput,
  type MarkReversedInput,
  type RecordOutcomeInput,
  type SetReviewDateInput,
  type SupersedeDecisionInput,
} from "@/lib/validation/decisions";
import type { DecisionRecord } from "./queries";
import type { TablesUpdate } from "@/types/database";

/**
 * Server Actions for the financial decision journal (PROMPT 37) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. `createDecisionAction`/
 * `supersedeDecisionAction` are the only two that ever write a decision's
 * write-once fields (title/context/choice/alternatives/rationale/
 * expected_result/risks/...) — both go through the same
 * create_decision_journal_entry RPC, so there is exactly one insert path.
 * Every other action here touches only status/review_date/actual_outcome/
 * lessons_learned, matching exactly what the database's own
 * enforce_decision_journal_immutability trigger allows — "original
 * rationale remains preserved" holds at both layers, not just one.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const DELETE_ROLES = ["owner", "admin"] as const;
const DECISIONS_REVALIDATE_PATHS = ["/app/decisions"];

function decisionRevalidatePaths(decisionId?: string): string[] {
  return decisionId
    ? [...DECISIONS_REVALIDATE_PATHS, `/app/decisions/${decisionId}`]
    : [...DECISIONS_REVALIDATE_PATHS];
}

function toDecisionRpcArgs(
  values: DecisionFieldsInput,
  currencyCode: string,
) {
  const amountMinorUnits =
    values.amount && values.amount.trim() !== ""
      ? parseDecimalToMinorUnits(values.amount, currencyCode)
      : null;

  return {
    p_title: values.title,
    p_decision_date: values.decisionDate,
    p_choice: values.choice,
    p_rationale: values.rationale,
    p_status: values.status,
    p_amount_minor_units: amountMinorUnits ?? undefined,
    p_currency_code: amountMinorUnits !== null ? currencyCode : undefined,
    p_entity_type: values.entityType ?? undefined,
    p_entity_id: values.entityId ?? undefined,
    p_context: values.context ?? undefined,
    p_alternatives: values.alternatives ?? undefined,
    p_expected_result: values.expectedResult ?? undefined,
    p_risks: values.risks ?? undefined,
    p_review_date: values.reviewDate ?? undefined,
  };
}

export async function createDecisionAction(
  householdId: string,
  input: CreateDecisionInput,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createDecisionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const householdResponse = await supabase
        .from("households")
        .select("base_currency_code")
        .eq("id", householdId)
        .maybeSingle();
      if (householdResponse.error) {
        throw mapSupabaseError(householdResponse.error);
      }
      if (!householdResponse.data) {
        throw new NotFoundError();
      }

      const response = await supabase.rpc("create_decision_journal_entry", {
        p_household_id: householdId,
        ...toDecisionRpcArgs(values, householdResponse.data.base_currency_code),
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "decision.created",
      entityType: "decision_journal_entry",
      entityId: output.id,
      metadata: { status: output.status },
    }),
    revalidatePaths: decisionRevalidatePaths(),
  });
}

export async function supersedeDecisionAction(
  householdId: string,
  input: SupersedeDecisionInput,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: supersedeDecisionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const householdResponse = await supabase
        .from("households")
        .select("base_currency_code")
        .eq("id", householdId)
        .maybeSingle();
      if (householdResponse.error) {
        throw mapSupabaseError(householdResponse.error);
      }
      if (!householdResponse.data) {
        throw new NotFoundError();
      }

      const response = await supabase.rpc("create_decision_journal_entry", {
        p_household_id: householdId,
        p_supersedes_entry_id: values.supersedesEntryId,
        ...toDecisionRpcArgs(values, householdResponse.data.base_currency_code),
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output, input: values }) => ({
      householdId,
      eventType: "decision.superseded",
      entityType: "decision_journal_entry",
      entityId: output.id,
      metadata: { supersedesEntryId: values.supersedesEntryId },
    }),
    revalidatePaths: decisionRevalidatePaths(),
  });
}

export async function recordOutcomeAction(
  householdId: string,
  input: RecordOutcomeInput,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordOutcomeSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields: TablesUpdate<"decision_journal_entries"> = {};
      if (values.actualOutcome) fields.actual_outcome = values.actualOutcome;
      if (values.lessonsLearned) fields.lessons_learned = values.lessonsLearned;

      const response = await supabase
        .from("decision_journal_entries")
        .update(fields)
        .eq("id", values.decisionId)
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
      eventType: "decision.outcome_recorded",
      entityType: "decision_journal_entry",
      entityId: output.id,
    }),
    revalidatePaths: decisionRevalidatePaths(input.decisionId),
  });
}

/** open -> decided — commits a still-open draft. Never touches a write-once field, only status. */
export async function markDecidedAction(
  householdId: string,
  decisionId: string,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: decisionIdSchema,
    input: { decisionId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("decision_journal_entries")
        .update({ status: "decided" })
        .eq("id", values.decisionId)
        .eq("household_id", householdId)
        .eq("status", "open")
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
      eventType: "decision.decided",
      entityType: "decision_journal_entry",
      entityId: output.id,
    }),
    revalidatePaths: decisionRevalidatePaths(decisionId),
  });
}

export async function markUnderReviewAction(
  householdId: string,
  decisionId: string,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: decisionIdSchema,
    input: { decisionId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("decision_journal_entries")
        .update({ status: "under_review" })
        .eq("id", values.decisionId)
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
      eventType: "decision.marked_under_review",
      entityType: "decision_journal_entry",
      entityId: output.id,
    }),
    revalidatePaths: decisionRevalidatePaths(decisionId),
  });
}

export async function markReversedAction(
  householdId: string,
  input: MarkReversedInput,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: markReversedSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("decision_journal_entries")
        .update({ status: "reversed", actual_outcome: values.actualOutcome })
        .eq("id", values.decisionId)
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
      eventType: "decision.reversed",
      entityType: "decision_journal_entry",
      entityId: output.id,
    }),
    revalidatePaths: decisionRevalidatePaths(input.decisionId),
  });
}

export async function setReviewDateAction(
  householdId: string,
  input: SetReviewDateInput,
): Promise<ActionResult<DecisionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setReviewDateSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("decision_journal_entries")
        .update({ review_date: values.reviewDate })
        .eq("id", values.decisionId)
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
      eventType: "decision.review_date_set",
      entityType: "decision_journal_entry",
      entityId: output.id,
    }),
    revalidatePaths: decisionRevalidatePaths(input.decisionId),
  });
}

/** Only ever deletes a still-'open' draft (the WHERE clause enforces this — an update to decided/reversed/superseded is never a delete target). Owner/admin only, matching the migration's RLS. */
export async function deleteDecisionAction(
  householdId: string,
  decisionId: string,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...DELETE_ROLES],
    schema: decisionIdSchema,
    input: { decisionId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("decision_journal_entries")
        .delete()
        .eq("id", values.decisionId)
        .eq("household_id", householdId)
        .eq("status", "open")
        .select("id")
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError(
          "Only a still-open draft can be deleted — mark it reversed or superseded instead.",
        );
      }
      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "decision.deleted",
      entityType: "decision_journal_entry",
      entityId: decisionId,
    }),
    revalidatePaths: decisionRevalidatePaths(),
  });
}
