"use server";

import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import {
  deleteCalculatorScenarioSchema,
  saveCalculatorScenarioSchema,
  type DeleteCalculatorScenarioInput,
  type SaveCalculatorScenarioInput,
} from "@/lib/validation/calculators";
import type { Json } from "@/types/database";
import type { CalculatorScenarioRecord } from "./queries";

/**
 * Server Actions for the financial-calculators feature (PROMPT 20). Every
 * calculator itself runs entirely client-side (pure functions in
 * src/lib/calculations/calculators, recomputed on every keystroke) — these
 * two actions are the *only* server round trip the feature makes, and only
 * ever fire from an explicit "Save scenario" / "Delete" click, never as a
 * side effect of typing into a calculator.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const CALCULATORS_REVALIDATE_PATHS = ["/app/calculators"];

export async function saveCalculatorScenarioAction(
  householdId: string,
  input: SaveCalculatorScenarioInput,
): Promise<ActionResult<CalculatorScenarioRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: saveCalculatorScenarioSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("calculator_scenarios")
        .insert({
          household_id: householdId,
          calculator_type: values.calculatorType,
          name: values.name,
          inputs: values.inputs as Json,
          outputs: values.outputs as Json,
          linked_account_id: values.linkedAccountId ?? null,
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "calculator_scenario.saved",
      entityType: "calculator_scenario",
      entityId: output.id,
      metadata: { calculatorType: output.calculator_type },
    }),
    revalidatePaths: [...CALCULATORS_REVALIDATE_PATHS],
  });
}

export async function deleteCalculatorScenarioAction(
  householdId: string,
  input: DeleteCalculatorScenarioInput,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: deleteCalculatorScenarioSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("calculator_scenarios")
        .delete()
        .eq("id", values.scenarioId)
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
      eventType: "calculator_scenario.deleted",
      entityType: "calculator_scenario",
      entityId: values.scenarioId,
    }),
    revalidatePaths: [...CALCULATORS_REVALIDATE_PATHS],
  });
}
