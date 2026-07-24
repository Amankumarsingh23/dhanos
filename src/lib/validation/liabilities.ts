import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the liabilities feature (PROMPT 24,
 * src/features/liabilities) — see
 * supabase/migrations/20260722170000_liabilities.sql for the matching
 * column definitions/check constraints. One table covers both informal
 * borrowing (money borrowed from family/a friend, an employer advance, an
 * unpaid obligation, private business borrowing, a pending personal
 * settlement) and general obligations (unpaid tax, pending bill,
 * contractual commitment, guarantee, maintenance obligation, recurring
 * commitment) — `liabilitySource` is the coarse split PROMPT 24 asks to
 * keep distinguishable from institutional (loans) debt, `category` the
 * finer label within it.
 */

export const liabilitySourceSchema = z.enum([
  "informal_borrowing",
  "general_obligation",
]);
export type LiabilitySource = z.infer<typeof liabilitySourceSchema>;

export const LIABILITY_SOURCE_LABELS: Record<LiabilitySource, string> = {
  informal_borrowing: "Informal borrowing",
  general_obligation: "General obligation",
};

export const INFORMAL_BORROWING_CATEGORIES = [
  "family",
  "friend",
  "employer_advance",
  "unpaid_obligation",
  "business_borrowing",
  "personal_settlement",
  "other_informal",
] as const;

export const GENERAL_OBLIGATION_CATEGORIES = [
  "unpaid_tax",
  "pending_bill",
  "contractual_commitment",
  "guarantee",
  "maintenance_obligation",
  "recurring_commitment",
  "other_general",
] as const;

export const liabilityCategorySchema = z.enum([
  ...INFORMAL_BORROWING_CATEGORIES,
  ...GENERAL_OBLIGATION_CATEGORIES,
]);
export type LiabilityCategory = z.infer<typeof liabilityCategorySchema>;

export const LIABILITY_CATEGORY_LABELS: Record<LiabilityCategory, string> = {
  family: "Money borrowed from family",
  friend: "Money borrowed from a friend",
  employer_advance: "Employer advance",
  unpaid_obligation: "Unpaid obligation",
  business_borrowing: "Private business borrowing",
  personal_settlement: "Pending personal settlement",
  other_informal: "Other informal borrowing",
  unpaid_tax: "Unpaid tax",
  pending_bill: "Pending bill",
  contractual_commitment: "Contractual commitment",
  guarantee: "Guarantee",
  maintenance_obligation: "Maintenance obligation",
  recurring_commitment: "Recurring draining commitment",
  other_general: "Other general obligation",
};

/** Which categories are valid for a given liabilitySource — drives the category dropdown and the create/update refinement below, mirroring liabilities_category_matches_source in the migration. */
export const CATEGORIES_BY_SOURCE: Record<
  LiabilitySource,
  readonly LiabilityCategory[]
> = {
  informal_borrowing: INFORMAL_BORROWING_CATEGORIES,
  general_obligation: GENERAL_OBLIGATION_CATEGORIES,
};

export const liabilityInterestTypeSchema = z.enum(["simple", "compound"]);
export type LiabilityInterestType = z.infer<typeof liabilityInterestTypeSchema>;

export const LIABILITY_INTEREST_TYPE_LABELS: Record<
  LiabilityInterestType,
  string
> = {
  simple: "Simple",
  compound: "Compound",
};

export const liabilityRepaymentScheduleTypeSchema = z.enum([
  "lump_sum",
  "installments",
  "on_demand",
  "flexible",
]);
export type LiabilityRepaymentScheduleType = z.infer<
  typeof liabilityRepaymentScheduleTypeSchema
>;

export const LIABILITY_REPAYMENT_SCHEDULE_TYPE_LABELS: Record<
  LiabilityRepaymentScheduleType,
  string
> = {
  lump_sum: "Lump sum",
  installments: "Installments",
  on_demand: "On demand",
  flexible: "Flexible",
};

export const liabilityInstallmentFrequencySchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);
export type LiabilityInstallmentFrequency = z.infer<
  typeof liabilityInstallmentFrequencySchema
>;

export const LIABILITY_INSTALLMENT_FREQUENCY_LABELS: Record<
  LiabilityInstallmentFrequency,
  string
> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export const liabilityDocumentationStatusSchema = z.enum([
  "none",
  "verbal_agreement",
  "written_note",
  "formal_agreement",
  "legal_document",
]);
export type LiabilityDocumentationStatus = z.infer<
  typeof liabilityDocumentationStatusSchema
>;

export const LIABILITY_DOCUMENTATION_STATUS_LABELS: Record<
  LiabilityDocumentationStatus,
  string
> = {
  none: "None",
  verbal_agreement: "Verbal agreement",
  written_note: "Written note",
  formal_agreement: "Formal agreement",
  legal_document: "Legal document",
};

/** "Do not mix estimates with legally confirmed obligations without labels" (PROMPT 24 acceptance criterion) — every liability is explicitly one or the other. */
export const liabilityCertaintySchema = z.enum(["confirmed", "estimated"]);
export type LiabilityCertainty = z.infer<typeof liabilityCertaintySchema>;

export const LIABILITY_CERTAINTY_LABELS: Record<LiabilityCertainty, string> = {
  confirmed: "Confirmed",
  estimated: "Estimated",
};

export const liabilityStatusSchema = z.enum([
  "active",
  "partially_paid",
  "paid",
  "disputed",
  "waived",
]);
export type LiabilityStatus = z.infer<typeof liabilityStatusSchema>;

export const LIABILITY_STATUS_LABELS: Record<LiabilityStatus, string> = {
  active: "Active",
  partially_paid: "Partially paid",
  paid: "Paid",
  disputed: "Disputed",
  waived: "Waived",
};

/** The subset of statuses a household can switch to manually — partially_paid/paid are only reached via record_liability_payment. */
export const manualLiabilityStatusSchema = z.enum([
  "active",
  "disputed",
  "waived",
]);
export type ManualLiabilityStatus = z.infer<typeof manualLiabilityStatusSchema>;

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

function withSharedRefinements<
  T extends z.ZodType<{
    liabilitySource: LiabilitySource;
    category: LiabilityCategory;
    chargesInterest: boolean;
    annualInterestRatePercent?: string | null;
    repaymentScheduleType: LiabilityRepaymentScheduleType;
    installmentAmount?: string | null;
    installmentFrequency?: LiabilityInstallmentFrequency | null;
  }>,
>(schema: T) {
  return schema
    .refine(
      (values) =>
        CATEGORIES_BY_SOURCE[values.liabilitySource].includes(values.category),
      {
        message: "Select a category that matches the liability source",
        path: ["category"],
      },
    )
    .refine(
      (values) =>
        !values.chargesInterest ||
        (values.annualInterestRatePercent &&
          values.annualInterestRatePercent.trim() !== ""),
      {
        message: "Enter the annual interest rate",
        path: ["annualInterestRatePercent"],
      },
    )
    .refine(
      (values) =>
        values.repaymentScheduleType !== "installments" ||
        (Boolean(values.installmentAmount?.trim()) &&
          Boolean(values.installmentFrequency)),
      {
        message: "Enter the installment amount and frequency",
        path: ["installmentAmount"],
      },
    );
}

const createLiabilityFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  liabilitySource: liabilitySourceSchema,
  category: liabilityCategorySchema,
  counterpartyPersonId: z.string().nullable().optional(),
  counterpartyInstitutionId: z.string().nullable().optional(),
  amount: z.string().trim().min(1, "Enter the amount"),
  currencyCode: currencyCodeSchema,
  startDate: isoDateStringSchema,
  dueDate: optionalDateSchema,
  chargesInterest: z.boolean().default(false),
  annualInterestRatePercent: z.string().trim().max(20).nullable().optional(),
  interestType: liabilityInterestTypeSchema.nullable().optional(),
  repaymentScheduleType:
    liabilityRepaymentScheduleTypeSchema.default("lump_sum"),
  installmentAmount: z.string().trim().max(30).nullable().optional(),
  installmentFrequency: liabilityInstallmentFrequencySchema
    .nullable()
    .optional(),
  documentationStatus: liabilityDocumentationStatusSchema.default("none"),
  certainty: liabilityCertaintySchema.default("confirmed"),
  paymentAccountId: z.string().min(1, "Select a payment account"),
  receivingAccountId: z.string().nullable().optional(),
  receivedDate: optionalDateSchema,
  notes: notesSchema,
});

export const createLiabilitySchema = withSharedRefinements(
  createLiabilityFieldsSchema,
)
  .refine(
    (values) =>
      Boolean(values.receivingAccountId) === Boolean(values.receivedDate),
    {
      message: "Enter the date money was received",
      path: ["receivedDate"],
    },
  )
  .refine(
    (values) =>
      !values.receivingAccountId ||
      values.liabilitySource === "informal_borrowing",
    {
      message: "Only informal borrowing can have a receiving account",
      path: ["receivingAccountId"],
    },
  );
export type CreateLiabilityInput = z.input<typeof createLiabilitySchema>;

const updateLiabilityFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  liabilitySource: liabilitySourceSchema,
  category: liabilityCategorySchema,
  counterpartyPersonId: z.string().nullable().optional(),
  counterpartyInstitutionId: z.string().nullable().optional(),
  dueDate: optionalDateSchema,
  chargesInterest: z.boolean().default(false),
  annualInterestRatePercent: z.string().trim().max(20).nullable().optional(),
  interestType: liabilityInterestTypeSchema.nullable().optional(),
  repaymentScheduleType:
    liabilityRepaymentScheduleTypeSchema.default("lump_sum"),
  installmentAmount: z.string().trim().max(30).nullable().optional(),
  installmentFrequency: liabilityInstallmentFrequencySchema
    .nullable()
    .optional(),
  documentationStatus: liabilityDocumentationStatusSchema.default("none"),
  certainty: liabilityCertaintySchema.default("confirmed"),
  paymentAccountId: z.string().min(1, "Select a payment account"),
  notes: notesSchema,
});

export const updateLiabilitySchema = withSharedRefinements(
  updateLiabilityFieldsSchema,
);
export type UpdateLiabilityInput = z.input<typeof updateLiabilitySchema>;

export type LiabilityFilters = {
  search?: string;
  liabilitySource?: LiabilitySource;
  status?: LiabilityStatus;
  certainty?: LiabilityCertainty;
};

/**
 * Records one payment. `confirmExcess` gates whether a principal component
 * exceeding the current outstanding balance is allowed — the action layer
 * computes the actual excess amount itself (never trusts a client-supplied
 * figure) and rejects the write unless this is true.
 */
export const recordLiabilityPaymentSchema = z.object({
  liabilityId: uuidSchema,
  paymentDate: isoDateStringSchema,
  principalComponent: z
    .string()
    .trim()
    .min(1, "Enter the principal component")
    .default("0"),
  interestComponent: z.string().trim().min(1).default("0"),
  confirmExcess: z.boolean().default(false),
  notes: notesSchema,
});
export type RecordLiabilityPaymentInput = z.input<
  typeof recordLiabilityPaymentSchema
>;

export const reverseLiabilityPaymentSchema = z.object({
  paymentId: uuidSchema,
  reversalReason: z
    .string()
    .trim()
    .min(1, "Explain why this payment is being reversed")
    .max(1000),
});
export type ReverseLiabilityPaymentInput = z.input<
  typeof reverseLiabilityPaymentSchema
>;

export const setLiabilityStatusSchema = z.object({
  liabilityId: uuidSchema,
  status: manualLiabilityStatusSchema,
});
export type SetLiabilityStatusInput = z.input<typeof setLiabilityStatusSchema>;
