import { z } from "zod";

/**
 * Shared zod primitives for schemas used across features. Keep this file
 * dependency-free of other `lib/*` modules (no importing `lib/money`) so it
 * can be safely imported from anywhere, including client-side form schemas.
 */

export const currencyCodeSchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "Must be a 3-letter ISO 4217 currency code, e.g. INR")
  .transform((value) => value.toUpperCase());

/** Integer amount in minor units (e.g. paise). Never a decimal/rupee value. */
export const amountMinorUnitsSchema = z
  .number()
  .int(
    "Amount must be a whole number of minor units (e.g. paise), not a decimal",
  )
  .safe("Amount is too large to represent safely");

export const nonZeroAmountMinorUnitsSchema = amountMinorUnitsSchema.refine(
  (value) => value !== 0,
  "Amount cannot be zero",
);

/**
 * A decimal amount string as typed by a user (e.g. "100.50"), for any
 * field that must always be a positive magnitude — a target/coverage/
 * principal/premium/contribution amount, never a signed delta. Rejects a
 * leading "-" at the schema layer, before the value ever reaches
 * parseDecimalToMinorUnits (src/lib/money/index.ts), which otherwise
 * happily parses a signed string — that flexibility exists for genuinely
 * signed contexts (see its own tests), not amount-entry fields. Found
 * missing during the PROMPT 45 security review: every money-amount field
 * across the app previously used a bare `z.string().trim().min(1, ...)`
 * with no sign check, so a transaction/goal/loan/etc. amount could be
 * submitted negative directly via the REST API, bypassing the UI
 * entirely — see docs/security-review.md's negative-amount finding.
 * Deliberately excludes account-balance reconciliation (a credit-type
 * account's confirmed balance is legitimately negative) and any field
 * representing a signed adjustment/delta rather than a magnitude — those
 * keep the bare string schema on purpose.
 */
export function positiveDecimalAmountSchema(emptyMessage: string) {
  return z
    .string()
    .trim()
    .min(1, emptyMessage)
    .refine((value) => !value.startsWith("-"), "Amount must be positive");
}

export const isoDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format");

/**
 * Semantic date aliases — all share isoDateStringSchema's YYYY-MM-DD shape,
 * but each is `.brand()`ed so a transaction date can't be passed where a
 * valuation date is expected (or vice versa) without the compiler
 * complaining, even though both are "just a string" at runtime. See
 * docs/financial-domain-model.md §3 and the PROMPT 7 date-utilities brief.
 */
export const transactionDateSchema =
  isoDateStringSchema.brand<"TransactionDate">();
export type TransactionDate = z.infer<typeof transactionDateSchema>;

export const dueDateSchema = isoDateStringSchema.brand<"DueDate">();
export type DueDate = z.infer<typeof dueDateSchema>;

export const valuationDateSchema = isoDateStringSchema.brand<"ValuationDate">();
export type ValuationDate = z.infer<typeof valuationDateSchema>;

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be a month in YYYY-MM format")
  .brand<"MonthKey">();
export type MonthKey = z.infer<typeof monthKeySchema>;

export const uuidSchema = z.string().uuid();

export const householdRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Shared pagination input — see src/lib/queries/pagination.ts for the range/ordering logic built on top of this. */
export const paginationInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});
export type PaginationInput = z.input<typeof paginationInputSchema>;
export type PaginationParams = z.output<typeof paginationInputSchema>;
