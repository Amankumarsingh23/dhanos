"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { parseDecimalToMinorUnits } from "@/lib/money";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import type { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/primitives";
import {
  reverseTransferSchema,
  transferInputSchema,
  transferUpdateSchema,
  type ReverseTransferInput,
  type TransferInput,
  type TransferUpdateInput,
} from "@/lib/validation/transfers";
import type { TransferTransactionRecord } from "./queries";

/**
 * Server Actions for the Transfers feature (PROMPT 13) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Transfers are transactions
 * rows with kind = 'transfer'; create/update go through the same
 * create_transaction_with_splits / update_transaction_with_splits RPCs
 * every other transaction-writing feature uses (transfers never have
 * splits, so p_splits is always omitted).
 *
 * Archiving/restoring a transfer is the same operation regardless of which
 * feature's UI triggered it — the Transfers UI imports
 * archiveTransactionAction/restoreTransactionAction directly from
 * src/features/transactions/actions.ts rather than duplicating them here.
 * (A "use server" file can only export its own async functions — Next.js
 * doesn't support re-exporting another module's Server Actions through
 * one — see the same note in src/features/expenses/actions.ts.)
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;

const TRANSFER_REVALIDATE_PATHS = ["/app/transfers", "/app/cash-flow"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type AccountCurrency = { id: string; currency_code: string };

/**
 * Looks up both accounts' actual currencies (never trusted from client
 * input for this money-critical branch) and determines whether the
 * transfer crosses currencies. Returns the parsed fee/destination-amount/
 * exchange-rate figures, enforcing PROMPT 13's rule: an explicit converted
 * amount and exchange rate are required whenever the currencies differ,
 * and left null (never invented) when they match.
 */
async function resolveTransferAmounts(
  supabase: SupabaseServerClient,
  householdId: string,
  values: {
    accountId: string;
    transferAccountId: string;
    amount: string;
    feeAmount?: string | null;
    destinationAmount?: string | null;
    exchangeRate?: string | null;
  },
): Promise<{
  amountMinorUnits: number;
  feeMinorUnits: number | null;
  destinationAmountMinorUnits: number | null;
  exchangeRate: number | null;
}> {
  const accountsResponse = await supabase
    .from("financial_accounts")
    .select("id, currency_code")
    .eq("household_id", householdId)
    .in("id", [values.accountId, values.transferAccountId]);
  if (accountsResponse.error) {
    throw mapSupabaseError(accountsResponse.error);
  }
  const accounts = accountsResponse.data as AccountCurrency[];
  const currencies = new Map(accounts.map((a) => [a.id, a.currency_code]));
  const sourceCurrency = currencies.get(values.accountId);
  const destinationCurrency = currencies.get(values.transferAccountId);
  if (!sourceCurrency || !destinationCurrency) {
    throw new NotFoundError("Account not found.");
  }

  const amountMinorUnits = parseDecimalToMinorUnits(
    values.amount,
    sourceCurrency,
  );

  const feeMinorUnits =
    values.feeAmount && values.feeAmount.trim() !== ""
      ? parseDecimalToMinorUnits(values.feeAmount, sourceCurrency)
      : null;

  const crossCurrency = sourceCurrency !== destinationCurrency;

  if (!crossCurrency) {
    return {
      amountMinorUnits,
      feeMinorUnits,
      destinationAmountMinorUnits: null,
      exchangeRate: null,
    };
  }

  const destinationAmountRaw = values.destinationAmount?.trim();
  const exchangeRateRaw = values.exchangeRate?.trim();
  if (!destinationAmountRaw || !exchangeRateRaw) {
    throw new ValidationError(
      "A transfer between different currencies needs an explicit converted amount and exchange rate — this app never looks one up for you.",
    );
  }

  const destinationAmountMinorUnits = parseDecimalToMinorUnits(
    destinationAmountRaw,
    destinationCurrency,
  );
  const exchangeRate = Number(exchangeRateRaw);
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new ValidationError("Enter a valid exchange rate greater than zero.");
  }

  return {
    amountMinorUnits,
    feeMinorUnits,
    destinationAmountMinorUnits,
    exchangeRate,
  };
}

export async function createTransferAction(
  householdId: string,
  input: TransferInput,
): Promise<ActionResult<TransferTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: transferInputSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const {
        amountMinorUnits,
        feeMinorUnits,
        destinationAmountMinorUnits,
        exchangeRate,
      } = await resolveTransferAmounts(supabase, householdId, values);

      const response = await supabase.rpc("create_transaction_with_splits", {
        p_household_id: householdId,
        p_kind: "transfer",
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_transfer_account_id: values.transferAccountId,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: "manual",
        p_transfer_fee_minor_units: feeMinorUnits ?? undefined,
        p_transfer_destination_amount_minor_units:
          destinationAmountMinorUnits ?? undefined,
        p_exchange_rate: exchangeRate ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "transfer.created",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...TRANSFER_REVALIDATE_PATHS,
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
      `/app/accounts/${input.transferAccountId}`,
    ],
  });
}

const updateTransferSchema = transferUpdateSchema.and(
  z.object({ transactionId: uuidSchema }),
);

export async function updateTransferAction(
  householdId: string,
  transactionId: string,
  input: TransferUpdateInput,
): Promise<ActionResult<TransferTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateTransferSchema,
    input: { ...input, transactionId },
    run: async ({ supabase, input: values }) => {
      const {
        amountMinorUnits,
        feeMinorUnits,
        destinationAmountMinorUnits,
        exchangeRate,
      } = await resolveTransferAmounts(supabase, householdId, values);

      const response = await supabase.rpc("update_transaction_with_splits", {
        p_household_id: householdId,
        p_transaction_id: values.transactionId,
        p_kind: "transfer",
        p_amount_minor_units: amountMinorUnits,
        p_currency_code: values.currencyCode,
        p_transaction_date: values.transactionDate,
        p_account_id: values.accountId,
        p_transfer_account_id: values.transferAccountId,
        p_description: values.description ?? undefined,
        p_status: values.status,
        p_source_type: "manual",
        p_transfer_fee_minor_units: feeMinorUnits ?? undefined,
        p_transfer_destination_amount_minor_units:
          destinationAmountMinorUnits ?? undefined,
        p_exchange_rate: exchangeRate ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "transfer.updated",
      entityType: "transaction",
      entityId: output.id,
    }),
    revalidatePaths: [
      ...TRANSFER_REVALIDATE_PATHS,
      "/app/accounts",
      `/app/accounts/${input.accountId}`,
      `/app/accounts/${input.transferAccountId}`,
    ],
  });
}

/**
 * Reverses a transfer: a new transaction with the source/destination
 * accounts swapped, linked back via reverses_transaction_id — never an
 * edit of the original (same never-rewrite-history principle as
 * recordRefundAction). Same-currency only: reversing a cross-currency
 * transfer would need its own fresh exchange rate for the reverse
 * direction, which this app never invents — the user creates that reverse
 * transfer manually instead, with an explicit rate. See PROMPT 13
 * acceptance criterion "Deleting or reversing a transfer affects both
 * sides."
 */
export async function reverseTransferAction(
  householdId: string,
  input: ReverseTransferInput,
): Promise<ActionResult<TransferTransactionRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reverseTransferSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const originalResponse = await supabase
        .from("transactions")
        .select("*")
        .eq("id", values.transactionId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (originalResponse.error) {
        throw mapSupabaseError(originalResponse.error);
      }
      const original = originalResponse.data;
      if (!original) {
        throw new NotFoundError();
      }
      if (original.kind !== "transfer") {
        throw new ValidationError("Only a transfer can be reversed.");
      }
      if (original.transfer_destination_amount_minor_units !== null) {
        throw new ValidationError(
          "This transfer crosses currencies — create the reverse transfer manually with a fresh, explicit exchange rate rather than reusing this one.",
        );
      }
      if (!original.transfer_account_id) {
        throw new ValidationError("This transfer has no destination account.");
      }

      const existingReversalResponse = await supabase
        .from("transactions")
        .select("id")
        .eq("household_id", householdId)
        .eq("kind", "transfer")
        .eq("reverses_transaction_id", original.id)
        .neq("status", "cancelled")
        .maybeSingle();
      if (existingReversalResponse.error) {
        throw mapSupabaseError(existingReversalResponse.error);
      }
      if (existingReversalResponse.data) {
        throw new ValidationError("This transfer has already been reversed.");
      }

      const response = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          kind: "transfer",
          amount_minor_units: original.amount_minor_units,
          currency_code: original.currency_code,
          transaction_date: values.transactionDate,
          account_id: original.transfer_account_id,
          transfer_account_id: original.account_id,
          description:
            values.description ??
            `Reversal of transfer on ${original.transaction_date}`,
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
      eventType: "transfer.reversed",
      entityType: "transaction",
      entityId: output.id,
      metadata: { reversesTransactionId: output.reverses_transaction_id },
    }),
    revalidatePaths: [...TRANSFER_REVALIDATE_PATHS, "/app/accounts"],
  });
}
