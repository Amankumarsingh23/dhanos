"use server";

import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import {
  computeExcessRepaymentAmount,
  computeLendingOutstanding,
  selectEffectiveRepayments,
} from "@/lib/calculations/lending-outstanding";
import {
  createLendingSchema,
  recordLendingRepaymentSchema,
  reverseLendingRepaymentSchema,
  setLendingStatusSchema,
  updateLendingSchema,
  type CreateLendingInput,
  type RecordLendingRepaymentInput,
  type ReverseLendingRepaymentInput,
  type SetLendingStatusInput,
  type UpdateLendingInput,
} from "@/lib/validation/lending";
import type { LendingRecord, LendingRepaymentRecord } from "./queries";

/**
 * Server Actions for the lending/receivables feature (PROMPT 23) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one of
 * these implements via runHouseholdMutation. Creating a lending and
 * recording a repayment both span two tables (transactions + lendings, and
 * transactions + lending_repayments respectively) so both go through a
 * SECURITY INVOKER RPC (create_lending/record_lending_repayment) for real
 * atomicity — see supabase/migrations/20260722160000_lending.sql.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const LENDING_REVALIDATE_PATHS = ["/app/lending"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchLending(
  supabase: SupabaseServerClient,
  householdId: string,
  lendingId: string,
): Promise<LendingRecord> {
  const response = await supabase
    .from("lendings")
    .select("*")
    .eq("id", lendingId)
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

async function fetchEffectiveRepayments(
  supabase: SupabaseServerClient,
  householdId: string,
  lendingId: string,
): Promise<LendingRepaymentRecord[]> {
  const response = await supabase
    .from("lending_repayments")
    .select("*")
    .eq("household_id", householdId)
    .eq("lending_id", lendingId);
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  return selectEffectiveRepayments(
    response.data.map((repayment) => ({
      id: repayment.id,
      reversesRepaymentId: repayment.reverses_repayment_id,
      principalComponentMinorUnits: repayment.principal_component_minor_units,
      original: repayment,
    })),
  ).map((repayment) => repayment.original);
}

/**
 * Creates a lending record and its one-time disbursement transaction
 * atomically via create_lending — a lendings row can never exist without
 * its disbursement (PROMPT 23 acceptance criterion "amount lent is not a
 * consumption expense": the transaction is always kind = lending_disbursement,
 * never any other kind).
 */
export async function createLendingAction(
  householdId: string,
  input: CreateLendingInput,
): Promise<ActionResult<LendingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createLendingSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const amountLentMinorUnits = parseDecimalToMinorUnits(
        values.amountLent,
        values.currencyCode,
      );
      const annualInterestRate =
        values.chargesInterest && values.annualInterestRatePercent
          ? Number(values.annualInterestRatePercent) / 100
          : null;
      if (
        values.chargesInterest &&
        (annualInterestRate === null || !Number.isFinite(annualInterestRate))
      ) {
        throw new ValidationError("Enter a valid annual interest rate.");
      }
      const installmentAmountMinorUnits =
        values.repaymentScheduleType === "installments" &&
        values.installmentAmount
          ? parseDecimalToMinorUnits(
              values.installmentAmount,
              values.currencyCode,
            )
          : null;

      const response = await supabase.rpc("create_lending", {
        p_household_id: householdId,
        p_name: values.name,
        p_borrower_person_id: values.borrowerPersonId || undefined,
        p_borrower_institution_id: values.borrowerInstitutionId || undefined,
        p_source_account_id: values.sourceAccountId,
        p_amount_lent_minor_units: amountLentMinorUnits,
        p_currency_code: values.currencyCode,
        p_disbursed_date: values.disbursedDate,
        p_purpose: values.purpose ?? undefined,
        p_charges_interest: values.chargesInterest,
        p_annual_interest_rate: annualInterestRate ?? undefined,
        p_interest_type: values.interestType ?? undefined,
        p_expected_repayment_date: values.expectedRepaymentDate ?? undefined,
        p_repayment_schedule_type: values.repaymentScheduleType,
        p_installment_amount_minor_units:
          installmentAmountMinorUnits ?? undefined,
        p_installment_frequency: values.installmentFrequency ?? undefined,
        p_risk_level: values.riskLevel,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "lending.created",
      entityType: "lending",
      entityId: output.id,
      metadata: { amountLentMinorUnits: output.amount_lent_minor_units },
    }),
    revalidatePaths: [
      ...LENDING_REVALIDATE_PATHS,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

export async function updateLendingAction(
  householdId: string,
  lendingId: string,
  input: UpdateLendingInput,
): Promise<ActionResult<LendingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateLendingSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const lending = await fetchLending(supabase, householdId, lendingId);

      const annualInterestRate =
        values.chargesInterest && values.annualInterestRatePercent
          ? Number(values.annualInterestRatePercent) / 100
          : null;
      if (
        values.chargesInterest &&
        (annualInterestRate === null || !Number.isFinite(annualInterestRate))
      ) {
        throw new ValidationError("Enter a valid annual interest rate.");
      }
      const installmentAmountMinorUnits =
        values.repaymentScheduleType === "installments" &&
        values.installmentAmount
          ? parseDecimalToMinorUnits(
              values.installmentAmount,
              lending.currency_code,
            )
          : null;

      const response = await supabase
        .from("lendings")
        .update({
          name: values.name,
          borrower_person_id: values.borrowerPersonId || null,
          borrower_institution_id: values.borrowerInstitutionId || null,
          purpose: values.purpose ?? null,
          charges_interest: values.chargesInterest,
          annual_interest_rate: annualInterestRate,
          interest_type: values.interestType ?? null,
          expected_repayment_date: values.expectedRepaymentDate ?? null,
          repayment_schedule_type: values.repaymentScheduleType,
          installment_amount_minor_units: installmentAmountMinorUnits,
          installment_frequency: values.installmentFrequency ?? null,
          risk_level: values.riskLevel,
          notes: values.notes ?? null,
        })
        .eq("id", lendingId)
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
      eventType: "lending.updated",
      entityType: "lending",
      entityId: output.id,
    }),
    revalidatePaths: [...LENDING_REVALIDATE_PATHS, `/app/lending/${lendingId}`],
  });
}

export async function deleteLendingAction(
  householdId: string,
  lendingId: string,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: setLendingStatusSchema.pick({ lendingId: true }),
    input: { lendingId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("lendings")
        .delete()
        .eq("id", values.lendingId)
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
      eventType: "lending.deleted",
      entityType: "lending",
      entityId: values.lendingId,
    }),
    revalidatePaths: [...LENDING_REVALIDATE_PATHS],
  });
}

export async function setLendingStatusAction(
  householdId: string,
  input: SetLendingStatusInput,
): Promise<ActionResult<LendingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setLendingStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("lendings")
        .update({ status: values.status })
        .eq("id", values.lendingId)
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
      eventType: `lending.${values.status}`,
      entityType: "lending",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...LENDING_REVALIDATE_PATHS,
      `/app/lending/${input.lendingId}`,
    ],
  });
}

/**
 * recordLendingRepaymentAction returns one of these instead of the bare
 * repayment: an `excess_warning` means nothing was written yet — the caller
 * must resubmit with `confirmExcess: true` to proceed. Same "warning, never
 * a silent block or a silent negative balance" shape as
 * recordLoanPaymentAction's overpayment_warning.
 */
export type RecordLendingRepaymentOutcome =
  | { kind: "recorded"; repayment: LendingRepaymentRecord }
  | {
      kind: "excess_warning";
      outstandingMinorUnits: number;
      excessAmountMinorUnits: number;
    };

export async function recordLendingRepaymentAction(
  householdId: string,
  input: RecordLendingRepaymentInput,
): Promise<ActionResult<RecordLendingRepaymentOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordLendingRepaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const lending = await fetchLending(
        supabase,
        householdId,
        values.lendingId,
      );
      const effectiveRepayments = await fetchEffectiveRepayments(
        supabase,
        householdId,
        values.lendingId,
      );
      const outstanding = computeLendingOutstanding(
        lending.amount_lent_minor_units,
        effectiveRepayments.map((repayment) => ({
          principalComponentMinorUnits:
            repayment.principal_component_minor_units,
          interestComponentMinorUnits: repayment.interest_component_minor_units,
          excessAmountMinorUnits: repayment.excess_amount_minor_units,
        })),
      );

      const principalMinorUnits = parseDecimalToMinorUnits(
        values.principalComponent,
        lending.currency_code,
      );
      const interestMinorUnits = parseDecimalToMinorUnits(
        values.interestComponent,
        lending.currency_code,
      );

      if (principalMinorUnits + interestMinorUnits <= 0) {
        throw new ValidationError(
          "Enter at least one non-zero repayment component.",
        );
      }

      const excessAmountMinorUnits = computeExcessRepaymentAmount(
        outstanding.outstandingMinorUnits,
        principalMinorUnits,
      );
      if (excessAmountMinorUnits > 0 && !values.confirmExcess) {
        return {
          kind: "excess_warning",
          outstandingMinorUnits: outstanding.outstandingMinorUnits,
          excessAmountMinorUnits,
        } satisfies RecordLendingRepaymentOutcome;
      }

      const response = await supabase.rpc("record_lending_repayment", {
        p_household_id: householdId,
        p_lending_id: values.lendingId,
        p_repayment_date: values.repaymentDate,
        p_principal_component_minor_units: principalMinorUnits,
        p_interest_component_minor_units: interestMinorUnits,
        p_excess_amount_minor_units: excessAmountMinorUnits,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return {
        kind: "recorded",
        repayment: response.data,
      } satisfies RecordLendingRepaymentOutcome;
    },
    activityEvent: ({ input: values, output }) =>
      output.kind === "recorded"
        ? {
            householdId,
            eventType: "lending_repayment.recorded",
            entityType: "lending",
            entityId: values.lendingId,
            metadata: {
              repaymentId: output.repayment.id,
              totalRepaymentMinorUnits:
                output.repayment.total_repayment_minor_units,
            },
          }
        : null,
    revalidatePaths: [
      ...LENDING_REVALIDATE_PATHS,
      `/app/lending/${input.lendingId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

/**
 * Reverses a mis-entered repayment *record* — a new lending_repayments row
 * mirroring the original's components so selectEffectiveRepayments nets
 * both to zero, never an update/delete of the append-only original. This
 * does not itself move money back or touch the original's linked
 * transaction — if the underlying cash movement also needs correcting,
 * that's a separate edit/cancel from the Transactions feature.
 */
export async function reverseLendingRepaymentAction(
  householdId: string,
  input: ReverseLendingRepaymentInput,
): Promise<ActionResult<LendingRepaymentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reverseLendingRepaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const originalResponse = await supabase
        .from("lending_repayments")
        .select("*")
        .eq("id", values.repaymentId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (originalResponse.error) {
        throw mapSupabaseError(originalResponse.error);
      }
      const original = originalResponse.data;
      if (!original) {
        throw new NotFoundError();
      }
      if (original.reverses_repayment_id) {
        throw new ValidationError("A reversal row cannot itself be reversed.");
      }

      const existingReversal = await supabase
        .from("lending_repayments")
        .select("id")
        .eq("household_id", householdId)
        .eq("reverses_repayment_id", original.id)
        .maybeSingle();
      if (existingReversal.error) {
        throw mapSupabaseError(existingReversal.error);
      }
      if (existingReversal.data) {
        throw new ValidationError("This repayment has already been reversed.");
      }

      const response = await supabase
        .from("lending_repayments")
        .insert({
          household_id: householdId,
          lending_id: original.lending_id,
          repayment_date: original.repayment_date,
          principal_component_minor_units:
            original.principal_component_minor_units,
          interest_component_minor_units:
            original.interest_component_minor_units,
          total_repayment_minor_units: original.total_repayment_minor_units,
          excess_amount_minor_units: original.excess_amount_minor_units,
          currency_code: original.currency_code,
          reverses_repayment_id: original.id,
          reversal_reason: values.reversalReason,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      // A lending is only genuinely "repaid" at zero outstanding —
      // reversing the repayment that caused an auto-advance (see
      // record_lending_repayment) can put outstanding back above zero, so
      // the status must follow. Never touches a manually-set
      // 'delayed'/'disputed'/'written_off' status.
      const lending = await fetchLending(
        supabase,
        householdId,
        original.lending_id,
      );
      if (
        lending.status === "repaid" ||
        lending.status === "partially_repaid"
      ) {
        const effectiveRepayments = await fetchEffectiveRepayments(
          supabase,
          householdId,
          original.lending_id,
        );
        const outstanding = computeLendingOutstanding(
          lending.amount_lent_minor_units,
          effectiveRepayments.map((repayment) => ({
            principalComponentMinorUnits:
              repayment.principal_component_minor_units,
            interestComponentMinorUnits:
              repayment.interest_component_minor_units,
            excessAmountMinorUnits: repayment.excess_amount_minor_units,
          })),
        );
        const nextStatus =
          outstanding.outstandingMinorUnits <= 0
            ? "repaid"
            : outstanding.outstandingMinorUnits <
                lending.amount_lent_minor_units
              ? "partially_repaid"
              : "active";
        if (nextStatus !== lending.status) {
          await supabase
            .from("lendings")
            .update({ status: nextStatus })
            .eq("id", original.lending_id)
            .eq("household_id", householdId);
        }
      }

      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "lending_repayment.reversed",
      entityType: "lending",
      entityId: output.lending_id,
      metadata: { repaymentId: values.repaymentId, reversalId: output.id },
    }),
    revalidatePaths: [...LENDING_REVALIDATE_PATHS],
  });
}
