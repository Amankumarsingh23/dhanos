"use server";

import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import {
  addGoalFundingSourceSchema,
  addGoalResponsiblePersonSchema,
  createGoalSchema,
  deleteGoalSchema,
  removeGoalFundingSourceSchema,
  removeGoalResponsiblePersonSchema,
  setGoalStatusSchema,
  updateGoalSchema,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@/lib/validation/goals";
import type {
  GoalFundingSourceRecord,
  GoalRecord,
  GoalResponsiblePersonRecord,
} from "./queries";

/**
 * Server Actions for the financial goals register (PROMPT 30) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Creating a goal spans up
 * to three tables (goals + its initial responsible-people/funding-source
 * rows) so it goes through the create_goal SECURITY INVOKER RPC for real
 * atomicity. Adding/removing a single funding source or responsible person
 * afterward is a plain single-table write — no RPC needed, since neither
 * touches the goal row itself.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const GOAL_REVALIDATE_PATHS = ["/app/goals"];

function goalRevalidatePaths(goalId?: string): string[] {
  return goalId
    ? [...GOAL_REVALIDATE_PATHS, `/app/goals/${goalId}`]
    : [...GOAL_REVALIDATE_PATHS];
}

function toGoalFieldsArgs(values: UpdateGoalInput) {
  const manualCurrentSavedAmountMinorUnits =
    values.manualCurrentSavedAmount &&
    values.manualCurrentSavedAmount.trim() !== ""
      ? parseDecimalToMinorUnits(
          values.manualCurrentSavedAmount,
          values.currencyCode,
        )
      : 0;

  return {
    name: values.name,
    goal_type: values.goalType,
    target_amount_minor_units: parseDecimalToMinorUnits(
      values.targetAmount,
      values.currencyCode,
    ),
    currency_code: values.currencyCode,
    target_date: values.targetDate,
    manual_current_saved_amount_minor_units: manualCurrentSavedAmountMinorUnits,
    annual_inflation_rate: values.annualInflationRate,
    annual_expected_return: values.annualExpectedReturn,
    priority: values.priority,
    flexibility: values.flexibility,
    notes: values.notes ?? null,
  };
}

export async function createGoalAction(
  householdId: string,
  input: CreateGoalInput,
): Promise<ActionResult<GoalRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createGoalSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toGoalFieldsArgs(values);
      const response = await supabase.rpc("create_goal", {
        p_household_id: householdId,
        p_name: fields.name,
        p_goal_type: fields.goal_type,
        p_target_amount_minor_units: fields.target_amount_minor_units,
        p_currency_code: fields.currency_code,
        p_target_date: fields.target_date,
        p_manual_current_saved_amount_minor_units:
          fields.manual_current_saved_amount_minor_units,
        p_annual_inflation_rate: fields.annual_inflation_rate,
        p_annual_expected_return: fields.annual_expected_return,
        p_priority: fields.priority,
        p_flexibility: fields.flexibility,
        p_notes: fields.notes ?? undefined,
        p_responsible_person_ids: values.responsiblePersonIds,
        p_funding_sources: values.fundingSources.map((source) => ({
          sourceType: source.sourceType,
          accountId: source.accountId ?? null,
          investmentHoldingId: source.investmentHoldingId ?? null,
          allocationPercentage: source.allocationPercentage,
        })),
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "goal.created",
      entityType: "goal",
      entityId: output.id,
      metadata: { goalType: output.goal_type },
    }),
    revalidatePaths: goalRevalidatePaths(),
  });
}

export async function updateGoalAction(
  householdId: string,
  goalId: string,
  input: UpdateGoalInput,
): Promise<ActionResult<GoalRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateGoalSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toGoalFieldsArgs(values);
      const response = await supabase
        .from("goals")
        .update(fields)
        .eq("id", goalId)
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
      eventType: "goal.updated",
      entityType: "goal",
      entityId: output.id,
    }),
    revalidatePaths: goalRevalidatePaths(goalId),
  });
}

export async function setGoalStatusAction(
  householdId: string,
  input: { goalId: string; status: string },
): Promise<ActionResult<GoalRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setGoalStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goals")
        .update({ status: values.status })
        .eq("id", values.goalId)
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
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "goal.status_changed",
      entityType: "goal",
      entityId: values.goalId,
      metadata: { status: output.status },
    }),
    revalidatePaths: goalRevalidatePaths(input.goalId),
  });
}

export async function deleteGoalAction(
  householdId: string,
  input: { goalId: string },
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: deleteGoalSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goals")
        .delete()
        .eq("id", values.goalId)
        .eq("household_id", householdId)
        .select("id")
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ input: values }) => ({
      householdId,
      eventType: "goal.deleted",
      entityType: "goal",
      entityId: values.goalId,
    }),
    revalidatePaths: goalRevalidatePaths(),
  });
}

export async function addGoalResponsiblePersonAction(
  householdId: string,
  input: { goalId: string; personId: string },
): Promise<ActionResult<GoalResponsiblePersonRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: addGoalResponsiblePersonSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goal_responsible_people")
        .insert({
          household_id: householdId,
          goal_id: values.goalId,
          person_id: values.personId,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "goal.responsible_person_added",
      entityType: "goal",
      entityId: values.goalId,
      metadata: { personId: output.person_id },
    }),
    revalidatePaths: goalRevalidatePaths(input.goalId),
  });
}

export async function removeGoalResponsiblePersonAction(
  householdId: string,
  input: { goalId: string; goalResponsiblePersonId: string },
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: removeGoalResponsiblePersonSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goal_responsible_people")
        .delete()
        .eq("id", values.goalResponsiblePersonId)
        .eq("household_id", householdId);
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "goal.responsible_person_removed",
      entityType: "goal",
      entityId: input.goalId,
    }),
    revalidatePaths: goalRevalidatePaths(input.goalId),
  });
}

export async function addGoalFundingSourceAction(
  householdId: string,
  input: {
    goalId: string;
    fundingSource: {
      sourceType: "account" | "investment_holding";
      accountId?: string | null;
      investmentHoldingId?: string | null;
      allocationPercentage: number;
    };
  },
): Promise<ActionResult<GoalFundingSourceRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: addGoalFundingSourceSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goal_funding_sources")
        .insert({
          household_id: householdId,
          goal_id: values.goalId,
          source_type: values.fundingSource.sourceType,
          account_id: values.fundingSource.accountId ?? null,
          investment_holding_id:
            values.fundingSource.investmentHoldingId ?? null,
          allocation_percentage: values.fundingSource.allocationPercentage,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "goal.funding_source_added",
      entityType: "goal",
      entityId: values.goalId,
      metadata: { fundingSourceId: output.id },
    }),
    revalidatePaths: goalRevalidatePaths(input.goalId),
  });
}

export async function removeGoalFundingSourceAction(
  householdId: string,
  input: { goalId: string; goalFundingSourceId: string },
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: removeGoalFundingSourceSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("goal_funding_sources")
        .delete()
        .eq("id", values.goalFundingSourceId)
        .eq("household_id", householdId);
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "goal.funding_source_removed",
      entityType: "goal",
      entityId: input.goalId,
    }),
    revalidatePaths: goalRevalidatePaths(input.goalId),
  });
}
