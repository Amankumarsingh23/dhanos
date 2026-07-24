"use server";

import { z } from "zod";
import { addDays, addMonths, addWeeks } from "date-fns";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { toIsoDateString } from "@/lib/dates";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { toUserMessage } from "@/lib/errors/app-error";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  attachExpenseReceiptSchema,
  expenseInputSchema,
  expenseUpdateSchema,
  type AttachExpenseReceiptInput,
  type ExpenseInput,
  type ExpenseRecurringFrequency,
  type ExpenseUpdateInput,
} from "@/lib/validation/expenses";
import { createSignedDownloadUrl } from "@/lib/storage";
import type {
  ExpenseAttachmentRecord,
  ExpenseTransactionRecord,
} from "./queries";

/**
 * Server Actions for the Expense feature (PROMPT 12) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Expenses are transactions
 * rows with kind = 'expense'; create/update go through the same
 * create_transaction_with_splits / update_transaction_with_splits RPCs the
 * Transactions feature uses (see supabase/migrations/20260721120000_expense_management.sql
 * for the p_is_planned addition), so splits stay atomic with the parent row.
 *
 * Archiving/restoring, refunding, and reading an expense's splits are the
 * same operation regardless of which feature's UI triggered them — the
 * Expense UI imports archiveTransactionAction/restoreTransactionAction/
 * recordRefundAction/getTransactionSplitsAction directly from
 * src/features/transactions/actions.ts rather than duplicating them here.
 * (A "use server" file can only export its own async functions — Next.js
 * doesn't support re-exporting another module's Server Actions through
 * one, so those are imported at each call site instead of funneled
 * through this file.)
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;

const EXPENSE_REVALIDATE_PATHS = ["/app/expenses", "/app/cash-flow"];

function buildSplitsPayload(
  splits: ExpenseInput["splits"],
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
      "Split amounts must add up to exactly the expense's total amount.",
    );
  }

  return payload;
}

/** Advances `startDate` by one cadence of `frequency` × `intervalCount` — the new recurring_rules row's initial next_due_date. Not a full generation schedule (see recurring_rules — no generation job exists yet), just a sane first estimate. */
function computeNextDueDate(
  startDate: string,
  frequency: ExpenseRecurringFrequency,
  intervalCount: number,
): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  switch (frequency) {
    case "daily":
      return toIsoDateString(addDays(start, intervalCount));
    case "weekly":
      return toIsoDateString(addWeeks(start, intervalCount));
    case "biweekly":
      return toIsoDateString(addWeeks(start, intervalCount * 2));
    case "monthly":
      return toIsoDateString(addMonths(start, intervalCount));
    case "quarterly":
      return toIsoDateString(addMonths(start, intervalCount * 3));
    case "half_yearly":
      return toIsoDateString(addMonths(start, intervalCount * 6));
    case "yearly":
      return toIsoDateString(addMonths(start, intervalCount * 12));
  }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Creates a minimal recurring_rules row backing a "Recurring" expense — see PROMPT 12's "one-time or recurring" required field. */
async function createRecurringRuleForExpense(
  supabase: SupabaseServerClient,
  householdId: string,
  values: {
    amountMinorUnits: number;
    currencyCode: string;
    accountId: string;
    categoryId: string | null;
    counterparty: string | null;
    transactionDate: string;
    recurringFrequency: ExpenseRecurringFrequency;
    recurringIntervalCount: number;
  },
): Promise<string> {
  const name = `Recurring: ${values.counterparty?.trim() || "Expense"}`;
  const response = await supabase
    .from("recurring_rules")
    .insert({
      household_id: householdId,
      name,
      kind: "expense",
      amount_minor_units: values.amountMinorUnits,
      currency_code: values.currencyCode,
      account_id: values.accountId,
      category_id: values.categoryId,
      counterparty: values.counterparty ?? null,
      frequency: values.recurringFrequency,
      interval_count: values.recurringIntervalCount,
      start_date: values.transactionDate,
      next_due_date: computeNextDueDate(
        values.transactionDate,
        values.recurringFrequency,
        values.recurringIntervalCount,
      ),
      status: "active",
    })
    .select("id")
    .single();
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  return response.data.id;
}

/** Ends a detached recurring rule — courtesy cleanup, not a delete (past occurrences still reference it). See PROMPT 14's status lifecycle (src/features/recurring). */
async function deactivateRecurringRule(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleId: string,
): Promise<void> {
  await supabase
    .from("recurring_rules")
    .update({ status: "ended" })
    .eq("id", recurringRuleId)
    .eq("household_id", householdId);
}

export async function createExpenseAction(
  householdId: string,
  input: ExpenseInput,
): Promise<ActionResult<ExpenseTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: expenseInputSchema,
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

      let recurringRuleId: string | undefined;
      if (values.isRecurring) {
        recurringRuleId = await createRecurringRuleForExpense(
          supabase,
          householdId,
          {
            amountMinorUnits,
            currencyCode: values.currencyCode,
            accountId: values.accountId,
            categoryId: values.categoryId ?? null,
            counterparty: values.counterparty ?? null,
            transactionDate: values.transactionDate,
            recurringFrequency: values.recurringFrequency!,
            recurringIntervalCount: values.recurringIntervalCount ?? 1,
          },
        );
      }

      const response = await supabase.rpc("create_transaction_with_splits", {
        p_household_id: householdId,
        p_kind: "expense",
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_category_id: values.categoryId ?? undefined,
        p_counterparty: values.counterparty ?? undefined,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: "manual",
        p_recurring_rule_id: recurringRuleId,
        p_related_person_id: values.relatedPersonId ?? undefined,
        p_splits: splitsPayload ?? undefined,
        p_is_planned: values.isPlanned,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "expense.created",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...EXPENSE_REVALIDATE_PATHS,
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
    ],
  });
}

const updateExpenseSchema = expenseUpdateSchema.and(
  z.object({ transactionId: uuidSchema }),
);

export async function updateExpenseAction(
  householdId: string,
  transactionId: string,
  input: ExpenseUpdateInput,
): Promise<ActionResult<ExpenseTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateExpenseSchema,
    input: { ...input, transactionId },
    run: async ({ supabase, input: values }) => {
      const existingResponse = await supabase
        .from("transactions")
        .select("recurring_rule_id")
        .eq("id", values.transactionId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (existingResponse.error) {
        throw mapSupabaseError(existingResponse.error);
      }
      if (!existingResponse.data) {
        throw new NotFoundError();
      }
      const existingRecurringRuleId = existingResponse.data.recurring_rule_id;

      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        values.currencyCode,
      );
      const splitsPayload = buildSplitsPayload(
        values.splits,
        amountMinorUnits,
        values.currencyCode,
      );

      let recurringRuleId: string | null = existingRecurringRuleId;
      if (values.isRecurring && !existingRecurringRuleId) {
        recurringRuleId = await createRecurringRuleForExpense(
          supabase,
          householdId,
          {
            amountMinorUnits,
            currencyCode: values.currencyCode,
            accountId: values.accountId,
            categoryId: values.categoryId ?? null,
            counterparty: values.counterparty ?? null,
            transactionDate: values.transactionDate,
            recurringFrequency: values.recurringFrequency!,
            recurringIntervalCount: values.recurringIntervalCount ?? 1,
          },
        );
      } else if (!values.isRecurring && existingRecurringRuleId) {
        await deactivateRecurringRule(
          supabase,
          householdId,
          existingRecurringRuleId,
        );
        recurringRuleId = null;
      }

      const response = await supabase.rpc("update_transaction_with_splits", {
        p_household_id: householdId,
        p_transaction_id: values.transactionId,
        p_kind: "expense",
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_category_id: values.categoryId ?? undefined,
        p_counterparty: values.counterparty ?? undefined,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: "manual",
        p_recurring_rule_id: recurringRuleId ?? undefined,
        p_related_person_id: values.relatedPersonId ?? undefined,
        p_splits: splitsPayload ?? undefined,
        p_is_planned: values.isPlanned,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "expense.updated",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...EXPENSE_REVALIDATE_PATHS,
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
    ],
  });
}

/**
 * Attaches an already-uploaded Storage object (see src/lib/storage and the
 * 'documents' bucket policies in supabase/migrations/20260721120000_expense_management.sql)
 * to an expense as a receipt. The browser uploads the file bytes directly
 * (Server Actions aren't the right place for large binary payloads); this
 * only records the resulting path.
 */
export async function attachExpenseReceiptAction(
  householdId: string,
  input: AttachExpenseReceiptInput,
): Promise<ActionResult<ExpenseAttachmentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: attachExpenseReceiptSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const txResponse = await supabase
        .from("transactions")
        .select("id, kind")
        .eq("id", values.transactionId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (txResponse.error) {
        throw mapSupabaseError(txResponse.error);
      }
      if (!txResponse.data || txResponse.data.kind !== "expense") {
        throw new NotFoundError("Expense not found.");
      }

      const response = await supabase
        .from("attachments")
        .insert({
          household_id: householdId,
          attachable_type: "transaction",
          attachable_id: values.transactionId,
          storage_bucket: "documents",
          storage_path: values.storagePath,
          file_name: values.fileName,
          mime_type: values.mimeType ?? null,
          size_bytes: values.sizeBytes ?? null,
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
      eventType: "expense.receipt_attached",
      entityType: "transaction",
      entityId: values.transactionId,
      metadata: { attachmentId: output.id },
    }),
    revalidatePaths: [...EXPENSE_REVALIDATE_PATHS],
  });
}

const attachmentIdSchema = z.object({ attachmentId: uuidSchema });

export async function removeExpenseReceiptAction(
  householdId: string,
  attachmentId: string,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: attachmentIdSchema,
    input: { attachmentId },
    run: async ({ supabase, input: values }) => {
      const attachmentResponse = await supabase
        .from("attachments")
        .select("storage_bucket, storage_path")
        .eq("id", values.attachmentId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (attachmentResponse.error) {
        throw mapSupabaseError(attachmentResponse.error);
      }
      if (!attachmentResponse.data) {
        throw new NotFoundError();
      }

      const deleteResponse = await supabase
        .from("attachments")
        .delete()
        .eq("id", values.attachmentId)
        .eq("household_id", householdId);
      if (deleteResponse.error) {
        throw mapSupabaseError(deleteResponse.error);
      }

      await supabase.storage
        .from(attachmentResponse.data.storage_bucket)
        .remove([attachmentResponse.data.storage_path]);

      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "expense.receipt_removed",
      entityType: "attachment",
      entityId: attachmentId,
    }),
    revalidatePaths: [...EXPENSE_REVALIDATE_PATHS],
  });
}

const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;

/** A short-lived signed URL to view/download one receipt — never a permanent public link (see docs/security-model.md §5). */
export async function getExpenseReceiptUrlAction(
  householdId: string,
  attachmentId: string,
): Promise<ActionResult<string>> {
  const parsed = uuidSchema.safeParse(attachmentId);
  if (!parsed.success) {
    return actionError("Invalid attachment id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const attachmentResponse = await supabase
      .from("attachments")
      .select("storage_bucket, storage_path")
      .eq("id", parsed.data)
      .eq("household_id", householdId)
      .maybeSingle();
    if (attachmentResponse.error) {
      throw mapSupabaseError(attachmentResponse.error);
    }
    if (!attachmentResponse.data) {
      throw new NotFoundError();
    }
    const url = await createSignedDownloadUrl(
      attachmentResponse.data.storage_bucket,
      attachmentResponse.data.storage_path,
      300,
    );
    return actionOk(url);
  } catch (error) {
    return actionError(toUserMessage(error));
  }
}
