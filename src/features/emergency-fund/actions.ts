"use server";

import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import {
  clearEmergencyFundSourceOverrideSchema,
  saveEmergencyFundPlanSchema,
  setEmergencyFundSourceOverrideSchema,
  type ClearEmergencyFundSourceOverrideInput,
  type SaveEmergencyFundPlanInput,
  type SetEmergencyFundSourceOverrideInput,
} from "@/lib/validation/emergency-fund";
import type {
  EmergencyFundPlanRecord,
  EmergencyFundSourceOverrideRecord,
} from "./queries";

/**
 * Server Actions for the emergency fund planner (PROMPT 31). There is
 * exactly one plan per household (a `unique (household_id)` constraint),
 * so saving it is always an upsert rather than a separate create/update
 * pair. A source override is a plain single-table write — deleted then
 * re-inserted rather than a SQL upsert, since the underlying unique
 * indexes are partial (one for accounts, one for investment holdings) and
 * Supabase's JS `.upsert()` cannot target a partial index directly.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const EMERGENCY_FUND_REVALIDATE_PATHS = ["/app/emergency-fund"];

export async function saveEmergencyFundPlanAction(
  householdId: string,
  input: SaveEmergencyFundPlanInput,
): Promise<ActionResult<EmergencyFundPlanRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: saveEmergencyFundPlanSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("emergency_fund_plans")
        .upsert(
          {
            household_id: householdId,
            coverage_target_months: values.coverageTargetMonths,
            dependants_count: values.dependantsCount,
            notes: values.notes ?? null,
          },
          { onConflict: "household_id" },
        )
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "emergency_fund_plan.saved",
      entityType: "emergency_fund_plan",
      entityId: output.id,
      metadata: { coverageTargetMonths: output.coverage_target_months },
    }),
    revalidatePaths: EMERGENCY_FUND_REVALIDATE_PATHS,
  });
}

export async function setEmergencyFundSourceOverrideAction(
  householdId: string,
  input: SetEmergencyFundSourceOverrideInput,
): Promise<ActionResult<EmergencyFundSourceOverrideRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setEmergencyFundSourceOverrideSchema,
    input,
    run: async ({ supabase, input: values }) => {
      let deleteQuery = supabase
        .from("emergency_fund_source_overrides")
        .delete()
        .eq("household_id", householdId)
        .eq("emergency_fund_plan_id", values.emergencyFundPlanId);
      deleteQuery =
        values.sourceType === "account"
          ? deleteQuery.eq("account_id", values.accountId as string)
          : deleteQuery.eq(
              "investment_holding_id",
              values.investmentHoldingId as string,
            );
      const deleteResponse = await deleteQuery;
      if (deleteResponse.error) {
        throw mapSupabaseError(deleteResponse.error);
      }

      const insertResponse = await supabase
        .from("emergency_fund_source_overrides")
        .insert({
          household_id: householdId,
          emergency_fund_plan_id: values.emergencyFundPlanId,
          source_type: values.sourceType,
          account_id: values.accountId ?? null,
          investment_holding_id: values.investmentHoldingId ?? null,
          is_included: values.isIncluded,
        })
        .select()
        .single();
      if (insertResponse.error) {
        throw mapSupabaseError(insertResponse.error);
      }
      return insertResponse.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "emergency_fund_plan.source_override_set",
      entityType: "emergency_fund_plan",
      entityId: values.emergencyFundPlanId,
      metadata: { isIncluded: output.is_included },
    }),
    revalidatePaths: EMERGENCY_FUND_REVALIDATE_PATHS,
  });
}

/** Removes an override, reverting a source back to its structural default classification. */
export async function clearEmergencyFundSourceOverrideAction(
  householdId: string,
  input: ClearEmergencyFundSourceOverrideInput,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: clearEmergencyFundSourceOverrideSchema,
    input,
    run: async ({ supabase, input: values }) => {
      let deleteQuery = supabase
        .from("emergency_fund_source_overrides")
        .delete()
        .eq("household_id", householdId)
        .eq("emergency_fund_plan_id", values.emergencyFundPlanId);
      deleteQuery =
        values.sourceType === "account"
          ? deleteQuery.eq("account_id", values.accountId as string)
          : deleteQuery.eq(
              "investment_holding_id",
              values.investmentHoldingId as string,
            );
      const response = await deleteQuery;
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return undefined;
    },
    activityEvent: ({ input: values }) => ({
      householdId,
      eventType: "emergency_fund_plan.source_override_cleared",
      entityType: "emergency_fund_plan",
      entityId: values.emergencyFundPlanId,
    }),
    revalidatePaths: EMERGENCY_FUND_REVALIDATE_PATHS,
  });
}
