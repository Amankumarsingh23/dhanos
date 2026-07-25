import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the financial goals feature (PROMPT 30,
 * src/features/goals) — see supabase/migrations/20260723140000_goals.sql
 * for the matching column definitions/check constraints.
 */

export const GOAL_TYPES = [
  "emergency_fund",
  "house_construction",
  "home_purchase",
  "land_purchase",
  "sister_marriage",
  "personal_marriage",
  "education",
  "business_launch",
  "vehicle",
  "healthcare_reserve",
  "parents_retirement",
  "travel",
  "renovation",
  "debt_closure",
  "custom",
] as const;

export const goalTypeSchema = z.enum(GOAL_TYPES);
export type GoalType = z.infer<typeof goalTypeSchema>;

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  emergency_fund: "Emergency fund",
  house_construction: "House construction",
  home_purchase: "Home purchase",
  land_purchase: "Land purchase",
  sister_marriage: "Sister's marriage",
  personal_marriage: "Personal marriage",
  education: "Education",
  business_launch: "Business launch",
  vehicle: "Vehicle",
  healthcare_reserve: "Healthcare reserve",
  parents_retirement: "Parents' retirement",
  travel: "Travel",
  renovation: "Renovation",
  debt_closure: "Debt closure",
  custom: "Custom",
};

export const goalPrioritySchema = z.enum(["high", "medium", "low"]);
export type GoalPriority = z.infer<typeof goalPrioritySchema>;

export const GOAL_PRIORITY_LABELS: Record<GoalPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const goalFlexibilitySchema = z.enum([
  "fixed",
  "somewhat_flexible",
  "flexible",
]);
export type GoalFlexibility = z.infer<typeof goalFlexibilitySchema>;

export const GOAL_FLEXIBILITY_LABELS: Record<GoalFlexibility, string> = {
  fixed: "Fixed — date/amount cannot move",
  somewhat_flexible: "Somewhat flexible",
  flexible: "Flexible — date/amount can move",
};

export const goalStatusSchema = z.enum([
  "active",
  "paused",
  "achieved",
  "abandoned",
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Active",
  paused: "Paused",
  achieved: "Achieved",
  abandoned: "Abandoned",
};

export const goalFundingSourceTypeSchema = z.enum([
  "account",
  "investment_holding",
]);
export type GoalFundingSourceType = z.infer<typeof goalFundingSourceTypeSchema>;

const notesSchema = z.string().trim().max(2000).nullable().optional();

/** A rate expressed as a decimal, e.g. 0.06 for 6%/year — bounds mirror validateAnnualRate's own (-100%, 1000%] range so a goal assumption can never silently drift from what the calculators consider a sane rate. */
const annualRateSchema = z
  .number()
  .gt(-1, "Must be greater than -100%")
  .lte(10, "Must be 1000% or less");

export const goalFundingSourceInputSchema = z
  .object({
    sourceType: goalFundingSourceTypeSchema,
    accountId: z.string().nullable().optional(),
    investmentHoldingId: z.string().nullable().optional(),
    allocationPercentage: z
      .number()
      .gt(0, "Must be greater than 0%")
      .lte(100, "Cannot exceed 100%"),
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
export type GoalFundingSourceInput = z.input<
  typeof goalFundingSourceInputSchema
>;

const goalFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  goalType: goalTypeSchema,
  targetAmount: positiveDecimalAmountSchema("Enter the target amount"),
  currencyCode: currencyCodeSchema,
  targetDate: isoDateStringSchema,
  manualCurrentSavedAmount: z.string().trim().max(30).nullable().optional(),
  annualInflationRate: annualRateSchema.default(0.06),
  annualExpectedReturn: annualRateSchema.default(0),
  priority: goalPrioritySchema.default("medium"),
  flexibility: goalFlexibilitySchema.default("somewhat_flexible"),
  notes: notesSchema,
});

export const createGoalSchema = goalFieldsSchema.and(
  z.object({
    responsiblePersonIds: z.array(z.string()).default([]),
    fundingSources: z.array(goalFundingSourceInputSchema).default([]),
  }),
);
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = goalFieldsSchema;
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

export const setGoalStatusSchema = z.object({
  goalId: uuidSchema,
  status: goalStatusSchema,
});
export type SetGoalStatusInput = z.input<typeof setGoalStatusSchema>;

export const addGoalResponsiblePersonSchema = z.object({
  goalId: uuidSchema,
  personId: uuidSchema,
});
export type AddGoalResponsiblePersonInput = z.input<
  typeof addGoalResponsiblePersonSchema
>;

export const removeGoalResponsiblePersonSchema = z.object({
  goalResponsiblePersonId: uuidSchema,
});
export type RemoveGoalResponsiblePersonInput = z.input<
  typeof removeGoalResponsiblePersonSchema
>;

export const addGoalFundingSourceSchema = z.object({
  goalId: uuidSchema,
  fundingSource: goalFundingSourceInputSchema,
});
export type AddGoalFundingSourceInput = z.input<
  typeof addGoalFundingSourceSchema
>;

export const removeGoalFundingSourceSchema = z.object({
  goalFundingSourceId: uuidSchema,
});
export type RemoveGoalFundingSourceInput = z.input<
  typeof removeGoalFundingSourceSchema
>;

export const deleteGoalSchema = z.object({
  goalId: uuidSchema,
});
export type DeleteGoalInput = z.input<typeof deleteGoalSchema>;

export type GoalFilters = {
  search?: string;
  goalType?: GoalType;
  status?: GoalStatus;
  priority?: GoalPriority;
};
