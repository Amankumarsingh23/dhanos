"use server";

import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import {
  deleteWaitingPeriodSchema,
  insurancePolicyFieldsSchema,
  recordPremiumPaymentSchema,
  setPolicyStatusSchema,
  waitingPeriodFieldsSchema,
  type DeleteWaitingPeriodInput,
  type InsurancePolicyFieldsInput,
  type RecordPremiumPaymentInput,
  type SetPolicyStatusInput,
  type WaitingPeriodFieldsInput,
} from "@/lib/validation/insurance";
import type {
  InsurancePolicyRecord,
  InsurancePremiumTransaction,
  WaitingPeriodRecord,
} from "./queries";

/**
 * Server Actions for the insurance feature (PROMPT 25) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Creating a policy (and
 * renewing one) spans two tables (insurance_policies +
 * insurance_policy_insured_people, and — for a renewal — a status flip on
 * the superseded row) so both go through the create_insurance_policy
 * SECURITY INVOKER RPC for real atomicity — see
 * supabase/migrations/20260722180000_insurance.sql. A premium payment is a
 * single-table transactions insert (no outstanding balance to keep in
 * sync, unlike loans/lending/liabilities), so it never needs an RPC.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const INSURANCE_REVALIDATE_PATHS = ["/app/insurance"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchPolicy(
  supabase: SupabaseServerClient,
  householdId: string,
  policyId: string,
): Promise<InsurancePolicyRecord> {
  const response = await supabase
    .from("insurance_policies")
    .select("*")
    .eq("id", policyId)
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

function toPolicyRpcArgs(
  householdId: string,
  values: InsurancePolicyFieldsInput,
) {
  const coverageAmountMinorUnits = parseDecimalToMinorUnits(
    values.coverageAmount,
    values.currencyCode,
  );
  const premiumAmountMinorUnits = parseDecimalToMinorUnits(
    values.premiumAmount,
    values.currencyCode,
  );
  const deductibleMinorUnits =
    values.deductible && values.deductible.trim() !== ""
      ? parseDecimalToMinorUnits(values.deductible, values.currencyCode)
      : null;
  const coPayPercentage =
    values.coPayPercent && values.coPayPercent.trim() !== ""
      ? Number(values.coPayPercent) / 100
      : null;
  if (coPayPercentage !== null && !Number.isFinite(coPayPercentage)) {
    throw new ValidationError("Enter a valid co-pay percentage.");
  }
  const preHospitalizationDays =
    values.preHospitalizationDays && values.preHospitalizationDays.trim() !== ""
      ? Number(values.preHospitalizationDays)
      : null;
  const postHospitalizationDays =
    values.postHospitalizationDays &&
    values.postHospitalizationDays.trim() !== ""
      ? Number(values.postHospitalizationDays)
      : null;

  return {
    p_household_id: householdId,
    p_policy_type: values.policyType,
    p_name: values.name,
    p_insurer_institution_id: values.insurerInstitutionId,
    p_policyholder_person_id: values.policyholderPersonId,
    p_coverage_amount_minor_units: coverageAmountMinorUnits,
    p_currency_code: values.currencyCode,
    p_premium_amount_minor_units: premiumAmountMinorUnits,
    p_premium_frequency: values.premiumFrequency,
    p_start_date: values.startDate,
    p_payment_account_id: values.paymentAccountId,
    p_insured_person_ids: values.insuredPersonIds,
    p_nominee_person_id: values.nomineePersonId || undefined,
    p_masked_policy_number: values.maskedPolicyNumber ?? undefined,
    p_renewal_date: values.renewalDate ?? undefined,
    p_expiry_date: values.expiryDate ?? undefined,
    p_agent_name: values.agentName ?? undefined,
    p_agent_contact: values.agentContact ?? undefined,
    p_support_contact: values.supportContact ?? undefined,
    p_claim_contact: values.claimContact ?? undefined,
    p_notes: values.notes ?? undefined,
    p_deductible_minor_units: deductibleMinorUnits ?? undefined,
    p_co_pay_percentage: coPayPercentage ?? undefined,
    p_room_rent_restriction: values.roomRentRestriction ?? undefined,
    p_pre_existing_conditions_declared:
      values.preExistingConditionsDeclared ?? undefined,
    p_waiting_periods: values.waitingPeriods ?? undefined,
    p_network_hospital_notes: values.networkHospitalNotes ?? undefined,
    p_cashless_availability: values.cashlessAvailability ?? undefined,
    p_restoration_benefit: values.restorationBenefit ?? undefined,
    p_no_claim_bonus: values.noClaimBonus ?? undefined,
    p_opd_cover: values.opdCover ?? undefined,
    p_consumables_cover: values.consumablesCover ?? undefined,
    p_pre_hospitalization_days: preHospitalizationDays ?? undefined,
    p_post_hospitalization_days: postHospitalizationDays ?? undefined,
    p_day_care_treatment: values.dayCareTreatment ?? undefined,
    p_exclusions_summary: values.exclusionsSummary ?? undefined,
  };
}

export async function createInsurancePolicyAction(
  householdId: string,
  input: InsurancePolicyFieldsInput,
): Promise<ActionResult<InsurancePolicyRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: insurancePolicyFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase.rpc(
        "create_insurance_policy",
        toPolicyRpcArgs(householdId, values),
      );
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "insurance_policy.created",
      entityType: "insurance_policy",
      entityId: output.id,
      metadata: { policyType: output.policy_type },
    }),
    revalidatePaths: [...INSURANCE_REVALIDATE_PATHS],
  });
}

/**
 * Renews a policy: create_insurance_policy is called again with
 * previousPolicyId set, so it atomically inserts a brand-new row (a new
 * period) and flips the *old* row's status to 'renewed' — the old row's
 * own data is never edited (PROMPT 25: "renewal does not overwrite the old
 * policy period").
 */
export async function renewInsurancePolicyAction(
  householdId: string,
  previousPolicyId: string,
  input: InsurancePolicyFieldsInput,
): Promise<ActionResult<InsurancePolicyRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: insurancePolicyFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      await fetchPolicy(supabase, householdId, previousPolicyId);
      const response = await supabase.rpc("create_insurance_policy", {
        ...toPolicyRpcArgs(householdId, values),
        p_previous_policy_id: previousPolicyId,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "insurance_policy.renewed",
      entityType: "insurance_policy",
      entityId: output.id,
      metadata: { previousPolicyId },
    }),
    revalidatePaths: [
      ...INSURANCE_REVALIDATE_PATHS,
      `/app/insurance/${previousPolicyId}`,
    ],
  });
}

/**
 * Updates a policy's terms in place — for correcting this same period's
 * data (a typo, a missing contact), not for recording an actual new
 * premium/coverage term, which should go through renewInsurancePolicyAction
 * instead so the old period stays intact. Insured people are replaced
 * (delete-then-insert) to match the submitted set.
 */
export async function updateInsurancePolicyAction(
  householdId: string,
  policyId: string,
  input: InsurancePolicyFieldsInput,
): Promise<ActionResult<InsurancePolicyRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: insurancePolicyFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const args = toPolicyRpcArgs(householdId, values);

      const response = await supabase
        .from("insurance_policies")
        .update({
          policy_type: values.policyType,
          name: values.name,
          insurer_institution_id: values.insurerInstitutionId,
          policyholder_person_id: values.policyholderPersonId,
          nominee_person_id: values.nomineePersonId || null,
          masked_policy_number: values.maskedPolicyNumber ?? null,
          coverage_amount_minor_units: args.p_coverage_amount_minor_units,
          currency_code: values.currencyCode,
          premium_amount_minor_units: args.p_premium_amount_minor_units,
          premium_frequency: values.premiumFrequency,
          start_date: values.startDate,
          renewal_date: values.renewalDate ?? null,
          expiry_date: values.expiryDate ?? null,
          agent_name: values.agentName ?? null,
          agent_contact: values.agentContact ?? null,
          support_contact: values.supportContact ?? null,
          claim_contact: values.claimContact ?? null,
          notes: values.notes ?? null,
          payment_account_id: values.paymentAccountId,
          deductible_minor_units: args.p_deductible_minor_units ?? null,
          co_pay_percentage: args.p_co_pay_percentage ?? null,
          room_rent_restriction: values.roomRentRestriction ?? null,
          pre_existing_conditions_declared:
            values.preExistingConditionsDeclared ?? null,
          waiting_periods: values.waitingPeriods ?? null,
          network_hospital_notes: values.networkHospitalNotes ?? null,
          cashless_availability: values.cashlessAvailability ?? null,
          restoration_benefit: values.restorationBenefit ?? null,
          no_claim_bonus: values.noClaimBonus ?? null,
          opd_cover: values.opdCover ?? null,
          consumables_cover: values.consumablesCover ?? null,
          pre_hospitalization_days: args.p_pre_hospitalization_days ?? null,
          post_hospitalization_days: args.p_post_hospitalization_days ?? null,
          day_care_treatment: values.dayCareTreatment ?? null,
          exclusions_summary: values.exclusionsSummary ?? null,
        })
        .eq("id", policyId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }

      const deleteResponse = await supabase
        .from("insurance_policy_insured_people")
        .delete()
        .eq("household_id", householdId)
        .eq("policy_id", policyId);
      if (deleteResponse.error) {
        throw mapSupabaseError(deleteResponse.error);
      }
      if (values.insuredPersonIds.length > 0) {
        const insertResponse = await supabase
          .from("insurance_policy_insured_people")
          .insert(
            values.insuredPersonIds.map((personId) => ({
              household_id: householdId,
              policy_id: policyId,
              person_id: personId,
            })),
          );
        if (insertResponse.error) {
          throw mapSupabaseError(insertResponse.error);
        }
      }

      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "insurance_policy.updated",
      entityType: "insurance_policy",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...INSURANCE_REVALIDATE_PATHS,
      `/app/insurance/${policyId}`,
    ],
  });
}

export async function deleteInsurancePolicyAction(
  householdId: string,
  policyId: string,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: setPolicyStatusSchema.pick({ policyId: true }),
    input: { policyId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("insurance_policies")
        .delete()
        .eq("id", values.policyId)
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
      eventType: "insurance_policy.deleted",
      entityType: "insurance_policy",
      entityId: values.policyId,
    }),
    revalidatePaths: [...INSURANCE_REVALIDATE_PATHS],
  });
}

export async function setPolicyStatusAction(
  householdId: string,
  input: SetPolicyStatusInput,
): Promise<ActionResult<InsurancePolicyRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setPolicyStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("insurance_policies")
        .update({ status: values.status })
        .eq("id", values.policyId)
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
      eventType: `insurance_policy.${values.status}`,
      entityType: "insurance_policy",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...INSURANCE_REVALIDATE_PATHS,
      `/app/insurance/${input.policyId}`,
    ],
  });
}

/**
 * Records a premium payment — a plain `kind = 'expense'` transaction
 * linked back via `insurance_policy_id` (PROMPT 25: "premium payment
 * creates a cash transaction"). A single-table insert, so no RPC is
 * needed — unlike loan/lending/liability payments, there's no second
 * "outstanding balance" table to keep in sync.
 */
export async function recordPremiumPaymentAction(
  householdId: string,
  input: RecordPremiumPaymentInput,
): Promise<ActionResult<InsurancePremiumTransaction>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordPremiumPaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const policy = await fetchPolicy(supabase, householdId, values.policyId);
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        policy.currency_code,
      );

      const response = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          kind: "expense",
          amount_minor_units: amountMinorUnits,
          currency_code: policy.currency_code,
          transaction_date: values.paymentDate,
          account_id: policy.payment_account_id,
          category_id: values.categoryId,
          related_person_id: policy.policyholder_person_id,
          insurance_policy_id: policy.id,
          status: "cleared",
          source_type: "manual",
          description: values.notes ?? `Premium: ${policy.name}`,
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
      eventType: "insurance_premium.recorded",
      entityType: "insurance_policy",
      entityId: values.policyId,
      metadata: {
        transactionId: output.id,
        amountMinorUnits: output.amount_minor_units,
      },
    }),
    revalidatePaths: [
      ...INSURANCE_REVALIDATE_PATHS,
      `/app/insurance/${input.policyId}`,
      "/app/cash-flow",
      "/app/expenses",
      "/app/accounts",
    ],
  });
}

/**
 * Structured waiting periods (PROMPT 26) — a policy-level, single-table
 * concern (create/delete only, no partial edit — deleting and re-adding
 * covers a correction, same as insurance_policy_insured_people's own
 * delete-then-insert replace pattern).
 */
export async function createWaitingPeriodAction(
  householdId: string,
  input: WaitingPeriodFieldsInput,
): Promise<ActionResult<WaitingPeriodRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: waitingPeriodFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      await fetchPolicy(supabase, householdId, values.policyId);

      const response = await supabase
        .from("insurance_policy_waiting_periods")
        .insert({
          household_id: householdId,
          policy_id: values.policyId,
          label: values.label,
          duration_months: Number(values.durationMonths),
          starts_from: values.startsFrom,
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
      eventType: "insurance_policy.waiting_period_added",
      entityType: "insurance_policy",
      entityId: output.policy_id,
    }),
    revalidatePaths: [
      ...INSURANCE_REVALIDATE_PATHS,
      `/app/insurance/${input.policyId}`,
    ],
  });
}

export async function deleteWaitingPeriodAction(
  householdId: string,
  input: DeleteWaitingPeriodInput,
): Promise<ActionResult<{ id: string; policy_id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: deleteWaitingPeriodSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("insurance_policy_waiting_periods")
        .delete()
        .eq("id", values.waitingPeriodId)
        .eq("household_id", householdId)
        .select("id, policy_id")
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
      eventType: "insurance_policy.waiting_period_removed",
      entityType: "insurance_policy",
      entityId: output.policy_id,
    }),
    revalidatePaths: [...INSURANCE_REVALIDATE_PATHS],
  });
}
