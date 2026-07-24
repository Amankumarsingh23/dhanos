"use server";

import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { createClient } from "@/lib/supabase/server";
import {
  computeLoanOutstanding,
  computeOverpaymentAmount,
  selectEffectivePayments,
} from "@/lib/calculations/loan-outstanding";
import {
  loanInputSchema,
  loanUpdateSchema,
  recordLoanDisbursementSchema,
  recordLoanPaymentSchema,
  reverseLoanPaymentSchema,
  setLoanStatusSchema,
  type LoanInput,
  type LoanUpdateInput,
  type RecordLoanDisbursementInput,
  type RecordLoanPaymentInput,
  type ReverseLoanPaymentInput,
  type SetLoanStatusInput,
} from "@/lib/validation/loans";
import type { LoanPaymentRecord, LoanRecord } from "./queries";

/**
 * Server Actions for the loans/debt feature (PROMPT 21) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Disbursing a loan and
 * recording a payment both span two tables (transactions + loans, and
 * transactions + loan_payments respectively) so both go through a
 * SECURITY INVOKER RPC (record_loan_disbursement/record_loan_payment) for
 * real atomicity — see supabase/migrations/20260722150000_loans.sql.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const LOANS_REVALIDATE_PATHS = ["/app/debts"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchLoan(
  supabase: SupabaseServerClient,
  householdId: string,
  loanId: string,
): Promise<LoanRecord> {
  const response = await supabase
    .from("loans")
    .select("*")
    .eq("id", loanId)
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
  loanId: string,
): Promise<LoanPaymentRecord[]> {
  const response = await supabase
    .from("loan_payments")
    .select("*")
    .eq("household_id", householdId)
    .eq("loan_id", loanId);
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

function toLoanFieldsPayload(householdId: string, values: LoanInput) {
  const originalPrincipalMinorUnits = parseDecimalToMinorUnits(
    values.originalPrincipal,
    values.currencyCode,
  );
  const annualInterestRate = Number(values.annualInterestRatePercent) / 100;
  if (!Number.isFinite(annualInterestRate)) {
    throw new ValidationError("Enter a valid annual interest rate.");
  }
  const emiAmountMinorUnits =
    values.emiAmount && values.emiAmount.trim() !== ""
      ? parseDecimalToMinorUnits(values.emiAmount, values.currencyCode)
      : null;

  return {
    household_id: householdId,
    name: values.name,
    loan_type: values.loanType,
    lender_institution_id: values.lenderInstitutionId || null,
    lender_person_id: values.lenderPersonId || null,
    borrower_person_id: values.borrowerPersonId,
    co_borrower_person_id: values.coBorrowerPersonId || null,
    original_principal_minor_units: originalPrincipalMinorUnits,
    currency_code: values.currencyCode,
    annual_interest_rate: annualInterestRate,
    interest_type: values.interestType,
    emi_amount_minor_units: emiAmountMinorUnits,
    start_date: values.startDate,
    repayment_start_date: values.repaymentStartDate,
    maturity_date: values.maturityDate ?? null,
    payment_account_id: values.paymentAccountId,
    collateral: values.collateral ?? null,
    notes: values.notes ?? null,
    educational_institution_id: values.educationalInstitutionId || null,
    course: values.course ?? null,
    study_start_date: values.studyStartDate ?? null,
    study_end_date: values.studyEndDate ?? null,
    moratorium: values.moratorium,
    moratorium_end_date: values.moratoriumEndDate ?? null,
    interest_subsidy: values.interestSubsidy,
    interest_subsidy_notes: values.interestSubsidyNotes ?? null,
  };
}

export async function createLoanAction(
  householdId: string,
  input: LoanInput,
): Promise<ActionResult<LoanRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: loanInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("loans")
        .insert(toLoanFieldsPayload(householdId, values))
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "loan.created",
      entityType: "loan",
      entityId: output.id,
    }),
    revalidatePaths: [...LOANS_REVALIDATE_PATHS],
  });
}

export async function updateLoanAction(
  householdId: string,
  loanId: string,
  input: LoanUpdateInput,
): Promise<ActionResult<LoanRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: loanUpdateSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("loans")
        .update(toLoanFieldsPayload(householdId, values))
        .eq("id", loanId)
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
      eventType: "loan.updated",
      entityType: "loan",
      entityId: output.id,
    }),
    revalidatePaths: [...LOANS_REVALIDATE_PATHS, `/app/debts/${loanId}`],
  });
}

export async function deleteLoanAction(
  householdId: string,
  loanId: string,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: setLoanStatusSchema.pick({ loanId: true }),
    input: { loanId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("loans")
        .delete()
        .eq("id", values.loanId)
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
      eventType: "loan.deleted",
      entityType: "loan",
      entityId: values.loanId,
    }),
    revalidatePaths: [...LOANS_REVALIDATE_PATHS],
  });
}

export async function setLoanStatusAction(
  householdId: string,
  input: SetLoanStatusInput,
): Promise<ActionResult<LoanRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setLoanStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("loans")
        .update({ status: values.status })
        .eq("id", values.loanId)
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
      eventType: `loan.${values.status}`,
      entityType: "loan",
      entityId: output.id,
    }),
    revalidatePaths: [...LOANS_REVALIDATE_PATHS, `/app/debts/${input.loanId}`],
  });
}

/**
 * Records the loan's one-time disbursement — always `kind =
 * loan_disbursement` (see record_loan_disbursement), never `income`
 * (PROMPT 21 acceptance criterion "loan disbursement is not ordinary
 * income" — enforced by construction: no other write path can produce a
 * loan_disbursement row).
 */
export async function recordLoanDisbursementAction(
  householdId: string,
  input: RecordLoanDisbursementInput,
): Promise<ActionResult<LoanRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordLoanDisbursementSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const loan = await fetchLoan(supabase, householdId, values.loanId);
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        loan.currency_code,
      );

      const response = await supabase.rpc("record_loan_disbursement", {
        p_household_id: householdId,
        p_loan_id: values.loanId,
        p_disbursement_date: values.disbursementDate,
        p_amount_minor_units: amountMinorUnits,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "loan.disbursed",
      entityType: "loan",
      entityId: output.id,
      metadata: { amountMinorUnits: output.disbursed_amount_minor_units },
    }),
    revalidatePaths: [
      ...LOANS_REVALIDATE_PATHS,
      `/app/debts/${input.loanId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

/**
 * recordLoanPaymentAction returns one of these instead of the bare
 * payment: an `overpayment_warning` means nothing was written yet — the
 * caller must resubmit with `confirmOverpayment: true` to proceed. Same
 * "warning, never a silent block or a silent negative balance" shape as
 * recordIncomeAction's duplicate_warning (PROMPT 21 acceptance criterion
 * "outstanding principal cannot become negative without explicit
 * overpayment handling").
 */
export type RecordLoanPaymentOutcome =
  | { kind: "recorded"; payment: LoanPaymentRecord }
  | {
      kind: "overpayment_warning";
      outstandingMinorUnits: number;
      overpaymentAmountMinorUnits: number;
    };

export async function recordLoanPaymentAction(
  householdId: string,
  input: RecordLoanPaymentInput,
): Promise<ActionResult<RecordLoanPaymentOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordLoanPaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const loan = await fetchLoan(supabase, householdId, values.loanId);
      const effectivePayments = await fetchEffectivePayments(
        supabase,
        householdId,
        values.loanId,
      );
      const outstanding = computeLoanOutstanding(
        loan.disbursed_amount_minor_units,
        effectivePayments.map((payment) => ({
          principalComponentMinorUnits: payment.principal_component_minor_units,
          overpaymentAmountMinorUnits: payment.overpayment_amount_minor_units,
        })),
      );

      const principalMinorUnits = parseDecimalToMinorUnits(
        values.principalComponent,
        loan.currency_code,
      );
      const interestMinorUnits = parseDecimalToMinorUnits(
        values.interestComponent,
        loan.currency_code,
      );
      const feeMinorUnits = parseDecimalToMinorUnits(
        values.feeComponent,
        loan.currency_code,
      );
      const penaltyMinorUnits = parseDecimalToMinorUnits(
        values.penaltyComponent,
        loan.currency_code,
      );

      if (
        principalMinorUnits +
          interestMinorUnits +
          feeMinorUnits +
          penaltyMinorUnits <=
        0
      ) {
        throw new ValidationError(
          "Enter at least one non-zero payment component.",
        );
      }

      const overpaymentAmountMinorUnits = computeOverpaymentAmount(
        outstanding.outstandingMinorUnits,
        principalMinorUnits,
      );
      if (overpaymentAmountMinorUnits > 0 && !values.confirmOverpayment) {
        return {
          kind: "overpayment_warning",
          outstandingMinorUnits: outstanding.outstandingMinorUnits,
          overpaymentAmountMinorUnits,
        } satisfies RecordLoanPaymentOutcome;
      }

      const response = await supabase.rpc("record_loan_payment", {
        p_household_id: householdId,
        p_loan_id: values.loanId,
        p_payment_date: values.paymentDate,
        p_principal_component_minor_units: principalMinorUnits,
        p_interest_component_minor_units: interestMinorUnits,
        p_fee_component_minor_units: feeMinorUnits,
        p_penalty_component_minor_units: penaltyMinorUnits,
        p_overpayment_amount_minor_units: overpaymentAmountMinorUnits,
        p_notes: values.notes ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return {
        kind: "recorded",
        payment: response.data,
      } satisfies RecordLoanPaymentOutcome;
    },
    activityEvent: ({ input: values, output }) =>
      output.kind === "recorded"
        ? {
            householdId,
            eventType: "loan_payment.recorded",
            entityType: "loan",
            entityId: values.loanId,
            metadata: {
              paymentId: output.payment.id,
              totalPaymentMinorUnits: output.payment.total_payment_minor_units,
            },
          }
        : null,
    revalidatePaths: [
      ...LOANS_REVALIDATE_PATHS,
      `/app/debts/${input.loanId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

/**
 * Reverses a mis-entered payment *record* — a new loan_payments row
 * mirroring the original's components so selectEffectivePayments nets
 * both to zero, never an update/delete of the append-only original. This
 * does not itself move money back or touch the original's linked
 * transaction — if the underlying cash movement also needs correcting,
 * that's a separate edit/cancel from the Transactions feature.
 */
export async function reverseLoanPaymentAction(
  householdId: string,
  input: ReverseLoanPaymentInput,
): Promise<ActionResult<LoanPaymentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reverseLoanPaymentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const originalResponse = await supabase
        .from("loan_payments")
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
        .from("loan_payments")
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
        .from("loan_payments")
        .insert({
          household_id: householdId,
          loan_id: original.loan_id,
          payment_date: original.payment_date,
          principal_component_minor_units:
            original.principal_component_minor_units,
          interest_component_minor_units:
            original.interest_component_minor_units,
          fee_component_minor_units: original.fee_component_minor_units,
          penalty_component_minor_units: original.penalty_component_minor_units,
          total_payment_minor_units: original.total_payment_minor_units,
          overpayment_amount_minor_units:
            original.overpayment_amount_minor_units,
          currency_code: original.currency_code,
          reverses_payment_id: original.id,
          reversal_reason: values.reversalReason,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }

      // A loan is only genuinely "closed" at zero outstanding — reversing
      // the payment that caused an auto-close (see record_loan_payment)
      // can put outstanding back above zero, so the status must follow.
      // Never touches a manually-set 'defaulted'/'settled' status.
      const loan = await fetchLoan(supabase, householdId, original.loan_id);
      if (loan.status === "closed") {
        const effectivePayments = await fetchEffectivePayments(
          supabase,
          householdId,
          original.loan_id,
        );
        const outstanding = computeLoanOutstanding(
          loan.disbursed_amount_minor_units,
          effectivePayments.map((payment) => ({
            principalComponentMinorUnits:
              payment.principal_component_minor_units,
            overpaymentAmountMinorUnits: payment.overpayment_amount_minor_units,
          })),
        );
        if (outstanding.outstandingMinorUnits > 0) {
          await supabase
            .from("loans")
            .update({ status: "active" })
            .eq("id", original.loan_id)
            .eq("household_id", householdId);
        }
      }

      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "loan_payment.reversed",
      entityType: "loan",
      entityId: output.loan_id,
      metadata: { paymentId: values.paymentId, reversalId: output.id },
    }),
    revalidatePaths: [...LOANS_REVALIDATE_PATHS],
  });
}
