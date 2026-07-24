"use server";

import { mapSupabaseError } from "@/lib/errors/supabase";
import { ValidationError } from "@/lib/errors/app-error";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { recordNetWorthSnapshotSchema } from "@/lib/validation/net-worth";
import {
  getCurrentNetWorthBreakdown,
  type NetWorthSnapshotRecord,
} from "./queries";

/**
 * Server Actions for the net-worth engine (PROMPT 32). Recording a
 * snapshot is a single-table insert — every value comes straight from
 * getCurrentNetWorthBreakdown, computed fresh from real, current data,
 * never user-entered. `unique (household_id, as_of_date)` means a second
 * snapshot for today fails outright; checked explicitly first for a clear
 * message rather than relying on a raw constraint-violation fallback.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const NET_WORTH_REVALIDATE_PATHS = ["/app/net-worth"];

export async function recordNetWorthSnapshotAction(
  householdId: string,
  currencyCode: string,
): Promise<ActionResult<NetWorthSnapshotRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordNetWorthSnapshotSchema,
    input: {},
    run: async ({ supabase }) => {
      const breakdown = await getCurrentNetWorthBreakdown(
        supabase,
        householdId,
        currencyCode,
      );

      const existing = await supabase
        .from("net_worth_snapshots")
        .select("id")
        .eq("household_id", householdId)
        .eq("as_of_date", breakdown.asOfDate)
        .maybeSingle();
      if (existing.error) {
        throw mapSupabaseError(existing.error);
      }
      if (existing.data) {
        throw new ValidationError(
          "A net worth snapshot for today has already been recorded. Historical snapshots are never rewritten automatically — wait until tomorrow to record a new one.",
        );
      }

      const response = await supabase
        .from("net_worth_snapshots")
        .insert({
          household_id: householdId,
          as_of_date: breakdown.asOfDate,
          currency_code: breakdown.currencyCode,
          cash_and_accounts_minor_units: breakdown.cashAndAccountsMinorUnits,
          investments_minor_units: breakdown.investmentsMinorUnits,
          movable_assets_minor_units: breakdown.movableAssetsMinorUnits,
          property_minor_units: breakdown.propertyMinorUnits,
          receivables_minor_units: breakdown.receivablesMinorUnits,
          loans_minor_units: breakdown.loansMinorUnits,
          other_liabilities_minor_units: breakdown.otherLiabilitiesMinorUnits,
          completeness_percentage: breakdown.completenessPercentage,
          valuation_dependent_item_count: breakdown.valuationDependentItemCount,
          missing_valuation_count: breakdown.missingValuationCount,
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
      eventType: "net_worth_snapshot.recorded",
      entityType: "net_worth_snapshot",
      entityId: output.id,
      metadata: {
        asOfDate: output.as_of_date,
        netWorthMinorUnits: output.net_worth_minor_units,
      },
    }),
    revalidatePaths: NET_WORTH_REVALIDATE_PATHS,
  });
}
