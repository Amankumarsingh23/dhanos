"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import {
  computeInitialNextDueDate,
  computeNextOccurrenceAfter,
  type RecurringScheduleSource,
} from "@/lib/calculations/recurring-schedule";
import {
  CREATE_NEW_OPTION_VALUE,
  investmentSipInputSchema,
  investmentSipUpdateSchema,
  recordSipContributionSchema,
  sipStatusActionSchema,
  type InvestmentSipInput,
  type InvestmentSipUpdateInput,
  type RecordSipContributionInput,
  type SipStatusActionInput,
} from "@/lib/validation/investment-sips";
import { uuidSchema } from "@/lib/validation/primitives";
import type { InvestmentSipRecord } from "./queries";

/**
 * Server Actions for SIP management (PROMPT 17) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Status transitions and
 * recording a contribution each go through a dedicated SECURITY INVOKER
 * RPC (set_investment_sip_status/record_investment_sip_contribution)
 * because each is a write spanning investment_sips (+ transactions +
 * investment_transactions, for a recorded contribution) and
 * investment_sip_events together, and PostgREST cannot span a
 * client-visible transaction across two separate REST calls — the same
 * reasoning as src/features/recurring/actions.ts.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const SIP_REVALIDATE_PATHS = ["/app/investments"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function toScheduleSource(sip: {
  frequency: string;
  interval_count: number;
  start_date: string;
  end_date: string | null;
}): RecurringScheduleSource {
  return {
    frequency: sip.frequency as RecurringScheduleSource["frequency"],
    intervalCount: sip.interval_count,
    startDate: sip.start_date,
    endDate: sip.end_date,
  };
}

async function fetchSip(
  supabase: SupabaseServerClient,
  householdId: string,
  investmentSipId: string,
): Promise<InvestmentSipRecord> {
  const response = await supabase
    .from("investment_sips")
    .select("*")
    .eq("id", investmentSipId)
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

type SipFormFields = Pick<
  InvestmentSipInput,
  | "investmentAssetId"
  | "newAssetName"
  | "newAssetClass"
  | "investmentAccountId"
  | "newPlatformName"
  | "newPlatformInstitutionId"
  | "currencyCode"
>;

/**
 * Resolves the SIP form's asset/platform fields into a concrete
 * investment_holding_id — creating the underlying investment_assets/
 * investment_accounts/investment_holdings rows inline when the household
 * picked "+ create new" rather than an existing one. There is no
 * dedicated management UI for those three tables yet (PROMPT 16 was
 * schema-only), so this is where a household's first SIP typically
 * bootstraps them — the same "create a minimal supporting row inline"
 * pattern PROMPT 12's createRecurringRuleForExpense already established.
 * Each step is an independent, individually-valid write (an asset or
 * platform account existing with zero holdings is a normal state, per
 * PROMPT 16), so this is a sequence of plain REST calls, not a single RPC.
 */
async function resolveInvestmentHoldingId(
  supabase: SupabaseServerClient,
  householdId: string,
  values: SipFormFields,
): Promise<string> {
  let investmentAssetId = values.investmentAssetId;
  if (investmentAssetId === CREATE_NEW_OPTION_VALUE) {
    const assetResponse = await supabase
      .from("investment_assets")
      .insert({
        household_id: householdId,
        name: values.newAssetName ?? "",
        asset_class: values.newAssetClass ?? "other",
        currency_code: values.currencyCode,
      })
      .select("id")
      .single();
    if (assetResponse.error) {
      throw mapSupabaseError(assetResponse.error);
    }
    investmentAssetId = assetResponse.data.id;
  }

  let investmentAccountId = values.investmentAccountId;
  if (investmentAccountId === CREATE_NEW_OPTION_VALUE) {
    const accountResponse = await supabase
      .from("investment_accounts")
      .insert({
        household_id: householdId,
        name: values.newPlatformName ?? "",
        institution_id: values.newPlatformInstitutionId ?? null,
        currency_code: values.currencyCode,
      })
      .select("id")
      .single();
    if (accountResponse.error) {
      throw mapSupabaseError(accountResponse.error);
    }
    investmentAccountId = accountResponse.data.id;
  }

  const existingHolding = await supabase
    .from("investment_holdings")
    .select("id")
    .eq("household_id", householdId)
    .eq("investment_account_id", investmentAccountId)
    .eq("investment_asset_id", investmentAssetId)
    .maybeSingle();
  if (existingHolding.error) {
    throw mapSupabaseError(existingHolding.error);
  }
  if (existingHolding.data) {
    return existingHolding.data.id;
  }

  const holdingResponse = await supabase
    .from("investment_holdings")
    .insert({
      household_id: householdId,
      investment_account_id: investmentAccountId,
      investment_asset_id: investmentAssetId,
    })
    .select("id")
    .single();
  if (holdingResponse.error) {
    throw mapSupabaseError(holdingResponse.error);
  }
  return holdingResponse.data.id;
}

export async function createSipAction(
  householdId: string,
  input: InvestmentSipInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: investmentSipInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const investmentHoldingId = await resolveInvestmentHoldingId(
        supabase,
        householdId,
        values,
      );
      const contributionAmountMinorUnits = parseDecimalToMinorUnits(
        values.contributionAmount,
        values.currencyCode,
      );
      const nextDueDate = computeInitialNextDueDate({
        frequency: values.frequency,
        intervalCount: values.intervalCount,
        startDate: values.startDate,
        endDate: values.endDate ?? null,
      });

      const response = await supabase
        .from("investment_sips")
        .insert({
          household_id: householdId,
          name: values.name,
          investment_holding_id: investmentHoldingId,
          provider: values.provider ?? null,
          contribution_amount_minor_units: contributionAmountMinorUnits,
          currency_code: values.currencyCode,
          frequency: values.frequency,
          interval_count: values.intervalCount,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          contribution_account_id: values.contributionAccountId,
          next_due_date: nextDueDate,
          expected_duration_months: values.expectedDurationMonths ?? null,
          status: values.initialStatus,
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      await supabase.from("investment_sip_events").insert({
        household_id: householdId,
        investment_sip_id: response.data.id,
        event_type: "created",
      });

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "investment_sip.created",
      entityType: "investment_sip",
      entityId: output.id,
    }),
    revalidatePaths: [...SIP_REVALIDATE_PATHS],
  });
}

const updateSipSchema = investmentSipUpdateSchema.and(
  z.object({ investmentSipId: uuidSchema }),
);

/**
 * Updates a SIP's template fields — including contribution_amount_minor_units
 * directly. Unlike recurring_rules' amount (which needs a dated future
 * schedule, PROMPT 14), a direct edit here is safe: every past
 * contribution already has its own independently-stored amount in
 * investment_transactions, so changing this only ever affects
 * contributions not yet recorded (PROMPT 17 "SIP amount changes preserve
 * historical amounts"). Never touches status, next_due_date, or
 * last_contribution_date — those are managed by the lifecycle actions and
 * recordSipContributionAction below.
 */
export async function updateSipAction(
  householdId: string,
  investmentSipId: string,
  input: InvestmentSipUpdateInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateSipSchema,
    input: { ...input, investmentSipId },
    run: async ({ supabase, input: values }) => {
      const investmentHoldingId = await resolveInvestmentHoldingId(
        supabase,
        householdId,
        values,
      );
      const contributionAmountMinorUnits = parseDecimalToMinorUnits(
        values.contributionAmount,
        values.currencyCode,
      );

      const response = await supabase
        .from("investment_sips")
        .update({
          name: values.name,
          investment_holding_id: investmentHoldingId,
          provider: values.provider ?? null,
          contribution_amount_minor_units: contributionAmountMinorUnits,
          currency_code: values.currencyCode,
          frequency: values.frequency,
          interval_count: values.intervalCount,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          contribution_account_id: values.contributionAccountId,
          expected_duration_months: values.expectedDurationMonths ?? null,
          notes: values.notes ?? null,
        })
        .eq("id", values.investmentSipId)
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
      eventType: "investment_sip.updated",
      entityType: "investment_sip",
      entityId: output.id,
    }),
    revalidatePaths: [...SIP_REVALIDATE_PATHS],
  });
}

async function setStatus(
  householdId: string,
  input: SipStatusActionInput,
  status: "active" | "paused" | "completed" | "cancelled",
  eventType: "activated" | "paused" | "resumed" | "completed" | "cancelled",
): Promise<ActionResult<InvestmentSipRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: sipStatusActionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase.rpc("set_investment_sip_status", {
        p_household_id: householdId,
        p_investment_sip_id: values.investmentSipId,
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
      eventType: `investment_sip.${eventType}`,
      entityType: "investment_sip",
      entityId: output.id,
    }),
    revalidatePaths: [...SIP_REVALIDATE_PATHS],
  });
}

/** Starts a 'planned' SIP running — its schedule begins advancing on recorded contributions. */
export async function activateSipAction(
  householdId: string,
  input: SipStatusActionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return setStatus(householdId, input, "active", "activated");
}

/** Freezes an active SIP — next_due_date does not advance while paused, and no contribution can be recorded. */
export async function pauseSipAction(
  householdId: string,
  input: SipStatusActionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return setStatus(householdId, input, "paused", "paused");
}

export async function resumeSipAction(
  householdId: string,
  input: SipStatusActionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return setStatus(householdId, input, "active", "resumed");
}

/** Manually marks a SIP done (e.g. its goal was reached early) — history is preserved, never deleted. */
export async function completeSipAction(
  householdId: string,
  input: SipStatusActionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return setStatus(householdId, input, "completed", "completed");
}

/** Permanently stops a SIP early — history (events, recorded contributions) is preserved, never deleted. */
export async function cancelSipAction(
  householdId: string,
  input: SipStatusActionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return setStatus(householdId, input, "cancelled", "cancelled");
}

/**
 * Records one actual SIP contribution — the PROMPT 17 "Contributions"
 * section: writes the investment contribution record, its linked
 * cash-flow transaction (so the contribution account's calculated balance
 * and PROMPT 15's dashboard both reflect it), and advances next_due_date,
 * all atomically via record_investment_sip_contribution. If the schedule
 * has nothing left before end_date, the SIP is automatically marked
 * 'completed' — a natural schedule exhaustion, not a manual cancellation.
 * investment_transactions_sip_occurrence_uidx is the hard backstop against
 * ever recording the same date twice ("avoid double counting").
 */
export async function recordSipContributionAction(
  householdId: string,
  input: RecordSipContributionInput,
): Promise<ActionResult<InvestmentSipRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordSipContributionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const sip = await fetchSip(supabase, householdId, values.investmentSipId);
      if (sip.status !== "active") {
        throw new ValidationError(
          "Only an active SIP can have a contribution recorded.",
        );
      }

      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        sip.currency_code,
      );
      const nextDueDate = computeNextOccurrenceAfter(
        toScheduleSource(sip),
        values.occurrenceDate,
      );

      const response = await supabase.rpc(
        "record_investment_sip_contribution",
        {
          p_household_id: householdId,
          p_investment_sip_id: sip.id,
          p_investment_holding_id: sip.investment_holding_id,
          p_contribution_account_id: sip.contribution_account_id,
          p_occurrence_date: values.occurrenceDate,
          p_amount_minor_units: amountMinorUnits,
          p_currency_code: sip.currency_code,
          p_status: values.status,
          p_next_due_date: nextDueDate ?? undefined,
        },
      );
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      if (nextDueDate === null) {
        await supabase.rpc("set_investment_sip_status", {
          p_household_id: householdId,
          p_investment_sip_id: sip.id,
          p_status: "completed",
          p_event_type: "completed",
          p_notes:
            "Automatically completed — no further occurrences before end date.",
        });
      }

      const updated = await fetchSip(supabase, householdId, sip.id);
      return updated;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "investment_sip.contribution_recorded",
      entityType: "investment_sip",
      entityId: output.id,
    }),
    revalidatePaths: [...SIP_REVALIDATE_PATHS],
  });
}
