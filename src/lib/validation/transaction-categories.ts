import { z } from "zod";
import { uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the Transaction Categories feature
 * (src/features/transaction-categories) — see docs/financial-domain-model.md
 * §3 and supabase/migrations/20260721060000_transaction_categories.sql +
 * 20260721090000_transaction_engine.sql for the matching column
 * definitions/check constraints this schema must stay in sync with.
 */

export const categoryKindSchema = z.enum([
  "income",
  "expense",
  "transfer",
  "investment",
  "debt",
  "other",
]);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  investment: "Investment",
  debt: "Debt",
  other: "Other",
};

/**
 * PROMPT 10, "Category behavior": a spending-discipline tag, distinct from
 * category_kind (which transaction kinds a category applies to). Meaningful
 * mainly for expense/investment categories — left unset for income and
 * group headers.
 */
export const classificationSchema = z.enum([
  "need",
  "want",
  "obligation",
  "protection",
  "investment",
]);
export type Classification = z.infer<typeof classificationSchema>;

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  need: "Need",
  want: "Want",
  obligation: "Obligation",
  protection: "Protection",
  investment: "Investment",
};

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name is too long");

const iconSchema = z
  .string()
  .trim()
  .max(50, "Icon is too long")
  .nullable()
  .optional();

const colorSchema = z
  .string()
  .trim()
  .max(20, "Color is too long")
  .nullable()
  .optional();

export const categoryInputSchema = z.object({
  name: nameSchema,
  categoryKind: categoryKindSchema,
  parentCategoryId: uuidSchema.nullable().optional(),
  classification: classificationSchema.nullable().optional(),
  icon: iconSchema,
  color: colorSchema,
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export const categoryUpdateSchema = categoryInputSchema;
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;

export type CategoryFilters = {
  search?: string;
  categoryKind?: CategoryKind;
  includeArchived?: boolean;
};

export const reorderCategoriesSchema = z.object({
  orderedCategoryIds: z.array(uuidSchema).min(1),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
