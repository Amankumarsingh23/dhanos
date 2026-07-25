import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import { transactionStatusSchema } from "@/lib/validation/transactions";

/**
 * Shared zod schemas for the Expense feature (src/features/expenses) — see
 * supabase/migrations/20260721120000_expense_management.sql for the
 * matching column definitions/check constraints this schema must stay in
 * sync with. Expenses are transactions rows with kind = 'expense' (see
 * docs/financial-domain-model.md §3); this module only adds what's
 * specific to the expense-focused create/edit form and its views —
 * general transaction shapes live in src/lib/validation/transactions.ts.
 */

const counterpartySchema = z
  .string()
  .trim()
  .max(200, "Merchant/counterparty is too long")
  .nullable()
  .optional();

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Notes are too long")
  .nullable()
  .optional();

const optionalUuidSchema = uuidSchema.nullable().optional();

/** One row of a split expense — see transaction_splits. */
export const expenseSplitInputSchema = z.object({
  categoryId: uuidSchema,
  amount: positiveDecimalAmountSchema("Enter an amount"),
  notes: descriptionSchema,
});
export type ExpenseSplitInput = z.input<typeof expenseSplitInputSchema>;

/**
 * A minimal recurring cadence, matching recurring_rules.frequency — offered
 * only when the user marks an expense as recurring. 'custom' exists in the
 * underlying table but has no interval-unit UI here yet; treat it as
 * unavailable from this form rather than accepting input this form can't
 * meaningfully collect.
 */
export const expenseRecurringFrequencySchema = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
]);
export type ExpenseRecurringFrequency = z.infer<
  typeof expenseRecurringFrequencySchema
>;

export const EXPENSE_RECURRING_FREQUENCY_LABELS: Record<
  ExpenseRecurringFrequency,
  string
> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
};

const expenseFieldsSchema = z
  .object({
    amount: positiveDecimalAmountSchema("Enter an amount"),
    currencyCode: currencyCodeSchema,
    transactionDate: isoDateStringSchema,
    accountId: uuidSchema,
    categoryId: optionalUuidSchema,
    counterparty: counterpartySchema,
    relatedPersonId: optionalUuidSchema,
    description: descriptionSchema,
    status: transactionStatusSchema.default("cleared"),
    // Budgeting intent — see transactions.is_planned. Always asked
    // explicitly rather than defaulted, since "was this anticipated" has
    // no safe implicit answer.
    isPlanned: z.boolean(),
    isRecurring: z.boolean().default(false),
    recurringFrequency: expenseRecurringFrequencySchema.nullable().optional(),
    recurringIntervalCount: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable()
      .optional(),
    splits: z.array(expenseSplitInputSchema).optional(),
  })
  .refine(
    (values) => !values.isRecurring || Boolean(values.recurringFrequency),
    {
      message: "Choose how often this expense recurs",
      path: ["recurringFrequency"],
    },
  );

export const expenseInputSchema = expenseFieldsSchema;
export type ExpenseInput = z.input<typeof expenseInputSchema>;

export const expenseUpdateSchema = expenseFieldsSchema;
export type ExpenseUpdateInput = z.input<typeof expenseUpdateSchema>;

/**
 * The named expense views PROMPT 12 asks for. "Family member" / "merchant"
 * / "category" are grouping views (a breakdown table), the rest narrow the
 * flat expense list — see src/features/expenses/expenses-manager.tsx.
 */
export const expenseViewSchema = z.enum([
  "all",
  "this_month",
  "essentials",
  "discretionary",
  "irregular",
  "recurring",
  "unplanned",
  "by_person",
  "by_merchant",
  "by_category",
]);
export type ExpenseView = z.infer<typeof expenseViewSchema>;

export const EXPENSE_VIEW_LABELS: Record<ExpenseView, string> = {
  all: "All expenses",
  this_month: "This month",
  essentials: "Essentials",
  discretionary: "Discretionary",
  irregular: "Irregular (one-time)",
  recurring: "Recurring",
  unplanned: "Unplanned expenses",
  by_person: "By family member",
  by_merchant: "By merchant",
  by_category: "By category",
};

export type ExpenseFilters = {
  search?: string;
  accountId?: string;
  categoryId?: string;
  relatedPersonId?: string;
  dateFrom?: string;
  dateTo?: string;
  /** true = only recurring_rule_id IS NOT NULL, false = only IS NULL, undefined = no filter. */
  isRecurring?: boolean;
  /** true = only is_planned = false, false = only is_planned = true, undefined = no filter. */
  isPlanned?: boolean;
  /** 'essential' | 'discretionary' | 'unclassified', matching bucketClassification — filters by the expense's category classification. */
  classificationBucket?: "essential" | "discretionary";
  includeCancelled?: boolean;
};

/** Attaches an already-uploaded Storage object to a transaction as a receipt — see src/lib/storage and attachExpenseReceiptAction. */
export const attachExpenseReceiptSchema = z.object({
  transactionId: uuidSchema,
  storagePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(200).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
});
export type AttachExpenseReceiptInput = z.input<
  typeof attachExpenseReceiptSchema
>;
