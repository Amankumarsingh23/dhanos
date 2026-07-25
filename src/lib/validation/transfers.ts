import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import {
  transactionStatusSchema,
  type TransactionStatus,
} from "@/lib/validation/transactions";

/**
 * Shared zod schemas for the Transfers feature (src/features/transfers) —
 * see supabase/migrations/20260721130000_transfers_reconciliation.sql for
 * the matching column definitions/check constraints this schema must stay
 * in sync with. A transfer is a transaction row with kind = 'transfer';
 * this module adds only what's specific to the transfer-focused
 * create/edit form — general transaction shapes live in
 * src/lib/validation/transactions.ts.
 *
 * The cross-currency requirement ("where currencies differ, require an
 * explicit converted amount and exchange-rate metadata") is intentionally
 * NOT encoded as a zod .refine() here: it depends on the two selected
 * accounts' actual currencies, which this schema has no access to and
 * must never trust from client input anyway. createTransferAction/
 * updateTransferAction re-derive both accounts' currencies from the
 * database and enforce the requirement there — see PROMPT 13.
 */

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Notes are too long")
  .nullable()
  .optional();

const optionalDecimalStringSchema = z
  .string()
  .trim()
  .max(30, "Amount is too long")
  .nullable()
  .optional();

const transferFieldsSchema = z
  .object({
    amount: positiveDecimalAmountSchema("Enter an amount"),
    currencyCode: currencyCodeSchema,
    transactionDate: isoDateStringSchema,
    accountId: uuidSchema,
    transferAccountId: uuidSchema,
    // Decimal strings, converted to minor units / a plain ratio in the
    // Server Action — same pattern as amounts elsewhere (see
    // src/lib/money/index.ts's parseDecimalToMinorUnits).
    feeAmount: optionalDecimalStringSchema,
    destinationAmount: optionalDecimalStringSchema,
    exchangeRate: optionalDecimalStringSchema,
    status: transactionStatusSchema.default("cleared"),
    description: descriptionSchema,
  })
  .refine((values) => values.transferAccountId !== values.accountId, {
    message:
      "A transfer needs a destination account different from the source account",
    path: ["transferAccountId"],
  });

export const transferInputSchema = transferFieldsSchema;
export type TransferInput = z.input<typeof transferInputSchema>;

export const transferUpdateSchema = transferFieldsSchema;
export type TransferUpdateInput = z.input<typeof transferUpdateSchema>;

export type TransferFilters = {
  search?: string;
  accountId?: string;
  status?: TransactionStatus;
  dateFrom?: string;
  dateTo?: string;
  includeCancelled?: boolean;
};

/** Reversing a transfer creates a new, swapped-direction transfer — see reverseTransferAction. Same-currency only: a cross-currency reversal needs its own fresh, explicitly-entered rate, which this app never invents. */
export const reverseTransferSchema = z.object({
  transactionId: uuidSchema,
  transactionDate: isoDateStringSchema,
  description: descriptionSchema,
});
export type ReverseTransferInput = z.input<typeof reverseTransferSchema>;
