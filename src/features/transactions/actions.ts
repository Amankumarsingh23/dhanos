"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import {
  runHouseholdMutation,
  actionError,
  actionOk,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { reportActionError } from "@/lib/observability/report-action-error";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  refundInputSchema,
  transactionInputSchema,
  transactionUpdateSchema,
  type RefundInput,
  type TransactionInput,
  type TransactionUpdateInput,
} from "@/lib/validation/transactions";
import {
  getRefundedAmount,
  listTransactionSplits,
  type TransactionSplitRecord,
} from "./queries";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Transactions feature — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Creates/updates that
 * include splits go through the create_transaction_with_splits /
 * update_transaction_with_splits Postgres RPCs (see
 * supabase/migrations/20260721090000_transaction_engine.sql) rather than a
 * plain insert/update, so the transaction row and its splits are written
 * atomically — PostgREST cannot span a client-visible transaction across
 * two separate REST calls (docs/data-access-patterns.md step 5).
 */

export type TransactionRecord = Tables<"transactions">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;

/**
 * Converts validated split inputs to minor units and checks they sum to
 * the transaction total *before* hitting the database — the deferred
 * constraint trigger on transaction_splits is the authoritative
 * enforcement (see PROMPT 10 acceptance criterion "Split transaction
 * totals are enforced"), but failing fast here gives a clear message
 * instead of a raw Postgres constraint error surfacing to the user.
 */
function buildSplitsPayload(
  splits: TransactionInput["splits"],
  totalAmountMinorUnits: number,
  currencyCode: string,
):
  | { category_id: string; amount_minor_units: number; notes: string | null }[]
  | null {
  if (!splits || splits.length === 0) {
    return splits ? [] : null;
  }

  const payload = splits.map((split) => ({
    category_id: split.categoryId,
    amount_minor_units: parseDecimalToMinorUnits(split.amount, currencyCode),
    notes: split.notes ?? null,
  }));

  const sum = payload.reduce(
    (total, split) => total + split.amount_minor_units,
    0,
  );
  if (sum !== totalAmountMinorUnits) {
    throw new ValidationError(
      "Split amounts must add up to exactly the transaction's total amount.",
    );
  }

  return payload;
}

export async function createTransactionAction(
  householdId: string,
  input: TransactionInput,
): Promise<ActionResult<TransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: transactionInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        values.currencyCode,
      );
      const splitsPayload = buildSplitsPayload(
        values.splits,
        amountMinorUnits,
        values.currencyCode,
      );

      const response = await supabase.rpc("create_transaction_with_splits", {
        p_household_id: householdId,
        p_kind: values.kind,
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_transfer_account_id: values.transferAccountId ?? undefined,
        p_category_id: values.categoryId ?? undefined,
        p_counterparty: values.counterparty ?? undefined,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: values.sourceType,
        p_related_person_id: values.relatedPersonId ?? undefined,
        p_splits: splitsPayload ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "transaction.created",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      "/app/cash-flow",
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
      ...(input.transferAccountId
        ? [`/app/accounts/${input.transferAccountId}`]
        : []),
    ],
  });
}

const updateTransactionSchema = transactionUpdateSchema.and(
  z.object({ transactionId: uuidSchema }),
);

export async function updateTransactionAction(
  householdId: string,
  transactionId: string,
  input: TransactionUpdateInput,
): Promise<ActionResult<TransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateTransactionSchema,
    input: { ...input, transactionId },
    run: async ({ supabase, input: values }) => {
      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        values.currencyCode,
      );
      const splitsPayload = buildSplitsPayload(
        values.splits,
        amountMinorUnits,
        values.currencyCode,
      );

      const response = await supabase.rpc("update_transaction_with_splits", {
        p_household_id: householdId,
        p_transaction_id: values.transactionId,
        p_kind: values.kind,
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_transfer_account_id: values.transferAccountId ?? undefined,
        p_category_id: values.categoryId ?? undefined,
        p_counterparty: values.counterparty ?? undefined,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: values.sourceType,
        p_related_person_id: values.relatedPersonId ?? undefined,
        p_splits: splitsPayload ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "transaction.updated",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      "/app/cash-flow",
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
      ...(input.transferAccountId
        ? [`/app/accounts/${input.transferAccountId}`]
        : []),
    ],
  });
}

const transactionIdSchema = z.object({ transactionId: uuidSchema });

async function setTransactionStatus(
  householdId: string,
  transactionId: string,
  status: "cancelled" | "cleared",
  eventType: string,
): Promise<ActionResult<TransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: transactionIdSchema,
    input: { transactionId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("transactions")
        .update({ status })
        .eq("id", values.transactionId)
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
      eventType,
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/cash-flow", "/app/accounts"],
  });
}

/** "Archiving" a transaction moves it to status = 'cancelled' — never a delete, and never dropped from the ledger's history. */
export async function archiveTransactionAction(
  householdId: string,
  transactionId: string,
): Promise<ActionResult<TransactionRecord>> {
  return setTransactionStatus(
    householdId,
    transactionId,
    "cancelled",
    "transaction.archived",
  );
}

/** Restores a cancelled transaction to 'cleared' — the original prior status isn't preserved, so this is a fresh clearing, not an undo. */
export async function restoreTransactionAction(
  householdId: string,
  transactionId: string,
): Promise<ActionResult<TransactionRecord>> {
  return setTransactionStatus(
    householdId,
    transactionId,
    "cleared",
    "transaction.restored",
  );
}

/**
 * Records a refund against an expense transaction — always a new
 * kind = 'refund' row referencing the original via
 * reverses_transaction_id, never an edit of the original expense's amount
 * (see PROMPT 10 acceptance criterion "Refund handling is traceable").
 * Caps the refund at the original expense's amount minus whatever has
 * already been refunded against it.
 */
export async function recordRefundAction(
  householdId: string,
  input: RefundInput,
): Promise<ActionResult<TransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: refundInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const originalResponse = await supabase
        .from("transactions")
        .select("*")
        .eq("id", values.originalTransactionId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (originalResponse.error) {
        throw mapSupabaseError(originalResponse.error);
      }
      const original = originalResponse.data;
      if (!original) {
        throw new NotFoundError();
      }
      if (original.kind !== "expense") {
        throw new ValidationError(
          "Only an expense transaction can be refunded.",
        );
      }

      const alreadyRefunded = await getRefundedAmount(
        supabase,
        householdId,
        original.id,
      );
      const remaining = original.amount_minor_units - alreadyRefunded;
      const refundAmountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        original.currency_code,
      );
      if (refundAmountMinorUnits <= 0) {
        throw new ValidationError("Enter a refund amount greater than zero.");
      }
      if (refundAmountMinorUnits > remaining) {
        throw new ValidationError(
          `Refund cannot exceed the remaining refundable amount for this expense.`,
        );
      }

      const response = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          kind: "refund",
          amount_minor_units: refundAmountMinorUnits,
          currency_code: original.currency_code,
          transaction_date: values.transactionDate,
          account_id: original.account_id,
          category_id: original.category_id,
          description:
            values.description ??
            `Refund of ${original.description ?? original.counterparty ?? "expense"}`,
          status: "cleared",
          source_type: "manual",
          reverses_transaction_id: original.id,
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
      eventType: "transaction.refunded",
      entityType: "transaction",
      entityId: output.id,
      metadata: { reversesTransactionId: output.reverses_transaction_id },
    }),
    revalidatePaths: ["/app/cash-flow", "/app/accounts"],
  });
}

const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;

/**
 * Read-only fetch of a transaction's splits, for the edit dialog to
 * prefill (see transactions-manager.tsx's handleEdit) — a plain Server
 * Action rather than a mutation, since nothing is written here, but still
 * goes through requireHouseholdRole so a household_id can't be used to
 * read another household's split rows.
 */
export async function getTransactionSplitsAction(
  householdId: string,
  transactionId: string,
): Promise<ActionResult<TransactionSplitRecord[]>> {
  const parsed = uuidSchema.safeParse(transactionId);
  if (!parsed.success) {
    return actionError("Invalid transaction id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const splits = await listTransactionSplits(
      supabase,
      householdId,
      parsed.data,
    );
    return actionOk(splits);
  } catch (error) {
    return actionError(
      reportActionError(error, "transactions.get_splits", {
        householdId,
        transactionId: parsed.data,
      }),
    );
  }
}
