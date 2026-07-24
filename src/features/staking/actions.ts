"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import { validateExpectedDailyRate } from "@/lib/calculations/staking-snapshot";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  CREATE_NEW_OPTION_VALUE,
  recordStakingSnapshotSchema,
  stakingPositionInputSchema,
  stakingPositionUpdateSchema,
  stakingStatusActionSchema,
  type RecordStakingSnapshotInput,
  type StakingPositionInput,
  type StakingPositionUpdateInput,
  type StakingStatusActionInput,
} from "@/lib/validation/staking";
import type { StakingPositionRecord, StakingSnapshotRecord } from "./queries";

/**
 * Server Actions for the staking / daily-value-tracking feature (PROMPT
 * 19) — see docs/data-access-patterns.md for the 8-step mutation process
 * every one of these implements via runHouseholdMutation. Unlike SIP
 * contributions (PROMPT 17), recording a snapshot is a single-table
 * insert — no SECURITY INVOKER RPC is needed here, since PostgREST's
 * single-statement atomicity already covers it.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const STAKING_REVALIDATE_PATHS = ["/app/investments/staking"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type PositionFormFields = {
  investmentAssetId: string;
  newAssetName?: string | null;
  newAssetClass?: string | null;
  investmentAccountId: string;
  newPlatformName?: string | null;
  newPlatformInstitutionId?: string | null;
  currencyCode: string;
};

/**
 * Resolves the position form's asset/platform fields into a concrete
 * investment_holding_id — creating investment_assets/investment_accounts/
 * investment_holdings rows inline when "+ create new" was chosen, the
 * same pattern src/features/investment-sips/actions.ts established (kept
 * as a local copy here, not imported, since each feature owns its own
 * write-path helpers — see e.g. src/features/expenses/queries.ts's
 * fetchRefundedAmounts for the same convention).
 */
async function resolveInvestmentHoldingId(
  supabase: SupabaseServerClient,
  householdId: string,
  values: PositionFormFields,
): Promise<string> {
  let investmentAssetId = values.investmentAssetId;
  if (investmentAssetId === CREATE_NEW_OPTION_VALUE) {
    const assetResponse = await supabase
      .from("investment_assets")
      .insert({
        household_id: householdId,
        name: values.newAssetName ?? "",
        asset_class: values.newAssetClass ?? "staking",
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

async function fetchPosition(
  supabase: SupabaseServerClient,
  householdId: string,
  stakingPositionId: string,
): Promise<StakingPositionRecord> {
  const response = await supabase
    .from("staking_positions")
    .select("*")
    .eq("id", stakingPositionId)
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

function toExpectedDailyRate(
  percentInput: string | null | undefined,
): number | null {
  if (!percentInput || percentInput.trim() === "") {
    return null;
  }
  const percent = Number(percentInput);
  if (!Number.isFinite(percent)) {
    throw new ValidationError(
      "Enter a valid number for the expected daily rate.",
    );
  }
  const rate = percent / 100;
  const validation = validateExpectedDailyRate(rate);
  if (!validation.valid) {
    throw new ValidationError(validation.reason);
  }
  return rate;
}

export async function createStakingPositionAction(
  householdId: string,
  input: StakingPositionInput,
): Promise<ActionResult<StakingPositionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: stakingPositionInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const investmentHoldingId = await resolveInvestmentHoldingId(
        supabase,
        householdId,
        values,
      );
      const openingPrincipalMinorUnits = parseDecimalToMinorUnits(
        values.openingPrincipal,
        values.currencyCode,
      );
      const expectedDailyRate = toExpectedDailyRate(
        values.expectedDailyRatePercent,
      );

      const response = await supabase
        .from("staking_positions")
        .insert({
          household_id: householdId,
          name: values.name,
          investment_holding_id: investmentHoldingId,
          opening_principal_minor_units: openingPrincipalMinorUnits,
          opening_date: values.openingDate,
          currency_code: values.currencyCode,
          expected_daily_rate: expectedDailyRate,
          lock_in_end_date: values.lockInEndDate ?? null,
          fee_notes: values.feeNotes ?? null,
          risk_notes: values.riskNotes ?? null,
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
      eventType: "staking_position.created",
      entityType: "staking_position",
      entityId: output.id,
    }),
    revalidatePaths: [...STAKING_REVALIDATE_PATHS],
  });
}

const updatePositionSchema = stakingPositionUpdateSchema.and(
  z.object({ stakingPositionId: uuidSchema }),
);

export async function updateStakingPositionAction(
  householdId: string,
  stakingPositionId: string,
  input: StakingPositionUpdateInput,
): Promise<ActionResult<StakingPositionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updatePositionSchema,
    input: { ...input, stakingPositionId },
    run: async ({ supabase, input: values }) => {
      const investmentHoldingId = await resolveInvestmentHoldingId(
        supabase,
        householdId,
        values,
      );
      const openingPrincipalMinorUnits = parseDecimalToMinorUnits(
        values.openingPrincipal,
        values.currencyCode,
      );
      const expectedDailyRate = toExpectedDailyRate(
        values.expectedDailyRatePercent,
      );

      const response = await supabase
        .from("staking_positions")
        .update({
          name: values.name,
          investment_holding_id: investmentHoldingId,
          opening_principal_minor_units: openingPrincipalMinorUnits,
          opening_date: values.openingDate,
          currency_code: values.currencyCode,
          expected_daily_rate: expectedDailyRate,
          lock_in_end_date: values.lockInEndDate ?? null,
          fee_notes: values.feeNotes ?? null,
          risk_notes: values.riskNotes ?? null,
          notes: values.notes ?? null,
        })
        .eq("id", values.stakingPositionId)
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
      eventType: "staking_position.updated",
      entityType: "staking_position",
      entityId: output.id,
    }),
    revalidatePaths: [...STAKING_REVALIDATE_PATHS],
  });
}

async function setStatus(
  householdId: string,
  input: StakingStatusActionInput,
  status: "active" | "paused" | "closed",
): Promise<ActionResult<StakingPositionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: stakingStatusActionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("staking_positions")
        .update({ status })
        .eq("id", values.stakingPositionId)
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
      eventType: `staking_position.${status}`,
      entityType: "staking_position",
      entityId: output.id,
    }),
    revalidatePaths: [...STAKING_REVALIDATE_PATHS],
  });
}

export async function pauseStakingPositionAction(
  householdId: string,
  input: StakingStatusActionInput,
): Promise<ActionResult<StakingPositionRecord>> {
  return setStatus(householdId, input, "paused");
}

export async function resumeStakingPositionAction(
  householdId: string,
  input: StakingStatusActionInput,
): Promise<ActionResult<StakingPositionRecord>> {
  return setStatus(householdId, input, "active");
}

export async function closeStakingPositionAction(
  householdId: string,
  input: StakingStatusActionInput,
): Promise<ActionResult<StakingPositionRecord>> {
  return setStatus(householdId, input, "closed");
}

/**
 * Records one day's snapshot — PROMPT 19's "daily snapshots." `reward` is
 * derived here (never collected directly) as `closing - opening -
 * contribution + withdrawal + fee`, so the closing-value equation always
 * balances by construction rather than asking the household to do that
 * arithmetic. If a snapshot already exists for this (position, date), this
 * call becomes a *versioned adjustment* — the next revision number, with
 * `adjustmentReason` required (PROMPT 19: "allow adjustments with
 * explanation" / "unless adjustments are explicitly versioned") — never an
 * overwrite of the existing row, which the database also structurally
 * forbids (no UPDATE grant on staking_daily_snapshots at all).
 */
export async function recordDailySnapshotAction(
  householdId: string,
  input: RecordStakingSnapshotInput,
): Promise<ActionResult<StakingSnapshotRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordStakingSnapshotSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const position = await fetchPosition(
        supabase,
        householdId,
        values.stakingPositionId,
      );

      const existingRevisionsResponse = await supabase
        .from("staking_daily_snapshots")
        .select("revision")
        .eq("household_id", householdId)
        .eq("staking_position_id", values.stakingPositionId)
        .eq("snapshot_date", values.snapshotDate)
        .order("revision", { ascending: false })
        .limit(1);
      if (existingRevisionsResponse.error) {
        throw mapSupabaseError(existingRevisionsResponse.error);
      }
      const previousRevision = existingRevisionsResponse.data[0]?.revision ?? 0;
      const revision = previousRevision + 1;

      if (revision > 1 && !values.adjustmentReason?.trim()) {
        throw new ValidationError(
          "A snapshot already exists for this date — explain the adjustment before recording a new revision.",
        );
      }

      const openingValueMinorUnits = parseDecimalToMinorUnits(
        values.openingValue,
        position.currency_code,
      );
      const contributionMinorUnits = parseDecimalToMinorUnits(
        values.contribution,
        position.currency_code,
      );
      const withdrawalMinorUnits = parseDecimalToMinorUnits(
        values.withdrawal,
        position.currency_code,
      );
      const feeMinorUnits = parseDecimalToMinorUnits(
        values.fee,
        position.currency_code,
      );
      const closingValueMinorUnits = parseDecimalToMinorUnits(
        values.closingValue,
        position.currency_code,
      );
      // Derived, never collected directly — rearranging PROMPT 19's own
      // equation (closing = opening + contribution + reward - withdrawal
      // - fee) to solve for reward guarantees it always balances.
      const rewardMinorUnits =
        closingValueMinorUnits -
        openingValueMinorUnits -
        contributionMinorUnits +
        withdrawalMinorUnits +
        feeMinorUnits;

      const response = await supabase
        .from("staking_daily_snapshots")
        .insert({
          household_id: householdId,
          staking_position_id: values.stakingPositionId,
          snapshot_date: values.snapshotDate,
          revision,
          opening_value_minor_units: openingValueMinorUnits,
          contribution_minor_units: contributionMinorUnits,
          withdrawal_minor_units: withdrawalMinorUnits,
          reward_minor_units: rewardMinorUnits,
          fee_minor_units: feeMinorUnits,
          closing_value_minor_units: closingValueMinorUnits,
          currency_code: position.currency_code,
          manually_confirmed: values.manuallyConfirmed,
          source: values.source,
          adjustment_reason: revision > 1 ? values.adjustmentReason : null,
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ input, output }) => ({
      householdId,
      eventType:
        output.revision > 1
          ? "staking_snapshot.adjusted"
          : "staking_snapshot.recorded",
      entityType: "staking_position",
      entityId: input.stakingPositionId,
      metadata: {
        snapshotDate: output.snapshot_date,
        revision: output.revision,
      },
    }),
    revalidatePaths: [...STAKING_REVALIDATE_PATHS],
  });
}
