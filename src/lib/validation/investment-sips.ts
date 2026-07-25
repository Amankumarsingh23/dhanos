import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import {
  recurringFrequencySchema,
  RECURRING_FREQUENCY_LABELS,
  type RecurringFrequency,
} from "@/lib/validation/recurring-rules";
import { investmentAssetClassSchema } from "@/lib/validation/investments";

/**
 * Shared zod schemas for the SIP management feature (PROMPT 17,
 * src/features/investment-sips) — see
 * supabase/migrations/20260722120000_investment_sips.sql for the matching
 * column definitions/check constraints.
 *
 * A SIP's cadence is the exact same shape recurring_rules already uses, so
 * frequency reuses recurringFrequencySchema/RECURRING_FREQUENCY_LABELS
 * directly rather than redefining an identical enum.
 */

export { recurringFrequencySchema as sipFrequencySchema };
export { RECURRING_FREQUENCY_LABELS as SIP_FREQUENCY_LABELS };
export type SipFrequency = RecurringFrequency;

export const investmentSipStatusSchema = z.enum([
  "planned",
  "active",
  "paused",
  "completed",
  "cancelled",
]);
export type InvestmentSipStatus = z.infer<typeof investmentSipStatusSchema>;

export const INVESTMENT_SIP_STATUS_LABELS: Record<InvestmentSipStatus, string> =
  {
    planned: "Planned",
    active: "Active",
    paused: "Paused",
    completed: "Completed",
    cancelled: "Cancelled",
  };

/**
 * Sentinel value for the asset/platform NativeSelects meaning "create a
 * new one inline" — there is no dedicated management UI for
 * investment_assets/investment_accounts yet (PROMPT 16 was schema-only),
 * so the SIP dialog is where a household's first asset/platform typically
 * gets created, the same "create a minimal supporting row inline" pattern
 * PROMPT 12's createRecurringRuleForExpense already established.
 */
export const CREATE_NEW_OPTION_VALUE = "__new__";

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

const optionalDateSchema = isoDateStringSchema.nullable().optional();

const sipFieldsSchema = z
  .object({
    name: nameSchema,
    // Investment asset: an existing investment_assets.id, or
    // CREATE_NEW_OPTION_VALUE paired with newAssetName/newAssetClass.
    investmentAssetId: z
      .string()
      .min(1, "Select or create an investment asset"),
    newAssetName: z.string().trim().max(200).nullable().optional(),
    newAssetClass: investmentAssetClassSchema.nullable().optional(),
    // Platform: an existing investment_accounts.id, or
    // CREATE_NEW_OPTION_VALUE paired with newPlatformName (+ optional institution).
    investmentAccountId: z.string().min(1, "Select or create a platform"),
    newPlatformName: z.string().trim().max(200).nullable().optional(),
    newPlatformInstitutionId: uuidSchema.nullable().optional(),
    provider: z.string().trim().max(200).nullable().optional(),
    contributionAmount: positiveDecimalAmountSchema(
      "Enter a contribution amount",
    ),
    currencyCode: currencyCodeSchema,
    frequency: recurringFrequencySchema,
    intervalCount: z.number().int().min(1).max(365).default(1),
    startDate: isoDateStringSchema,
    endDate: optionalDateSchema,
    contributionAccountId: uuidSchema,
    expectedDurationMonths: z
      .number()
      .int()
      .min(1)
      .max(1200)
      .nullable()
      .optional(),
    notes: notesSchema,
  })
  .refine(
    (values) =>
      values.investmentAssetId !== CREATE_NEW_OPTION_VALUE ||
      (Boolean(values.newAssetName?.trim()) && Boolean(values.newAssetClass)),
    {
      message: "Enter a name and asset class for the new investment asset",
      path: ["newAssetName"],
    },
  )
  .refine(
    (values) =>
      values.investmentAccountId !== CREATE_NEW_OPTION_VALUE ||
      Boolean(values.newPlatformName?.trim()),
    {
      message: "Enter a name for the new platform",
      path: ["newPlatformName"],
    },
  )
  .refine((values) => !values.endDate || values.endDate >= values.startDate, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

/** Create only: the SIP's initial lifecycle state — 'planned' (not yet started) or 'active' (generating/reminding immediately). Every other status is reached via a lifecycle action, never chosen directly. */
export const sipInitialStatusSchema = z.enum(["planned", "active"]);

export const investmentSipInputSchema = sipFieldsSchema.and(
  z.object({ initialStatus: sipInitialStatusSchema.default("planned") }),
);
export type InvestmentSipInput = z.input<typeof investmentSipInputSchema>;

/**
 * Update: template fields only — never contribution_amount_minor_units
 * directly here (see updateContributionAmountAction... actually a direct
 * edit is fine, see the action's own doc comment) or status (managed by
 * the dedicated activate/pause/resume/cancel/complete actions).
 */
export const investmentSipUpdateSchema = sipFieldsSchema;
export type InvestmentSipUpdateInput = z.input<
  typeof investmentSipUpdateSchema
>;

export type InvestmentSipFilters = {
  search?: string;
  status?: InvestmentSipStatus;
  investmentAccountId?: string;
};

export const recordSipContributionSchema = z.object({
  investmentSipId: uuidSchema,
  occurrenceDate: isoDateStringSchema,
  amount: positiveDecimalAmountSchema("Enter an amount"),
  status: z.enum(["planned", "pending", "cleared"]).default("cleared"),
  notes: notesSchema,
});
export type RecordSipContributionInput = z.input<
  typeof recordSipContributionSchema
>;

export const sipStatusActionSchema = z.object({
  investmentSipId: uuidSchema,
  notes: notesSchema,
});
export type SipStatusActionInput = z.input<typeof sipStatusActionSchema>;
