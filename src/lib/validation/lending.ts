import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the lending/receivables feature (PROMPT 23,
 * src/features/lending) — see supabase/migrations/20260722160000_lending.sql
 * for the matching column definitions/check constraints. Unlike loans
 * (PROMPT 21), a lending's amount/disbursement fields are only ever set
 * once, at creation (create_lending) — there is no separate "sanctioned but
 * not yet disbursed" stage, so lendingUpdateSchema deliberately omits them.
 */

export const lendingInterestTypeSchema = z.enum(["simple", "compound"]);
export type LendingInterestType = z.infer<typeof lendingInterestTypeSchema>;

export const LENDING_INTEREST_TYPE_LABELS: Record<LendingInterestType, string> =
  {
    simple: "Simple",
    compound: "Compound",
  };

export const lendingRepaymentScheduleTypeSchema = z.enum([
  "lump_sum",
  "installments",
  "on_demand",
  "flexible",
]);
export type LendingRepaymentScheduleType = z.infer<
  typeof lendingRepaymentScheduleTypeSchema
>;

export const LENDING_REPAYMENT_SCHEDULE_TYPE_LABELS: Record<
  LendingRepaymentScheduleType,
  string
> = {
  lump_sum: "Lump sum",
  installments: "Installments",
  on_demand: "On demand",
  flexible: "Flexible",
};

export const lendingInstallmentFrequencySchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);
export type LendingInstallmentFrequency = z.infer<
  typeof lendingInstallmentFrequencySchema
>;

export const LENDING_INSTALLMENT_FREQUENCY_LABELS: Record<
  LendingInstallmentFrequency,
  string
> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export const lendingRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type LendingRiskLevel = z.infer<typeof lendingRiskLevelSchema>;

export const LENDING_RISK_LEVEL_LABELS: Record<LendingRiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const lendingStatusSchema = z.enum([
  "active",
  "partially_repaid",
  "repaid",
  "delayed",
  "disputed",
  "written_off",
]);
export type LendingStatus = z.infer<typeof lendingStatusSchema>;

export const LENDING_STATUS_LABELS: Record<LendingStatus, string> = {
  active: "Active",
  partially_repaid: "Partially repaid",
  repaid: "Repaid",
  delayed: "Delayed",
  disputed: "Disputed",
  written_off: "Written off",
};

/** The subset of statuses a household can switch to manually — repaid/partially_repaid are also reached automatically via record_lending_repayment. */
export const manualLendingStatusSchema = z.enum([
  "active",
  "delayed",
  "disputed",
  "written_off",
]);
export type ManualLendingStatus = z.infer<typeof manualLendingStatusSchema>;

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

/**
 * Fields collected once, at creation (create_lending) — the amount lent,
 * disbursement date, and source account are never edited afterward, since
 * they're already reflected in the one-time lending_disbursement
 * transaction the RPC wrote alongside them.
 */
export const createLendingSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(200, "Name is too long"),
    borrowerPersonId: z.string().nullable().optional(),
    borrowerInstitutionId: z.string().nullable().optional(),
    sourceAccountId: z.string().min(1, "Select a source account"),
    amountLent: z.string().trim().min(1, "Enter the amount lent"),
    currencyCode: currencyCodeSchema,
    disbursedDate: isoDateStringSchema,
    purpose: notesSchema,
    chargesInterest: z.boolean().default(false),
    annualInterestRatePercent: z.string().trim().max(20).nullable().optional(),
    interestType: lendingInterestTypeSchema.nullable().optional(),
    expectedRepaymentDate: optionalDateSchema,
    repaymentScheduleType:
      lendingRepaymentScheduleTypeSchema.default("lump_sum"),
    installmentAmount: z.string().trim().max(30).nullable().optional(),
    installmentFrequency: lendingInstallmentFrequencySchema
      .nullable()
      .optional(),
    riskLevel: lendingRiskLevelSchema.default("medium"),
    notes: notesSchema,
  })
  .refine(
    (values) =>
      Boolean(values.borrowerPersonId) || Boolean(values.borrowerInstitutionId),
    {
      message: "Select a borrower person or company",
      path: ["borrowerPersonId"],
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
export type CreateLendingInput = z.input<typeof createLendingSchema>;

/**
 * Fields editable after creation — deliberately excludes amountLent,
 * disbursedDate, sourceAccountId, currencyCode, and status (status changes
 * go through their own dedicated action, same reasoning as loans.ts).
 */
export const updateLendingSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(200, "Name is too long"),
    borrowerPersonId: z.string().nullable().optional(),
    borrowerInstitutionId: z.string().nullable().optional(),
    purpose: notesSchema,
    chargesInterest: z.boolean().default(false),
    annualInterestRatePercent: z.string().trim().max(20).nullable().optional(),
    interestType: lendingInterestTypeSchema.nullable().optional(),
    expectedRepaymentDate: optionalDateSchema,
    repaymentScheduleType:
      lendingRepaymentScheduleTypeSchema.default("lump_sum"),
    installmentAmount: z.string().trim().max(30).nullable().optional(),
    installmentFrequency: lendingInstallmentFrequencySchema
      .nullable()
      .optional(),
    riskLevel: lendingRiskLevelSchema.default("medium"),
    notes: notesSchema,
  })
  .refine(
    (values) =>
      Boolean(values.borrowerPersonId) || Boolean(values.borrowerInstitutionId),
    {
      message: "Select a borrower person or company",
      path: ["borrowerPersonId"],
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
export type UpdateLendingInput = z.input<typeof updateLendingSchema>;

export type LendingFilters = {
  search?: string;
  status?: LendingStatus;
  riskLevel?: LendingRiskLevel;
};

/**
 * Records one repayment. `confirmExcess` gates whether a principal
 * component exceeding the current outstanding balance is allowed — the
 * action layer computes the actual excess amount itself (never trusts a
 * client-supplied figure) and rejects the write unless this is true
 * (PROMPT 23, mirroring PROMPT 21's overpayment handling).
 */
export const recordLendingRepaymentSchema = z.object({
  lendingId: uuidSchema,
  repaymentDate: isoDateStringSchema,
  principalComponent: z
    .string()
    .trim()
    .min(1, "Enter the principal component")
    .default("0"),
  interestComponent: z.string().trim().min(1).default("0"),
  confirmExcess: z.boolean().default(false),
  notes: notesSchema,
});
export type RecordLendingRepaymentInput = z.input<
  typeof recordLendingRepaymentSchema
>;

export const reverseLendingRepaymentSchema = z.object({
  repaymentId: uuidSchema,
  reversalReason: z
    .string()
    .trim()
    .min(1, "Explain why this repayment is being reversed")
    .max(1000),
});
export type ReverseLendingRepaymentInput = z.input<
  typeof reverseLendingRepaymentSchema
>;

export const setLendingStatusSchema = z.object({
  lendingId: uuidSchema,
  status: manualLendingStatusSchema,
});
export type SetLendingStatusInput = z.input<typeof setLendingStatusSchema>;
