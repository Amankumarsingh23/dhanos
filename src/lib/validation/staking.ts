import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";
import { investmentAssetClassSchema } from "@/lib/validation/investments";
import { CREATE_NEW_OPTION_VALUE } from "@/lib/validation/investment-sips";

/**
 * Shared zod schemas for the staking / daily-value-tracking feature
 * (PROMPT 19, src/features/staking) — see
 * supabase/migrations/20260722130000_staking_positions.sql for the
 * matching column definitions/check constraints.
 */

export { CREATE_NEW_OPTION_VALUE };

export const stakingPositionStatusSchema = z.enum([
  "active",
  "paused",
  "closed",
]);
export type StakingPositionStatus = z.infer<typeof stakingPositionStatusSchema>;

export const STAKING_POSITION_STATUS_LABELS: Record<
  StakingPositionStatus,
  string
> = {
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};

export const stakingSnapshotSourceSchema = z.enum([
  "manual",
  "imported",
  "institution_statement",
  "calculated",
]);
export type StakingSnapshotSource = z.infer<typeof stakingSnapshotSourceSchema>;

export const STAKING_SNAPSHOT_SOURCE_LABELS: Record<
  StakingSnapshotSource,
  string
> = {
  manual: "Manually entered",
  imported: "Imported",
  institution_statement: "From a platform statement",
  calculated: "Calculated",
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

const optionalDateSchema = isoDateStringSchema.nullable().optional();

const stakingPositionFieldsSchema = z
  .object({
    name: nameSchema,
    investmentAssetId: z
      .string()
      .min(1, "Select or create an investment asset"),
    newAssetName: z.string().trim().max(200).nullable().optional(),
    newAssetClass: investmentAssetClassSchema.nullable().optional(),
    investmentAccountId: z.string().min(1, "Select or create a platform"),
    newPlatformName: z.string().trim().max(200).nullable().optional(),
    newPlatformInstitutionId: uuidSchema.nullable().optional(),
    openingPrincipal: positiveDecimalAmountSchema(
      "Enter the opening principal",
    ),
    openingDate: isoDateStringSchema,
    currencyCode: currencyCodeSchema,
    // A whole-number-style percentage input (e.g. "0.05" for 0.05%/day) —
    // converted to the decimal fraction the database/calculations expect
    // (divided by 100) at the action layer, then bounds-checked by
    // validateExpectedDailyRate. Never required — PROMPT 19 lists it as
    // optional, and it must never be presented as a guarantee.
    expectedDailyRatePercent: z.string().trim().max(20).nullable().optional(),
    lockInEndDate: optionalDateSchema,
    feeNotes: z.string().trim().max(2000).nullable().optional(),
    riskNotes: z.string().trim().max(2000).nullable().optional(),
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
  .refine(
    (values) =>
      !values.lockInEndDate || values.lockInEndDate >= values.openingDate,
    {
      message: "Lock-in end date cannot be before the opening date",
      path: ["lockInEndDate"],
    },
  );

export const stakingPositionInputSchema = stakingPositionFieldsSchema;
export type StakingPositionInput = z.input<typeof stakingPositionInputSchema>;

export const stakingPositionUpdateSchema = stakingPositionFieldsSchema;
export type StakingPositionUpdateInput = z.input<
  typeof stakingPositionUpdateSchema
>;

export type StakingPositionFilters = {
  search?: string;
  status?: StakingPositionStatus;
};

export const stakingStatusActionSchema = z.object({
  stakingPositionId: uuidSchema,
});
export type StakingStatusActionInput = z.input<
  typeof stakingStatusActionSchema
>;

/**
 * Records one day's snapshot. `reward` is deliberately not collected here
 * — it is derived server-side as `closing - opening - contribution +
 * withdrawal + fee` (see recordDailySnapshotAction), so the closing
 * value's equation always balances by construction rather than asking
 * the household to do that arithmetic themselves and risk a mismatch.
 * `adjustmentReason` is required by the action layer (not zod, which
 * can't see whether a snapshot already exists for this date) whenever
 * this call turns out to be a revision > 1 for an already-recorded date.
 */
export const recordStakingSnapshotSchema = z.object({
  stakingPositionId: uuidSchema,
  snapshotDate: isoDateStringSchema,
  openingValue: positiveDecimalAmountSchema("Enter the opening value"),
  contribution: z.string().trim().min(1).default("0"),
  withdrawal: z.string().trim().min(1).default("0"),
  fee: z.string().trim().min(1).default("0"),
  closingValue: positiveDecimalAmountSchema("Enter the closing value"),
  manuallyConfirmed: z.boolean().default(true),
  source: stakingSnapshotSourceSchema.default("manual"),
  notes: notesSchema,
  adjustmentReason: z.string().trim().max(1000).nullable().optional(),
});
export type RecordStakingSnapshotInput = z.input<
  typeof recordStakingSnapshotSchema
>;
