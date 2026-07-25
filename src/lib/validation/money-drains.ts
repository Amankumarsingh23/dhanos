import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the money drains feature (PROMPT 29,
 * src/features/money-drains) — see
 * supabase/migrations/20260723130000_money_drains.sql for the matching
 * column definitions/check constraints. Tracks depreciating and
 * money-draining items: subscriptions, memberships, vehicles, unused
 * services, rented space, gadgets, maintenance-heavy assets, contractual
 * commitments, recurring fees.
 */

export const DRAIN_TYPES = [
  "subscription",
  "membership",
  "vehicle",
  "unused_service",
  "rented_space",
  "gadget",
  "maintenance_heavy_asset",
  "contractual_commitment",
  "recurring_fee",
  "other",
] as const;

export const drainTypeSchema = z.enum(DRAIN_TYPES);
export type DrainType = z.infer<typeof drainTypeSchema>;

export const DRAIN_TYPE_LABELS: Record<DrainType, string> = {
  subscription: "Subscription",
  membership: "Membership",
  vehicle: "Vehicle",
  unused_service: "Unused service",
  rented_space: "Rented space",
  gadget: "Gadget",
  maintenance_heavy_asset: "Maintenance-heavy asset",
  contractual_commitment: "Contractual commitment",
  recurring_fee: "Recurring fee",
  other: "Other",
};

export const drainCostFrequencySchema = z.enum([
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "one_time",
  "irregular",
]);
export type DrainCostFrequency = z.infer<typeof drainCostFrequencySchema>;

export const DRAIN_COST_FREQUENCY_LABELS: Record<DrainCostFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
  one_time: "One-time",
  irregular: "Irregular",
};

/** No default on purpose — PROMPT 29: "estimated usage is visibly user-entered," every row requires an explicit choice, never a silently-assumed one. */
export const drainUsageFrequencySchema = z.enum([
  "daily",
  "weekly",
  "monthly",
  "occasionally",
  "rarely",
  "never",
]);
export type DrainUsageFrequency = z.infer<typeof drainUsageFrequencySchema>;

export const DRAIN_USAGE_FREQUENCY_LABELS: Record<DrainUsageFrequency, string> =
  {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    occasionally: "Occasionally",
    rarely: "Rarely",
    never: "Never",
  };

export const drainStatusSchema = z.enum(["active", "paused", "cancelled"]);
export type DrainStatus = z.infer<typeof drainStatusSchema>;

export const DRAIN_STATUS_LABELS: Record<DrainStatus, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();
const optionalUuidSchema = uuidSchema.nullable().optional();

export const moneyDrainFieldsSchema = z.object({
  item: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(200, "Name is too long"),
  drainType: drainTypeSchema,
  costFrequency: drainCostFrequencySchema,
  costAmount: positiveDecimalAmountSchema("Enter the cost"),
  currencyCode: currencyCodeSchema,
  currentValue: z.string().trim().max(30).nullable().optional(),
  usageFrequency: drainUsageFrequencySchema,
  isEssential: z.boolean().default(false),
  cancellationTerms: notesSchema,
  nextRenewalDate: optionalDateSchema,
  linkedAccountId: optionalUuidSchema,
  linkedAssetId: optionalUuidSchema,
  linkedRecurringRuleId: optionalUuidSchema,
  notes: notesSchema,
});
export type MoneyDrainFieldsInput = z.input<typeof moneyDrainFieldsSchema>;

export const createMoneyDrainSchema = moneyDrainFieldsSchema;
export type CreateMoneyDrainInput = z.input<typeof createMoneyDrainSchema>;

export const updateMoneyDrainSchema = moneyDrainFieldsSchema;
export type UpdateMoneyDrainInput = z.input<typeof updateMoneyDrainSchema>;

export const setMoneyDrainStatusSchema = z.object({
  moneyDrainId: uuidSchema,
  status: drainStatusSchema,
});
export type SetMoneyDrainStatusInput = z.input<
  typeof setMoneyDrainStatusSchema
>;

export const deleteMoneyDrainSchema = z.object({
  moneyDrainId: uuidSchema,
});
export type DeleteMoneyDrainInput = z.input<typeof deleteMoneyDrainSchema>;

export type MoneyDrainFilters = {
  search?: string;
  drainType?: DrainType;
  status?: DrainStatus;
  usageFrequency?: DrainUsageFrequency;
  isEssential?: boolean;
};
