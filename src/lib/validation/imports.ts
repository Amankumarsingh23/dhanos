import { z } from "zod";
import {
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import { transactionKindSchema } from "@/lib/validation/transactions";

/**
 * Shared zod schemas for the CSV import foundation (PROMPT 41) — the
 * initial upload/mapping input, and the final resolved-row shapes each
 * import type's server-side resolver (src/features/imports/resolve.ts)
 * produces before a row is allowed into the commit step. Re-validating the
 * *resolved* shape here (not just trusting the resolver) is the same
 * "validate against an explicit zod schema" step every other Server Action
 * in this app takes (docs/data-access-patterns.md §1 step 3) — the
 * resolver can build a row, but this schema is what actually gates it.
 */

export const importTypeSchema = z.enum([
  "transactions",
  "account_balances",
  "investment_valuations",
]);
export type ImportType = z.infer<typeof importTypeSchema>;

/** { csvColumnIndex (as a string key): targetFieldKey } — index-keyed rather than header-name-keyed, since a header can be blank, duplicated, or absent entirely. */
export const columnMappingSchema = z.record(z.string(), z.string());
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

const MAX_ROWS = 5000;

export const createImportBatchSchema = z.object({
  importType: importTypeSchema,
  originalFilename: z
    .string()
    .trim()
    .min(1, "A filename is required")
    .max(255, "Filename is too long"),
  headers: z.array(z.string()).max(200, "Too many columns"),
  rows: z
    .array(z.array(z.string()))
    .min(1, "The file has no data rows")
    .max(MAX_ROWS, `A single import is limited to ${MAX_ROWS} rows`),
  columnMapping: columnMappingSchema,
  storedFilePath: z.string().nullable(),
});
export type CreateImportBatchInput = z.input<typeof createImportBatchSchema>;

export const commitImportBatchSchema = z.object({
  importBatchId: uuidSchema,
});
export type CommitImportBatchInput = z.input<typeof commitImportBatchSchema>;

export const rollbackImportBatchSchema = z.object({
  importBatchId: uuidSchema,
});
export type RollbackImportBatchInput = z.input<
  typeof rollbackImportBatchSchema
>;

/** The final, fully-resolved shape of one transactions-import row — account/category already resolved to real ids, amount already integer minor units. */
export const resolvedTransactionRowSchema = z.object({
  transactionDate: isoDateStringSchema,
  kind: transactionKindSchema,
  amountMinorUnits: z.number().int().positive(),
  currencyCode: z.string().length(3),
  accountId: uuidSchema,
  categoryId: uuidSchema.nullable(),
  counterparty: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(500).nullable(),
  externalReference: z.string().trim().max(200).nullable(),
});
export type ResolvedTransactionRow = z.infer<
  typeof resolvedTransactionRowSchema
>;

export const resolvedAccountBalanceRowSchema = z.object({
  asOfDate: isoDateStringSchema,
  accountId: uuidSchema,
  balanceMinorUnits: z.number().int(),
  currencyCode: z.string().length(3),
  notes: z.string().trim().max(2000).nullable(),
});
export type ResolvedAccountBalanceRow = z.infer<
  typeof resolvedAccountBalanceRowSchema
>;

export const resolvedInvestmentValuationRowSchema = z.object({
  asOfDate: isoDateStringSchema,
  investmentHoldingId: uuidSchema,
  valueMinorUnits: z.number().int().nonnegative(),
  currencyCode: z.string().length(3),
  pricePerUnit: z.number().nonnegative().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});
export type ResolvedInvestmentValuationRow = z.infer<
  typeof resolvedInvestmentValuationRowSchema
>;
