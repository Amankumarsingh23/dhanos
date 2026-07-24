import { z } from "zod";
import { currencyCodeSchema, uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the monthly financial closing workflow (PROMPT
 * 33, src/features/monthly-closing) — see
 * supabase/migrations/20260723170000_monthly_closings.sql for the
 * matching column definitions/check constraints.
 */

export const REVIEW_ITEM_TYPES = [
  "account_balances",
  "income",
  "expenses",
  "transfers",
  "sip_contributions",
  "investment_valuations",
  "loan_balances",
  "lending_repayments",
  "insurance_premiums",
  "asset_changes",
  "goals",
  "unusual_transactions",
] as const;

export const reviewItemTypeSchema = z.enum(REVIEW_ITEM_TYPES);
export type ReviewItemType = z.infer<typeof reviewItemTypeSchema>;

export const REVIEW_ITEM_LABELS: Record<ReviewItemType, string> = {
  account_balances: "Account balances",
  income: "Income",
  expenses: "Expenses",
  transfers: "Transfers",
  sip_contributions: "SIP contributions",
  investment_valuations: "Investment valuations",
  loan_balances: "Loan balances",
  lending_repayments: "Lending repayments",
  insurance_premiums: "Insurance premiums",
  asset_changes: "Asset changes",
  goals: "Goals",
  unusual_transactions: "Unusual transactions",
};

export const REVIEW_ITEM_DESCRIPTIONS: Record<ReviewItemType, string> = {
  account_balances:
    "Confirm every account's balance matches your real-world statements.",
  income: "Check that all income this month was recorded correctly.",
  expenses: "Check that all expenses this month were recorded correctly.",
  transfers:
    "Confirm transfers between your own accounts are all accounted for.",
  sip_contributions:
    "Confirm scheduled SIP contributions went through as expected.",
  investment_valuations: "Update or confirm current investment valuations.",
  loan_balances: "Confirm loan payments were recorded and balances look right.",
  lending_repayments:
    "Confirm any repayments from people you've lent to were recorded.",
  insurance_premiums:
    "Confirm premium payments and check for upcoming renewals.",
  asset_changes: "Note any new, sold, or revalued assets this month.",
  goals: "Review progress toward your financial goals.",
  unusual_transactions:
    "Look for any unusually large or unexpected transactions.",
};

export const monthlyClosingStatusSchema = z.enum([
  "in_progress",
  "closed",
  "reopened",
]);
export type MonthlyClosingStatus = z.infer<typeof monthlyClosingStatusSchema>;

export const MONTHLY_CLOSING_STATUS_LABELS: Record<
  MonthlyClosingStatus,
  string
> = {
  in_progress: "In progress",
  closed: "Closed",
  reopened: "Reopened",
};

/** YYYY-MM. */
const periodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be a period in YYYY-MM format");

export const startMonthlyClosingSchema = z.object({
  period: periodSchema,
  currencyCode: currencyCodeSchema,
  supersedesClosingId: uuidSchema.nullable().optional(),
});
export type StartMonthlyClosingInput = z.input<
  typeof startMonthlyClosingSchema
>;

export const updateReviewItemSchema = z.object({
  reviewItemId: uuidSchema,
  isReviewed: z.boolean(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateReviewItemInput = z.input<typeof updateReviewItemSchema>;

export const completeMonthlyClosingSchema = z.object({
  monthlyClosingId: uuidSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CompleteMonthlyClosingInput = z.input<
  typeof completeMonthlyClosingSchema
>;

/** "Reopening requires deliberate confirmation" (PROMPT 33 acceptance criterion) — a reason is always required, never optional, so reopening is never a single accidental click. */
export const reopenMonthlyClosingSchema = z.object({
  monthlyClosingId: uuidSchema,
  reopenReason: z
    .string()
    .trim()
    .min(1, "Explain why this closing needs to be reopened")
    .max(1000),
});
export type ReopenMonthlyClosingInput = z.input<
  typeof reopenMonthlyClosingSchema
>;
