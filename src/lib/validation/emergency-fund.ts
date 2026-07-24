import { z } from "zod";
import { uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the emergency fund planner (PROMPT 31,
 * src/features/emergency-fund) — see
 * supabase/migrations/20260723150000_emergency_fund.sql for the matching
 * column definitions/check constraints. Exactly one plan per household —
 * see docs/financial-domain-model.md's EmergencyFundPlan entry.
 */

const notesSchema = z.string().trim().max(2000).nullable().optional();

export const saveEmergencyFundPlanSchema = z.object({
  coverageTargetMonths: z
    .number()
    .gt(0, "Must be greater than 0")
    .lte(60, "Must be 60 months or less"),
  dependantsCount: z
    .number()
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(50, "Must be 50 or fewer"),
  notes: notesSchema,
});
export type SaveEmergencyFundPlanInput = z.input<
  typeof saveEmergencyFundPlanSchema
>;

export const emergencyFundSourceTypeSchema = z.enum([
  "account",
  "investment_holding",
]);
export type EmergencyFundSourceType = z.infer<
  typeof emergencyFundSourceTypeSchema
>;

export const setEmergencyFundSourceOverrideSchema = z
  .object({
    emergencyFundPlanId: uuidSchema,
    sourceType: emergencyFundSourceTypeSchema,
    accountId: z.string().nullable().optional(),
    investmentHoldingId: z.string().nullable().optional(),
    isIncluded: z.boolean(),
  })
  .refine(
    (value) =>
      value.sourceType === "account"
        ? Boolean(value.accountId) && !value.investmentHoldingId
        : Boolean(value.investmentHoldingId) && !value.accountId,
    {
      message: "Select exactly one account or investment holding",
      path: ["accountId"],
    },
  );
export type SetEmergencyFundSourceOverrideInput = z.input<
  typeof setEmergencyFundSourceOverrideSchema
>;

export const clearEmergencyFundSourceOverrideSchema = z.object({
  emergencyFundPlanId: uuidSchema,
  sourceType: emergencyFundSourceTypeSchema,
  accountId: z.string().nullable().optional(),
  investmentHoldingId: z.string().nullable().optional(),
});
export type ClearEmergencyFundSourceOverrideInput = z.input<
  typeof clearEmergencyFundSourceOverrideSchema
>;
