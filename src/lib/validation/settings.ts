import { z } from "zod";
import { fullNameSchema, householdNameSchema } from "@/lib/validation/auth";

/**
 * Shared zod schemas for Settings forms (PROMPT 40) and their matching
 * Server Actions — same schema, client-side validation and server-side
 * re-validation, per docs/architecture.md §5.
 */

// Mirrors src/lib/validation/auth.ts's own currencyCodePattern — kept local
// rather than imported, per that file's own "dependency-free" convention.
const currencyCodePattern = /^[A-Za-z]{3}$/;
const currencyCodeSchema = z
  .string()
  .regex(currencyCodePattern, "Must be a 3-letter ISO 4217 currency code")
  .transform((value) => value.toUpperCase());

/** Mirrors src/lib/validation/goals.ts's own annualRateSchema bounds exactly, so a household default can never drift from what a goal itself would accept. */
const annualRateSchema = z
  .number()
  .gt(-1, "Must be greater than -100%")
  .lte(10, "Must be 1000% or less");

export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
  timezone: z.string().min(1, "Timezone is required"),
  locale: z.string().min(1, "Locale is required"),
  defaultCurrencyCode: currencyCodeSchema,
});
export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export const updatePrivacyPreferencesSchema = z.object({
  privacyDefaultConcealed: z.boolean(),
  privacyConcealDashboardOnLaunch: z.boolean(),
  privacyScreenshotSensitiveMode: z.boolean(),
  // null = "off" — PROMPT 40: inactivity timeout is a placeholder, not yet
  // enforced anywhere; still persisted so the preference survives.
  privacyInactivityTimeoutMinutes: z
    .number()
    .int("Must be a whole number")
    .positive("Must be greater than 0")
    .nullable(),
  notificationsIncludeAmounts: z.boolean(),
});
export type UpdatePrivacyPreferencesInput = z.input<
  typeof updatePrivacyPreferencesSchema
>;

export const updateHouseholdSettingsSchema = z.object({
  name: householdNameSchema,
  baseCurrencyCode: currencyCodeSchema,
  timezone: z.string().min(1, "Timezone is required"),
  financialMonthStartDay: z
    .number({ error: "Must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be between 1 and 28")
    .max(28, "Must be between 1 and 28"),
  defaultGoalAnnualInflationRate: annualRateSchema,
  defaultGoalAnnualExpectedReturn: annualRateSchema,
});
export type UpdateHouseholdSettingsInput = z.input<
  typeof updateHouseholdSettingsSchema
>;

/**
 * "Deliberate confirmation" for archiving a household (PROMPT 40's one
 * "dangerous action" — safe by construction: it only ever sets
 * households.deleted_at, never deletes a row). Requires typing the
 * household's exact current name, the same "typed confirmation" pattern
 * PROMPT 33's ReopenClosingDialog established for a different irreversible-
 * feeling action.
 */
export const archiveHouseholdSchema = z.object({
  confirmName: z.string().min(1, "Type the household name to confirm"),
});
export type ArchiveHouseholdInput = z.input<typeof archiveHouseholdSchema>;

export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export function isAllowedAvatarMimeType(mimeType: string): boolean {
  return ALLOWED_AVATAR_MIME_TYPES.includes(mimeType);
}
