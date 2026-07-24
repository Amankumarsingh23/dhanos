"use server";

import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import {
  computeExcessPaymentAmount,
  computeLiabilityOutstanding,
  selectEffectivePayments,
} from "@/lib/calculations/liability-outstanding";
import {
  createLiabilitySchema,
  recordLiabilityPaymentSchema,
  reverseLiabilityPaymentSchema,
  setLiabilityStatusSchema,
  updateLiabilitySchema,
  type CreateLiabilityInput,
  type RecordLiabilityPaymentInput,
  type ReverseLiabilityPaymentInput,
  type SetLiabilityStatusInput,
  type UpdateLiabilityInput,
} from "@/lib/validation/liabilities";
import type { LiabilityPaymentRecord, LiabilityRecord } from "./queries";

/**
 * Server Actions for the liabilities feature (PROMPT 24) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Creating a liability that
 * received cash, and recording a payment, both span two tables
 * (transactions + liabilities, and transactions + liability_payments
 * respectively) so both go through a SECURITY INVOKER RPC
 * (create_liability/record_liability_payment) for real atomicity — see
 * supabase/migrations/20260722170000_liabilities.sql.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const LIABILITIES_REVALIDATE_PATHS = ["/app/liabilities"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchLiability(
  supabase: SupabaseServerClient,
  householdId: string,
  liabilityId: string,
): Promise<LiabilityRecord> {
  const response = await supabase
    .from("liabilities")
    .select("*")
    .eq("id", liabilityId)
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

async function fetchEffectivePayments(
  supabase: SupabaseServerClient,
  householdId: string,
  liabilityId: string,
): Promise<LiabilityPaymentRecord[]> {
  const response = await supabase
    .from("liability_payments")
    .select("*")
    .eq("household_id", householdId)
    .eq("liability_id", liabilityId);
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  return selectEffectivePayments(
    response.data.map((payment) => ({
      id: payment.id,
      reversesPaymentId: payment.reverses_payment_id,
      principalComponentMinorUnits: payment.principal_component_minor_units,
      original: payment,
    })),
  ).map((payment) => payment.original);
}

/**
 * Creates a liability, and — only when a receiving account was given —
 * atomically writes the matching liability_incurred transaction alongside
 * it (never income, never a fabricated cash event for a liability with no
 * actual cash movement).
 */
export async function createLiabilityAction(
  householdId: string,
  input: CreateLiabilityInput,
): Promise<ActionResult<LiabilityRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createLiabilitySchema,
    input,
    run: async ({ supabase, input: values }) => {
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
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

      const response = await supabase.rpc("create_liability", {
        p_household_id: householdId,
        p_name: values.name,
        p_liability_source: values.liabilitySource,
        p_category: values.category,
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_start_date: values.startDate,
        p_payment_account_id: values.paymentAccountId,
        p_counterparty_person_id: values.counterpartyPersonId || undefined,
        p_counterparty_institution_id:
          values.counterpartyInstitutionId || undefined,
        p_due_date: values.dueDate ?? undefined,
        p_charges_interest: values.chargesInterest,
        p_annual_interest_rate: annualInterestRate ?? undefined,
        p_interest_type: values.interestType ?? undefined,
        p_repayment_schedule_type: values.repaymentScheduleType,
        p_installment_amount_minor_units:
          installmentAmountMinorUnits ?? undefined,
        p_installment_frequency: values.installmentFrequency ?? undefined,
        p_documentation_status: values.documentationStatus,
        p_certainty: values.certainty,
        p_receiving_account_id: values.receivingAccountId || undefined,
        p_received_date: values.receivedDate ?? undefined,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "liability.created",
      entityType: "liability",
      entityId: output.id,
      metadata: { amountMinorUnits: output.amount_minor_units },
    }),
    revalidatePaths: [
      ...LIABILITIES_REVALIDATE_PATHS,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

export async function updateLiabilityAction(
  householdId: string,
  liabilityId: string,
  input: UpdateLiabilityInput,
): Promise<ActionResult<LiabilityRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateLiabilitySchema,
    input,
    run: async ({ supabase, input: values }) => {
      const liability = await fetchLiability(
        supabase,
        householdId,
        liabilityId,
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
              liability.currency_code,
            )
          : null;

      const response = await supabase
        .from("liabilities")
        .update({
          name: values.name,
          liability_source: values.liabilitySource,
          category: values.category,
          counterparty_person_id: values.counterpartyPersonId || null,
          counterparty_institution_id: values.counterpartyInstitutionId || null,
          due_date: values.dueDate ?? null,
          charges_interest: values.chargesInterest,
          annual_interest_rate: annualInterestRate,
          interest_type: values.interestType ?? null,
          repayment_schedule_type: values.repaymentScheduleType,
          installment_amount_minor_units: installmentAmountMinorUnits,
          installment_frequency: values.installmentFrequency ?? null,
          documentation_status: values.documentationStatus,
          certainty: values.certainty,
          payment_account_id: values.paymentAccountId,
          notes: values.notes ?? null,
        })
        .eq("id", liabilityId)
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
      eventType: "liability.updated",
      entityType: "liability",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...LIABILITIES_REVALIDATE_PATHS,
      `/app/liabilities/${liabilityId}`,
    ],
  });
}

export async function deleteLiabilityAction(
  householdId: string,
  liabilityId: string,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: setLiabilityStatusSchema.pick({ liabilityId: true }),
    input: { liabilityId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("liabilities")
        .delete()
        .eq("id", values.liabilityId)
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
      eventType: "liability.deleted",
      entityType: "liability",
      entityId: values.liabilityId,
    }),
    revalidatePaths: [...LIABILITIES_REVALIDATE_PATHS],
  });
}

export async function setLiabilityStatusAction(
  householdId: string,
  input: SetLiabilityStatusInput,
): Promise<ActionResult<LiabilityRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setLiabilityStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("liabilities")
        .update({ status: values.status })
        .eq("id", values.liabilityId)
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
      eventType: `liability.${values.status}`,
      entityType: "liability",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...LIABILITIES_REVALIDATE_PATHS,
      `/app/liabilities/${input.liabilityId}`,
    ],
  });
}

export type RecordLiabilityPaymentOutcome =
  | { kind: "recorded"; payment: LiabilityPaymentRecord }
  | {
      kind: "excess_warning";
      outstandingMinorUnits: number;
      excessAmountMinorUnits: number;
    };

export async function recordLiabilityPaymentAction(
  householdId: string,
  input: RecordLiabilityPaymentInput,
): Promise<ActionResult<RecordLiabilityPaymentOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordLiabilityPaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const liability = await fetchLiability(
        supabase,
        householdId,
        values.liabilityId,
      );
      const effectivePayments = await fetchEffectivePayments(
        supabase,
        householdId,
        values.liabilityId,
      );
      const outstanding = computeLiabilityOutstanding(
        liability.amount_minor_units,
        effectivePayments.map((payment) => ({
          principalComponentMinorUnits: payment.principal_component_minor_units,
          interestComponentMinorUnits: payment.interest_component_minor_units,
          excessAmountMinorUnits: payment.excess_amount_minor_units,
        })),
      );

      const principalMinorUnits = parseDecimalToMinorUnits(
        values.principalComponent,
        liability.currency_code,
      );
      const interestMinorUnits = parseDecimalToMinorUnits(
        values.interestComponent,
        liability.currency_code,
      );

      if (principalMinorUnits + interestMinorUnits <= 0) {
        throw new ValidationError(
          "Enter at least one non-zero payment component.",
        );
      }

      const excessAmountMinorUnits = computeExcessPaymentAmount(
        outstanding.outstandingMinorUnits,
        principalMinorUnits,
      );
      if (excessAmountMinorUnits > 0 && !values.confirmExcess) {
        return {
          kind: "excess_warning",
          outstandingMinorUnits: outstanding.outstandingMinorUnits,
          excessAmountMinorUnits,
        } satisfies RecordLiabilityPaymentOutcome;
      }

      const response = await supabase.rpc("record_liability_payment", {
        p_household_id: householdId,
        p_liability_id: values.liabilityId,
        p_payment_date: values.paymentDate,
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
        payment: response.data,
      } satisfies RecordLiabilityPaymentOutcome;
    },
    activityEvent: ({ input: values, output }) =>
      output.kind === "recorded"
        ? {
            householdId,
            eventType: "liability_payment.recorded",
            entityType: "liability",
            entityId: values.liabilityId,
            metadata: {
              paymentId: output.payment.id,
              totalPaymentMinorUnits: output.payment.total_payment_minor_units,
            },
          }
        : null,
    revalidatePaths: [
      ...LIABILITIES_REVALIDATE_PATHS,
      `/app/liabilities/${input.liabilityId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

/**
 * Reverses a mis-entered payment *record* — a new liability_payments row
 * mirroring the original's components so selectEffectivePayments nets both
 * to zero, never an update/delete of the append-only original. This is
 * the concrete enforcement of "payment history remains auditable" (PROMPT
 * 24 acceptance criterion): nothing is ever removed, a correction is
 * always a new, visible row.
 */
export async function reverseLiabilityPaymentAction(
  householdId: string,
  input: ReverseLiabilityPaymentInput,
): Promise<ActionResult<LiabilityPaymentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reverseLiabilityPaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const originalResponse = await supabase
        .from("liability_payments")
        .select("*")
        .eq("id", values.paymentId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (originalResponse.error) {
        throw mapSupabaseError(originalResponse.error);
      }
      const original = originalResponse.data;
      if (!original) {
        throw new NotFoundError();
      }
      if (original.reverses_payment_id) {
        throw new ValidationError("A reversal row cannot itself be reversed.");
      }

      const existingReversal = await supabase
        .from("liability_payments")
        .select("id")
        .eq("household_id", householdId)
        .eq("reverses_payment_id", original.id)
        .maybeSingle();
      if (existingReversal.error) {
        throw mapSupabaseError(existingReversal.error);
      }
      if (existingReversal.data) {
        throw new ValidationError("This payment has already been reversed.");
      }

      const response = await supabase
        .from("liability_payments")
        .insert({
          household_id: householdId,
          liability_id: original.liability_id,
          payment_date: original.payment_date,
          principal_component_minor_units:
            original.principal_component_minor_units,
          interest_component_minor_units:
            original.interest_component_minor_units,
          total_payment_minor_units: original.total_payment_minor_units,
          excess_amount_minor_units: original.excess_amount_minor_units,
          currency_code: original.currency_code,
          reverses_payment_id: original.id,
          reversal_reason: values.reversalReason,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      // A liability is only genuinely "paid" at zero outstanding —
      // reversing the payment that caused an auto-advance can put
      // outstanding back above zero, so the status must follow. Never
      // touches a manually-set 'disputed'/'waived' status.
      const liability = await fetchLiability(
        supabase,
        householdId,
        original.liability_id,
      );
      if (
        liability.status === "paid" ||
        liability.status === "partially_paid"
      ) {
        const effectivePayments = await fetchEffectivePayments(
          supabase,
          householdId,
          original.liability_id,
        );
        const outstanding = computeLiabilityOutstanding(
          liability.amount_minor_units,
          effectivePayments.map((payment) => ({
            principalComponentMinorUnits:
              payment.principal_component_minor_units,
            interestComponentMinorUnits: payment.interest_component_minor_units,
            excessAmountMinorUnits: payment.excess_amount_minor_units,
          })),
        );
        const nextStatus =
          outstanding.outstandingMinorUnits <= 0
            ? "paid"
            : outstanding.outstandingMinorUnits < liability.amount_minor_units
              ? "partially_paid"
              : "active";
        if (nextStatus !== liability.status) {
          await supabase
            .from("liabilities")
            .update({ status: nextStatus })
            .eq("id", original.liability_id)
            .eq("household_id", householdId);
        }
      }

      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "liability_payment.reversed",
      entityType: "liability",
      entityId: output.liability_id,
      metadata: { paymentId: values.paymentId, reversalId: output.id },
    }),
    revalidatePaths: [...LIABILITIES_REVALIDATE_PATHS],
  });
}
