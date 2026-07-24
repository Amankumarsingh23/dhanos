import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the loans/debt feature (PROMPT 21,
 * src/features/loans) — see supabase/migrations/20260722150000_loans.sql
 * for the matching column definitions/check constraints. Unlike
 * investment_sips/staking_positions, loans' lender/borrower/educational-
 * institution fields never need an inline "+ create new" flow —
 * Institutions and People already have full management UIs (PROMPT 8), so
 * these are always plain selects from an existing list.
 */

export const loanTypeSchema = z.enum([
  "education",
  "personal",
  "business",
  "home",
  "vehicle",
  "gold",
  "credit_card",
  "family",
  "informal",
  "other",
]);
export type LoanType = z.infer<typeof loanTypeSchema>;

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  education: "Education",
  personal: "Personal",
  business: "Business",
  home: "Home",
  vehicle: "Vehicle",
  gold: "Gold",
  credit_card: "Credit card",
  family: "Family",
  informal: "Informal",
  other: "Other",
};

export const loanInterestTypeSchema = z.enum(["fixed", "floating"]);
export type LoanInterestType = z.infer<typeof loanInterestTypeSchema>;

export const LOAN_INTEREST_TYPE_LABELS: Record<LoanInterestType, string> = {
  fixed: "Fixed",
  floating: "Floating",
};

export const loanStatusSchema = z.enum([
  "pending_disbursement",
  "active",
  "closed",
  "defaulted",
  "settled",
]);
export type LoanStatus = z.infer<typeof loanStatusSchema>;

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending_disbursement: "Pending disbursement",
  active: "Active",
  closed: "Closed",
  defaulted: "Defaulted",
  settled: "Settled",
};

/** The subset of statuses a household can switch to manually — pending_disbursement and active are only reached via record_loan_disbursement/record_loan_payment. */
export const manualLoanStatusSchema = z.enum([
  "active",
  "closed",
  "defaulted",
  "settled",
]);
export type ManualLoanStatus = z.infer<typeof manualLoanStatusSchema>;

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

const loanFieldsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(200, "Name is too long"),
    loanType: loanTypeSchema,
    lenderInstitutionId: z.string().nullable().optional(),
    lenderPersonId: z.string().nullable().optional(),
    borrowerPersonId: z.string().min(1, "Select a borrower"),
    coBorrowerPersonId: z.string().nullable().optional(),
    originalPrincipal: z.string().trim().min(1, "Enter the original principal"),
    currencyCode: currencyCodeSchema,
    annualInterestRatePercent: z
      .string()
      .trim()
      .min(1, "Enter the annual interest rate"),
    interestType: loanInterestTypeSchema,
    emiAmount: z.string().trim().max(30).nullable().optional(),
    startDate: isoDateStringSchema,
    repaymentStartDate: isoDateStringSchema,
    maturityDate: optionalDateSchema,
    paymentAccountId: z.string().min(1, "Select a payment account"),
    collateral: notesSchema,
    notes: notesSchema,
    // Education-loan fields — collected only when loanType === 'education',
    // but validated the same regardless (see the migration's own comment:
    // nullable and usable at the schema layer, UI-gated by loanType).
    educationalInstitutionId: z.string().nullable().optional(),
    course: z.string().trim().max(200).nullable().optional(),
    studyStartDate: optionalDateSchema,
    studyEndDate: optionalDateSchema,
    moratorium: z.boolean().default(false),
    moratoriumEndDate: optionalDateSchema,
    interestSubsidy: z.boolean().default(false),
    interestSubsidyNotes: notesSchema,
  })
  .refine(
    (values) =>
      Boolean(values.lenderInstitutionId) || Boolean(values.lenderPersonId),
    {
      message: "Select a lender institution or a lender person",
      path: ["lenderInstitutionId"],
    },
  )
  .refine((values) => values.repaymentStartDate >= values.startDate, {
    message: "Repayment start date cannot be before the start date",
    path: ["repaymentStartDate"],
  })
  .refine(
    (values) =>
      !values.maturityDate || values.maturityDate >= values.repaymentStartDate,
    {
      message: "Maturity date cannot be before the repayment start date",
      path: ["maturityDate"],
    },
  )
  .refine(
    (values) =>
      !values.studyStartDate ||
      !values.studyEndDate ||
      values.studyEndDate >= values.studyStartDate,
    {
      message: "Study end date cannot be before the study start date",
      path: ["studyEndDate"],
    },
  )
  .refine((values) => !values.moratorium || Boolean(values.moratoriumEndDate), {
    message: "Enter a moratorium end date",
    path: ["moratoriumEndDate"],
  });

export const loanInputSchema = loanFieldsSchema;
export type LoanInput = z.input<typeof loanInputSchema>;

export const loanUpdateSchema = loanFieldsSchema;
export type LoanUpdateInput = z.input<typeof loanUpdateSchema>;

export type LoanFilters = {
  search?: string;
  loanType?: LoanType;
  status?: LoanStatus;
};

export const recordLoanDisbursementSchema = z.object({
  loanId: uuidSchema,
  disbursementDate: isoDateStringSchema,
  amount: z.string().trim().min(1, "Enter the disbursed amount"),
  notes: notesSchema,
});
export type RecordLoanDisbursementInput = z.input<
  typeof recordLoanDisbursementSchema
>;

/**
 * Records one loan payment. `confirmOverpayment` gates whether a principal
 * component exceeding the current outstanding balance is allowed — the
 * action layer computes the actual overpayment amount itself (never
 * trusts a client-supplied figure) and rejects the write unless this is
 * true (PROMPT 21: "cannot become negative without explicit overpayment
 * handling").
 */
export const recordLoanPaymentSchema = z.object({
  loanId: uuidSchema,
  paymentDate: isoDateStringSchema,
  principalComponent: z
    .string()
    .trim()
    .min(1, "Enter the principal component")
    .default("0"),
  interestComponent: z.string().trim().min(1).default("0"),
  feeComponent: z.string().trim().min(1).default("0"),
  penaltyComponent: z.string().trim().min(1).default("0"),
  confirmOverpayment: z.boolean().default(false),
  notes: notesSchema,
});
export type RecordLoanPaymentInput = z.input<typeof recordLoanPaymentSchema>;

export const reverseLoanPaymentSchema = z.object({
  paymentId: uuidSchema,
  reversalReason: z
    .string()
    .trim()
    .min(1, "Explain why this payment is being reversed")
    .max(1000),
});
export type ReverseLoanPaymentInput = z.input<typeof reverseLoanPaymentSchema>;

export const setLoanStatusSchema = z.object({
  loanId: uuidSchema,
  status: manualLoanStatusSchema,
});
export type SetLoanStatusInput = z.input<typeof setLoanStatusSchema>;
