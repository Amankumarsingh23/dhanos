import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import { transactionStatusSchema } from "@/lib/validation/transactions";

/**
 * Shared zod schemas for the Recurring commitments feature
 * (src/features/recurring) — see
 * supabase/migrations/20260721140000_recurring_commitments.sql for the
 * matching column definitions/check constraints this schema must stay in
 * sync with.
 */

/** The recurring_rules.kind vocabulary — 'refund' and 'adjustment' are excluded since neither recurs by definition (see the table's own comment). */
export const recurringRuleKindSchema = z.enum([
  "income",
  "expense",
  "transfer",
  "investment_contribution",
  "investment_withdrawal",
  "loan_disbursement",
  "loan_payment",
  "lending_disbursement",
  "lending_repayment",
]);
export type RecurringRuleKind = z.infer<typeof recurringRuleKindSchema>;

export const RECURRING_RULE_KIND_LABELS: Record<RecurringRuleKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  investment_contribution: "Investment contribution",
  investment_withdrawal: "Investment withdrawal",
  loan_disbursement: "Loan disbursement",
  loan_payment: "Loan payment",
  lending_disbursement: "Lending disbursement",
  lending_repayment: "Lending repayment",
};

export const recurringFrequencySchema = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "custom",
]);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
  custom: "Custom (every N days)",
};

export const recurringRuleStatusSchema = z.enum(["active", "paused", "ended"]);
export type RecurringRuleStatus = z.infer<typeof recurringRuleStatusSchema>;

export const RECURRING_RULE_STATUS_LABELS: Record<RecurringRuleStatus, string> =
  {
    active: "Active",
    paused: "Paused",
    ended: "Ended",
  };

export const autoCreateModeSchema = z.enum([
  "reminder_only",
  "planned_transaction",
]);
export type AutoCreateMode = z.infer<typeof autoCreateModeSchema>;

export const AUTO_CREATE_MODE_LABELS: Record<AutoCreateMode, string> = {
  reminder_only: "Remind me — don't record anything automatically",
  planned_transaction: "Auto-create a planned transaction",
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

const counterpartySchema = z
  .string()
  .trim()
  .max(200, "Merchant/counterparty is too long")
  .nullable()
  .optional();

const optionalUuidSchema = uuidSchema.nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

const recurringRuleFieldsSchema = z
  .object({
    name: nameSchema,
    kind: recurringRuleKindSchema,
    amount: z.string().trim().min(1, "Enter an amount"),
    currencyCode: currencyCodeSchema,
    accountId: uuidSchema,
    transferAccountId: optionalUuidSchema,
    categoryId: optionalUuidSchema,
    counterparty: counterpartySchema,
    relatedPersonId: optionalUuidSchema,
    frequency: recurringFrequencySchema,
    // A plain day count for 'custom'; the multiplier (every N cycles) for
    // every other frequency. Always a positive integer.
    intervalCount: z.number().int().min(1).max(365).default(1),
    startDate: isoDateStringSchema,
    endDate: optionalDateSchema,
    autoCreateMode: autoCreateModeSchema.default("reminder_only"),
    reminderLeadDays: z.number().int().min(0).max(60).default(3),
    notes: notesSchema,
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
  )
  .refine((values) => !values.endDate || values.endDate >= values.startDate, {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

export const recurringRuleInputSchema = recurringRuleFieldsSchema;
export type RecurringRuleInput = z.input<typeof recurringRuleInputSchema>;

export const recurringRuleUpdateSchema = recurringRuleFieldsSchema;
export type RecurringRuleUpdateInput = z.input<
  typeof recurringRuleUpdateSchema
>;

export type RecurringRuleFilters = {
  search?: string;
  kind?: RecurringRuleKind;
  status?: RecurringRuleStatus;
  accountId?: string;
};

/** Schedules a future amount change — see PROMPT 14 "amount change from a particular date." Always a new schedule row, never an edit of the rule's own amount_minor_units in place. */
export const scheduleAmountChangeSchema = z.object({
  recurringRuleId: uuidSchema,
  effectiveDate: isoDateStringSchema,
  newAmount: z.string().trim().min(1, "Enter the new amount"),
});
export type ScheduleAmountChangeInput = z.input<
  typeof scheduleAmountChangeSchema
>;

/** Manually confirms/records one occurrence — the reminder_only path, or an early/late confirmation for a planned_transaction rule. */
export const recordOccurrenceSchema = z.object({
  recurringRuleId: uuidSchema,
  transactionDate: isoDateStringSchema,
  amount: z.string().trim().min(1, "Enter an amount"),
  status: transactionStatusSchema.exclude(["cancelled"]).default("cleared"),
  description: z.string().trim().max(500).nullable().optional(),
});
export type RecordOccurrenceInput = z.input<typeof recordOccurrenceSchema>;

export const pauseResumeRuleSchema = z.object({
  recurringRuleId: uuidSchema,
  notes: notesSchema,
});
export type PauseResumeRuleInput = z.input<typeof pauseResumeRuleSchema>;

export const skipOccurrenceSchema = z.object({
  recurringRuleId: uuidSchema,
  notes: notesSchema,
});
export type SkipOccurrenceInput = z.input<typeof skipOccurrenceSchema>;
