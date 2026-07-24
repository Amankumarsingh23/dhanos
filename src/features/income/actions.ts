"use server";

import { z } from "zod";
import { NotFoundError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  incomeSourceInputSchema,
  incomeSourceUpdateSchema,
  recordIncomeSchema,
  type IncomeSourceInput,
  type IncomeSourceUpdateInput,
  type RecordIncomeInput,
} from "@/lib/validation/income-sources";
import { findNearbyIncomeReceipts } from "./queries";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Income feature — see docs/data-access-patterns.md
 * for the 8-step mutation process every one of these implements via
 * runHouseholdMutation.
 */

export type IncomeSourceRecord = Tables<"income_sources">;
export type IncomeTransactionRecord = Tables<"transactions">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const ARCHIVE_ROLES = ["owner", "admin"] as const;

export async function createIncomeSourceAction(
  householdId: string,
  input: IncomeSourceInput,
): Promise<ActionResult<IncomeSourceRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: incomeSourceInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const expectedAmountMinorUnits =
        values.expectedAmount && values.expectedAmount.trim() !== ""
          ? parseDecimalToMinorUnits(values.expectedAmount, values.currencyCode)
          : null;

      const response = await supabase
        .from("income_sources")
        .insert({
          household_id: householdId,
          name: values.name,
          source_type: values.sourceType,
          institution_id: values.institutionId ?? null,
          person_id: values.personId ?? null,
          expected_amount_minor_units: expectedAmountMinorUnits,
          currency_code: values.currencyCode,
          frequency: values.frequency,
          expected_day_of_month: values.expectedDayOfMonth ?? null,
          expected_payment_date_rule: values.expectedPaymentDateRule ?? null,
          receiving_account_id: values.receivingAccountId,
          category_id: values.categoryId ?? null,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          tax_withholding_expected: values.taxWithholdingExpected,
          tax_withholding_notes: values.taxWithholdingNotes ?? null,
          is_active: values.isActive,
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
      eventType: "income_source.created",
      entityType: "income_source",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/income"],
  });
}

const updateIncomeSourceSchema = incomeSourceUpdateSchema.and(
  z.object({ incomeSourceId: uuidSchema }),
);

export async function updateIncomeSourceAction(
  householdId: string,
  incomeSourceId: string,
  input: IncomeSourceUpdateInput,
): Promise<ActionResult<IncomeSourceRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateIncomeSourceSchema,
    input: { ...input, incomeSourceId },
    run: async ({ supabase, input: values }) => {
      const expectedAmountMinorUnits =
        values.expectedAmount && values.expectedAmount.trim() !== ""
          ? parseDecimalToMinorUnits(values.expectedAmount, values.currencyCode)
          : null;

      const response = await supabase
        .from("income_sources")
        .update({
          name: values.name,
          source_type: values.sourceType,
          institution_id: values.institutionId ?? null,
          person_id: values.personId ?? null,
          expected_amount_minor_units: expectedAmountMinorUnits,
          currency_code: values.currencyCode,
          frequency: values.frequency,
          expected_day_of_month: values.expectedDayOfMonth ?? null,
          expected_payment_date_rule: values.expectedPaymentDateRule ?? null,
          receiving_account_id: values.receivingAccountId,
          category_id: values.categoryId ?? null,
          start_date: values.startDate,
          end_date: values.endDate ?? null,
          tax_withholding_expected: values.taxWithholdingExpected,
          tax_withholding_notes: values.taxWithholdingNotes ?? null,
          is_active: values.isActive,
          notes: values.notes ?? null,
        })
        .eq("id", values.incomeSourceId)
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
      eventType: "income_source.updated",
      entityType: "income_source",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/income", `/app/income/${incomeSourceId}`],
  });
}

const incomeSourceIdSchema = z.object({ incomeSourceId: uuidSchema });

async function setIncomeSourceActiveState(
  householdId: string,
  incomeSourceId: string,
  isActive: boolean,
): Promise<ActionResult<IncomeSourceRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...ARCHIVE_ROLES],
    schema: incomeSourceIdSchema,
    input: { incomeSourceId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("income_sources")
        .update({ is_active: isActive })
        .eq("id", values.incomeSourceId)
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
      eventType: isActive ? "income_source.restored" : "income_source.archived",
      entityType: "income_source",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/income", `/app/income/${incomeSourceId}`],
  });
}

/** Deactivating, not deleting — past receipts keep referencing this source's history. */
export async function archiveIncomeSourceAction(
  householdId: string,
  incomeSourceId: string,
): Promise<ActionResult<IncomeSourceRecord>> {
  return setIncomeSourceActiveState(householdId, incomeSourceId, false);
}

export async function restoreIncomeSourceAction(
  householdId: string,
  incomeSourceId: string,
): Promise<ActionResult<IncomeSourceRecord>> {
  return setIncomeSourceActiveState(householdId, incomeSourceId, true);
}

/**
 * record/updateIncomeAction return one of these instead of the bare
 * transaction: a `duplicate_warning` means nothing was written — the
 * caller must resubmit with `confirmDuplicate: true` to proceed anyway.
 * This is a warning, never an automatic block or silent merge — see
 * PROMPT 11 acceptance criterion "Duplicate recurring receipts can be
 * detected or warned about."
 */
export type RecordIncomeOutcome =
  | { kind: "recorded"; transaction: IncomeTransactionRecord }
  | { kind: "duplicate_warning"; nearbyReceipts: IncomeTransactionRecord[] };

/**
 * Records an actual receipt against a declared income source — always a
 * new `kind = 'income'` transaction linked via `income_source_id`.
 * Setting up a source (createIncomeSourceAction) never itself creates a
 * transaction; this is the only path that does (PROMPT 11 acceptance
 * criterion "Source setup does not itself create income" / "Actual
 * receipt creates a transaction").
 */
export async function recordIncomeAction(
  householdId: string,
  input: RecordIncomeInput,
): Promise<ActionResult<RecordIncomeOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordIncomeSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const sourceResponse = await supabase
        .from("income_sources")
        .select("*")
        .eq("id", values.incomeSourceId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (sourceResponse.error) {
        throw mapSupabaseError(sourceResponse.error);
      }
      const source = sourceResponse.data;
      if (!source) {
        throw new NotFoundError();
      }

      if (!values.confirmDuplicate) {
        const nearby = await findNearbyIncomeReceipts(
          supabase,
          householdId,
          source.id,
          values.transactionDate,
        );
        if (nearby.length > 0) {
          return { kind: "duplicate_warning", nearbyReceipts: nearby };
        }
      }

      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        source.currency_code,
      );

      const response = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          kind: "income",
          amount_minor_units: amountMinorUnits,
          currency_code: source.currency_code,
          transaction_date: values.transactionDate,
          account_id: values.accountId ?? source.receiving_account_id,
          category_id: values.categoryId ?? source.category_id,
          description: values.description ?? source.name,
          status: values.status,
          source_type: "manual",
          income_source_id: source.id,
          related_person_id: source.person_id,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return { kind: "recorded", transaction: response.data };
    },
    activityEvent: ({ input: values, output }) =>
      output.kind === "recorded"
        ? {
            householdId,
            eventType: "income.recorded",
            entityType: "transaction",
            entityId: output.transaction.id,
            metadata: { incomeSourceId: values.incomeSourceId },
          }
        : null,
    revalidatePaths: [
      "/app/income",
      `/app/income/${input.incomeSourceId}`,
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}
