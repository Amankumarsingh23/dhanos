"use server";

import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import {
  createMoneyDrainSchema,
  deleteMoneyDrainSchema,
  setMoneyDrainStatusSchema,
  updateMoneyDrainSchema,
  type CreateMoneyDrainInput,
  type MoneyDrainFieldsInput,
  type SetMoneyDrainStatusInput,
} from "@/lib/validation/money-drains";
import type { MoneyDrainRecord } from "./queries";

/**
 * Server Actions for the money drains register (PROMPT 29). Unlike assets/
 * liabilities/loans, a money drain never spans an atomic multi-table write
 * — it doesn't itself generate a transaction (see queries.ts's module
 * comment for why) — so every mutation here is a plain single-table
 * insert/update, no RPC needed.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const MONEY_DRAIN_REVALIDATE_PATHS = ["/app/money-drains"];

function moneyDrainRevalidatePaths(moneyDrainId?: string): string[] {
  return moneyDrainId
    ? [...MONEY_DRAIN_REVALIDATE_PATHS, `/app/money-drains/${moneyDrainId}`]
    : [...MONEY_DRAIN_REVALIDATE_PATHS];
}

function toMoneyDrainFieldsArgs(values: MoneyDrainFieldsInput) {
  const currentValueMinorUnits =
    values.currentValue && values.currentValue.trim() !== ""
      ? parseDecimalToMinorUnits(values.currentValue, values.currencyCode)
      : null;

  return {
    item: values.item,
    drain_type: values.drainType,
    cost_frequency: values.costFrequency,
    cost_amount_minor_units: parseDecimalToMinorUnits(
      values.costAmount,
      values.currencyCode,
    ),
    currency_code: values.currencyCode,
    current_value_minor_units: currentValueMinorUnits,
    usage_frequency: values.usageFrequency,
    is_essential: values.isEssential,
    cancellation_terms: values.cancellationTerms ?? null,
    next_renewal_date: values.nextRenewalDate ?? null,
    linked_account_id: values.linkedAccountId || null,
    linked_asset_id: values.linkedAssetId || null,
    linked_recurring_rule_id: values.linkedRecurringRuleId || null,
    notes: values.notes ?? null,
  };
}

export async function createMoneyDrainAction(
  householdId: string,
  input: CreateMoneyDrainInput,
): Promise<ActionResult<MoneyDrainRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createMoneyDrainSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toMoneyDrainFieldsArgs(values);
      const response = await supabase
        .from("money_drains")
        .insert({ household_id: householdId, ...fields })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "money_drain.created",
      entityType: "money_drain",
      entityId: output.id,
      metadata: { drainType: output.drain_type },
    }),
    revalidatePaths: moneyDrainRevalidatePaths(),
  });
}

export async function updateMoneyDrainAction(
  householdId: string,
  moneyDrainId: string,
  input: MoneyDrainFieldsInput,
): Promise<ActionResult<MoneyDrainRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateMoneyDrainSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toMoneyDrainFieldsArgs(values);
      const response = await supabase
        .from("money_drains")
        .update(fields)
        .eq("id", moneyDrainId)
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
      eventType: "money_drain.updated",
      entityType: "money_drain",
      entityId: output.id,
    }),
    revalidatePaths: moneyDrainRevalidatePaths(moneyDrainId),
  });
}

/**
 * Changes a drain's status (active/paused/cancelled) — always a deliberate,
 * explicit user action, never automatic. PROMPT 29: "do not automatically
 * order the user to cancel anything" — this action exists so a household
 * *can* record that it cancelled something itself; nothing in this feature
 * ever calls it on the household's behalf. A cancelled drain is never
 * deleted, so its historical cost stays visible and explainable.
 */
export async function setMoneyDrainStatusAction(
  householdId: string,
  input: SetMoneyDrainStatusInput,
): Promise<ActionResult<MoneyDrainRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setMoneyDrainStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("money_drains")
        .update({ status: values.status })
        .eq("id", values.moneyDrainId)
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
      eventType: "money_drain.status_changed",
      entityType: "money_drain",
      entityId: values.moneyDrainId,
      metadata: { status: output.status },
    }),
    revalidatePaths: moneyDrainRevalidatePaths(input.moneyDrainId),
  });
}

/**
 * A real delete, unlike most financial records in this app — a money drain
 * describes an external thing (a subscription, a vehicle), not a ledger
 * event, and nothing else references it, so removing a mistaken entry is
 * safe. Cancelling (setMoneyDrainStatusAction) is the normal way to record
 * "I stopped this" while keeping its history visible; this is only for
 * "I entered this by mistake."
 */
export async function deleteMoneyDrainAction(
  householdId: string,
  input: { moneyDrainId: string },
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: deleteMoneyDrainSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("money_drains")
        .delete()
        .eq("id", values.moneyDrainId)
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
      eventType: "money_drain.deleted",
      entityType: "money_drain",
      entityId: values.moneyDrainId,
    }),
    revalidatePaths: moneyDrainRevalidatePaths(),
  });
}
