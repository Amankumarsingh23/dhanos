"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  accountInputSchema,
  accountUpdateSchema,
  balanceCorrectionSchema,
  type AccountInput,
  type AccountUpdateInput,
  type BalanceCorrectionInput,
} from "@/lib/validation/accounts";
import { getCalculatedAccountBalance } from "./queries";
import type { Tables } from "@/types/database";

/**
 * Server Actions for the Accounts feature — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation.
 */

export type AccountRecord = Tables<"financial_accounts">;

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const CLOSE_ROLES = ["owner", "admin"] as const;

export async function createAccountAction(
  householdId: string,
  input: AccountInput,
): Promise<ActionResult<AccountRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: accountInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const openingBalanceMinorUnits = parseDecimalToMinorUnits(
        values.openingBalance,
        values.currencyCode,
      );

      const response = await supabase
        .from("financial_accounts")
        .insert({
          household_id: householdId,
          name: values.name,
          account_type: values.accountType,
          institution_id: values.institutionId ?? null,
          owner_person_id: values.ownerPersonId ?? null,
          masked_identifier: values.maskedIdentifier ?? null,
          currency_code: values.currencyCode,
          opening_balance_minor_units: openingBalanceMinorUnits,
          opened_date: values.openedDate ?? null,
          closed_date: values.closedDate ?? null,
          is_active: values.isActive,
          include_in_net_worth: values.includeInNetWorth,
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
      eventType: "account.created",
      entityType: "financial_account",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/accounts"],
  });
}

const updateAccountSchema = accountUpdateSchema.and(
  z.object({ accountId: uuidSchema }),
);

export async function updateAccountAction(
  householdId: string,
  accountId: string,
  input: AccountUpdateInput,
): Promise<ActionResult<AccountRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateAccountSchema,
    input: { ...input, accountId },
    run: async ({ supabase, input: values }) => {
      const openingBalanceMinorUnits = parseDecimalToMinorUnits(
        values.openingBalance,
        values.currencyCode,
      );

      const response = await supabase
        .from("financial_accounts")
        .update({
          name: values.name,
          account_type: values.accountType,
          institution_id: values.institutionId ?? null,
          owner_person_id: values.ownerPersonId ?? null,
          masked_identifier: values.maskedIdentifier ?? null,
          currency_code: values.currencyCode,
          opening_balance_minor_units: openingBalanceMinorUnits,
          opened_date: values.openedDate ?? null,
          closed_date: values.closedDate ?? null,
          is_active: values.isActive,
          include_in_net_worth: values.includeInNetWorth,
          notes: values.notes ?? null,
        })
        .eq("id", values.accountId)
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
      eventType: "account.updated",
      entityType: "financial_account",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/accounts", `/app/accounts/${accountId}`],
  });
}

const closeAccountSchema = z.object({
  accountId: uuidSchema,
  closedDate: z.string().trim().min(1, "Enter a closing date"),
});

/**
 * Closes an account (is_active = false, closed_date set) — never a delete.
 * History (transactions, snapshots) is preserved and the account remains
 * visible with "show closed" enabled, per PROMPT 9's acceptance criterion
 * "Closed accounts preserve history."
 */
export async function closeAccountAction(
  householdId: string,
  accountId: string,
  closedDate: string,
): Promise<ActionResult<AccountRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...CLOSE_ROLES],
    schema: closeAccountSchema,
    input: { accountId, closedDate },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("financial_accounts")
        .update({ is_active: false, closed_date: values.closedDate })
        .eq("id", values.accountId)
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
      eventType: "account.closed",
      entityType: "financial_account",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/accounts", `/app/accounts/${accountId}`],
  });
}

const reopenAccountSchema = z.object({ accountId: uuidSchema });

export async function reopenAccountAction(
  householdId: string,
  accountId: string,
): Promise<ActionResult<AccountRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...CLOSE_ROLES],
    schema: reopenAccountSchema,
    input: { accountId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("financial_accounts")
        .update({ is_active: true, closed_date: null })
        .eq("id", values.accountId)
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
      eventType: "account.reopened",
      entityType: "financial_account",
      entityId: output.id,
    }),
    revalidatePaths: ["/app/accounts", `/app/accounts/${accountId}`],
  });
}

export type BalanceCorrectionOutcome = {
  snapshotId: string;
  adjustmentTransactionId: string | null;
};

/**
 * Records a manual balance correction (see PROMPT 9, "Balance rules"): the
 * user confirms an account's true balance as of a date; this always writes
 * a new account_balance_snapshots row (append-only — never edits a past
 * one) and, when the confirmed figure differs from what the ledger
 * currently implies, an accompanying kind = 'adjustment' transaction
 * carrying the (possibly negative) difference. Both writes happen
 * atomically inside record_account_balance_correction (see
 * supabase/migrations/20260721080000_account_balance_correction.sql) —
 * never as two separate PostgREST calls, which could leave a snapshot
 * without its adjustment (or vice versa) if the second call failed.
 */
export async function recordBalanceCorrectionAction(
  householdId: string,
  input: BalanceCorrectionInput,
): Promise<ActionResult<BalanceCorrectionOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: balanceCorrectionSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const accountResponse = await supabase
        .from("financial_accounts")
        .select("currency_code")
        .eq("id", values.accountId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (accountResponse.error) {
        throw mapSupabaseError(accountResponse.error);
      }
      if (!accountResponse.data) {
        throw new NotFoundError();
      }
      const currencyCode = accountResponse.data.currency_code;

      const confirmedBalanceMinorUnits = parseDecimalToMinorUnits(
        values.confirmedBalance,
        currencyCode,
      );

      const priorBalance = await getCalculatedAccountBalance(
        supabase,
        householdId,
        values.accountId,
      );
      if (priorBalance.currencyCode !== currencyCode) {
        throw new ValidationError(
          "The account's currency changed unexpectedly — refresh and try again.",
        );
      }

      const rpcResponse = await supabase.rpc(
        "record_account_balance_correction",
        {
          p_household_id: householdId,
          p_account_id: values.accountId,
          p_as_of_date: values.asOfDate,
          p_confirmed_balance_minor_units: confirmedBalanceMinorUnits,
          p_prior_calculated_balance_minor_units: priorBalance.amountMinorUnits,
          p_notes: values.notes ?? undefined,
        },
      );
      if (rpcResponse.error) {
        throw mapSupabaseError(rpcResponse.error);
      }
      const result = rpcResponse.data?.[0];
      if (!result) {
        throw new NotFoundError();
      }
      return {
        snapshotId: result.snapshot_id,
        adjustmentTransactionId: result.adjustment_transaction_id,
      };
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "account.balance_corrected",
      entityType: "financial_account",
      entityId: values.accountId,
      metadata: {
        asOfDate: values.asOfDate,
        snapshotId: output.snapshotId,
        adjustmentTransactionId: output.adjustmentTransactionId,
      },
    }),
    revalidatePaths: ["/app/accounts", `/app/accounts/${input.accountId}`],
  });
}
