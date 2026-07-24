import { z } from "zod";
import { isoDateStringSchema, uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the financial calendar (PROMPT 35,
 * src/features/reminders) — see
 * supabase/migrations/20260724100000_reminders.sql for the matching column
 * definitions/check constraints.
 */

export const REMINDER_TYPES = [
  "sip_due",
  "emi_due",
  "insurance_premium",
  "policy_renewal",
  "loan_review",
  "expected_income",
  "lending_repayment",
  "document_expiry",
  "fixed_deposit_maturity",
  "goal_review",
  "monthly_closing",
  "asset_valuation_review",
  "decision_review",
] as const;
export const reminderTypeSchema = z.enum(REMINDER_TYPES);
export type ReminderType = z.infer<typeof reminderTypeSchema>;

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  sip_due: "SIP due",
  emi_due: "EMI due",
  insurance_premium: "Insurance premium",
  policy_renewal: "Policy renewal",
  loan_review: "Loan review",
  expected_income: "Expected income",
  lending_repayment: "Lending repayment",
  document_expiry: "Document expiry",
  fixed_deposit_maturity: "Fixed-deposit maturity",
  goal_review: "Goal review",
  monthly_closing: "Monthly closing",
  asset_valuation_review: "Asset valuation review",
  decision_review: "Decision review",
};

export const REMINDER_ENTITY_TYPES = [
  "investment_sip",
  "loan",
  "insurance_policy",
  "income_source",
  "lending",
  "document",
  "financial_account",
  "goal",
  "asset",
  "household",
  "decision_journal_entry",
] as const;
export const reminderEntityTypeSchema = z.enum(REMINDER_ENTITY_TYPES);
export type ReminderEntityType = z.infer<typeof reminderEntityTypeSchema>;

/** Which entity_type a given reminder_type always links to (see the migration's reminder_type CHECK) — the app never has to guess. */
export const REMINDER_ENTITY_TYPE_BY_REMINDER_TYPE: Record<
  ReminderType,
  ReminderEntityType
> = {
  sip_due: "investment_sip",
  emi_due: "loan",
  insurance_premium: "insurance_policy",
  policy_renewal: "insurance_policy",
  loan_review: "loan",
  expected_income: "income_source",
  lending_repayment: "lending",
  document_expiry: "document",
  fixed_deposit_maturity: "financial_account",
  goal_review: "goal",
  monthly_closing: "household",
  asset_valuation_review: "asset",
  decision_review: "decision_journal_entry",
};

export const REMINDER_STATUSES = ["pending", "completed", "skipped"] as const;
export const reminderStatusSchema = z.enum(REMINDER_STATUSES);
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;

/** The list views the UI offers — derived from status + due_date + snoozed_until (see classifyReminder, src/lib/calculations/reminders.ts), not a stored column. */
export const REMINDER_VIEWS = [
  "upcoming",
  "overdue",
  "snoozed",
  "completed",
  "skipped",
] as const;
export const reminderViewSchema = z.enum(REMINDER_VIEWS);
export type ReminderView = z.infer<typeof reminderViewSchema>;

export const reminderIdSchema = z.object({ reminderId: uuidSchema });
export type ReminderIdInput = z.input<typeof reminderIdSchema>;

export const snoozeReminderSchema = z.object({
  reminderId: uuidSchema,
  snoozedUntil: isoDateStringSchema,
});
export type SnoozeReminderInput = z.input<typeof snoozeReminderSchema>;

export type ReminderFilters = {
  view?: ReminderView;
  reminderType?: ReminderType;
};
