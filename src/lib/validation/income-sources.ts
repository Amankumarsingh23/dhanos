import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the Income feature (src/features/income) — see
 * supabase/migrations/20260721100000_income_sources.sql for the matching
 * column definitions/check constraints this schema must stay in sync with.
 */

export const incomeSourceTypeSchema = z.enum([
  "salary",
  "internship",
  "business",
  "freelance",
  "part_time",
  "rental",
  "interest",
  "dividend",
  "commission",
  "pension",
  "gift",
  "other",
]);
export type IncomeSourceType = z.infer<typeof incomeSourceTypeSchema>;

export const INCOME_SOURCE_TYPE_LABELS: Record<IncomeSourceType, string> = {
  salary: "Salary",
  internship: "Internship",
  business: "Business",
  freelance: "Freelance",
  part_time: "Part-time",
  rental: "Rental",
  interest: "Interest",
  dividend: "Dividend",
  commission: "Commission",
  pension: "Pension",
  gift: "Gift",
  other: "Other",
};

export const incomeFrequencySchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "irregular",
]);
export type IncomeFrequency = z.infer<typeof incomeFrequencySchema>;

export const INCOME_FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
  irregular: "Irregular",
};

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name is too long");

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .nullable()
  .optional();

const optionalUuidSchema = uuidSchema.nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

const incomeSourceFieldsSchema = z
  .object({
    name: nameSchema,
    sourceType: incomeSourceTypeSchema,
    institutionId: optionalUuidSchema,
    personId: optionalUuidSchema,
    // A decimal string, or blank for "no fixed expectation" — converted to
    // minor units (or null) in the Server Action, same pattern as
    // src/lib/validation/accounts.ts's openingBalance.
    expectedAmount: z.string().trim().max(30, "Amount is too long").optional(),
    currencyCode: currencyCodeSchema,
    frequency: incomeFrequencySchema,
    expectedDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    expectedPaymentDateRule: z
      .string()
      .trim()
      .max(200, "Too long")
      .nullable()
      .optional(),
    receivingAccountId: uuidSchema,
    categoryId: optionalUuidSchema,
    startDate: isoDateStringSchema,
    endDate: optionalDateSchema,
    taxWithholdingExpected: z.boolean().default(false),
    taxWithholdingNotes: notesSchema,
    isActive: z.boolean().default(true),
    notes: notesSchema,
  })
  .refine((values) => !values.endDate || values.endDate >= values.startDate, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  })
  .refine(
    (values) =>
      values.frequency === "weekly" ||
      values.frequency === "biweekly" ||
      values.frequency === "irregular"
        ? true
        : values.expectedDayOfMonth != null,
    {
      message:
        "Enter an expected day of month for a monthly-or-slower cadence — needed to compute the missed-income indicator",
      path: ["expectedDayOfMonth"],
    },
  );

export const incomeSourceInputSchema = incomeSourceFieldsSchema;
export type IncomeSourceInput = z.input<typeof incomeSourceInputSchema>;

export const incomeSourceUpdateSchema = incomeSourceFieldsSchema;
export type IncomeSourceUpdateInput = z.input<typeof incomeSourceUpdateSchema>;

export type IncomeSourceFilters = {
  search?: string;
  sourceType?: IncomeSourceType;
  personId?: string;
  includeInactive?: boolean;
};

/**
 * Recording an actual receipt against a source — see recordIncomeAction.
 * kind is always 'income' and account_id defaults to the source's
 * receiving_account_id, so this only asks for what can legitimately vary
 * per receipt.
 */
export const recordIncomeSchema = z.object({
  incomeSourceId: uuidSchema,
  amount: positiveDecimalAmountSchema("Enter an amount"),
  transactionDate: isoDateStringSchema,
  accountId: optionalUuidSchema,
  categoryId: optionalUuidSchema,
  description: z.string().trim().max(500).nullable().optional(),
  status: z
    .enum(["planned", "pending", "cleared", "reconciled"])
    .default("cleared"),
  confirmDuplicate: z.boolean().optional().default(false),
});
export type RecordIncomeInput = z.input<typeof recordIncomeSchema>;
