import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the Transactions feature (src/features/transactions)
 * — see docs/financial-domain-model.md §3 and
 * supabase/migrations/20260721060006_transactions.sql +
 * 20260721060007_transaction_splits.sql +
 * 20260721090000_transaction_engine.sql for the matching column
 * definitions/check constraints this schema must stay in sync with.
 */

export const transactionKindSchema = z.enum([
  "income",
  "expense",
  "transfer",
  "investment_contribution",
  "investment_withdrawal",
  "loan_disbursement",
  "loan_payment",
  "lending_disbursement",
  "lending_repayment",
  "liability_incurred",
  "liability_payment",
  "refund",
  "adjustment",
]);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  investment_contribution: "Investment contribution",
  investment_withdrawal: "Investment withdrawal",
  loan_disbursement: "Loan disbursement",
  loan_payment: "Loan payment",
  lending_disbursement: "Lending disbursement",
  lending_repayment: "Lending repayment",
  liability_incurred: "Liability incurred",
  liability_payment: "Liability payment",
  refund: "Refund",
  adjustment: "Adjustment",
};

/**
 * The kinds offered by the general add/edit transaction form.
 * 'refund' has its own dedicated flow (recordRefundAction — always linked
 * to the expense it reverses) and 'adjustment' is system-generated only
 * (record_account_balance_correction) — neither is a free-form choice a
 * user picks from a blank form.
 */
export const GENERAL_FORM_TRANSACTION_KINDS = [
  "income",
  "expense",
  "transfer",
  "investment_contribution",
  "investment_withdrawal",
  "loan_disbursement",
  "loan_payment",
  "lending_disbursement",
  "lending_repayment",
  "liability_incurred",
  "liability_payment",
] as const satisfies readonly TransactionKind[];

export const transactionStatusSchema = z.enum([
  "planned",
  "pending",
  "cleared",
  "cancelled",
  "reconciled",
]);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  planned: "Planned",
  pending: "Pending",
  cleared: "Cleared",
  cancelled: "Cancelled",
  reconciled: "Reconciled",
};

export const transactionSourceTypeSchema = z.enum([
  "manual",
  "import",
  "recurring",
  "system",
]);
export type TransactionSourceType = z.infer<typeof transactionSourceTypeSchema>;

const counterpartySchema = z
  .string()
  .trim()
  .max(200, "Counterparty is too long")
  .nullable()
  .optional();

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Description is too long")
  .nullable()
  .optional();

const notesSchema = z
  .string()
  .trim()
  .max(500, "Notes are too long")
  .nullable()
  .optional();

const optionalUuidSchema = uuidSchema.nullable().optional();

/** One row of a split transaction — see transaction_splits. */
export const transactionSplitInputSchema = z.object({
  categoryId: uuidSchema,
  // A decimal string, converted to minor units in the Server Action —
  // same pattern as amounts elsewhere (see src/lib/money/index.ts).
  amount: z.string().trim().min(1, "Enter an amount"),
  notes: notesSchema,
});
export type TransactionSplitInput = z.input<typeof transactionSplitInputSchema>;

const transactionFieldsSchema = z
  .object({
    kind: transactionKindSchema,
    // A decimal string — see src/lib/money/index.ts's
    // parseDecimalToMinorUnits, applied in the Server Action.
    amount: z.string().trim().min(1, "Enter an amount"),
    currencyCode: currencyCodeSchema,
    transactionDate: isoDateStringSchema,
    accountId: uuidSchema,
    transferAccountId: optionalUuidSchema,
    categoryId: optionalUuidSchema,
    counterparty: counterpartySchema,
    description: descriptionSchema,
    status: transactionStatusSchema.default("cleared"),
    sourceType: transactionSourceTypeSchema.default("manual"),
    relatedPersonId: optionalUuidSchema,
    splits: z.array(transactionSplitInputSchema).optional(),
  })
  .refine(
    (values) =>
      values.kind === "transfer"
        ? Boolean(values.transferAccountId) &&
          values.transferAccountId !== values.accountId
        : !values.transferAccountId,
    {
      message:
        "A transfer needs a destination account different from the source account; other kinds must not set one",
      path: ["transferAccountId"],
    },
  );

export const transactionInputSchema = transactionFieldsSchema;
export type TransactionInput = z.input<typeof transactionInputSchema>;

export const transactionUpdateSchema = transactionFieldsSchema;
export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;

/**
 * A refund always references the expense it reverses (reverses_transaction_id)
 * — see recordRefundAction in src/features/transactions/actions.ts, which
 * fills in kind = 'refund' and the source transaction's account/currency
 * itself rather than trusting the client for those.
 */
export const refundInputSchema = z.object({
  originalTransactionId: uuidSchema,
  amount: z.string().trim().min(1, "Enter a refund amount"),
  transactionDate: isoDateStringSchema,
  description: descriptionSchema,
});
export type RefundInput = z.input<typeof refundInputSchema>;

export type TransactionFilters = {
  search?: string;
  kind?: TransactionKind;
  status?: TransactionStatus;
  accountId?: string;
  categoryId?: string;
  relatedPersonId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** 'cancelled' transactions ("archived") are excluded unless explicitly included — same convention as every other list in this app. */
  includeCancelled?: boolean;
};
