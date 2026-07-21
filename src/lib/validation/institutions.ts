import { z } from "zod";

/**
 * Shared zod schemas for the Institutions feature (src/features/institutions)
 * — see docs/financial-domain-model.md §2 and
 * supabase/migrations/20260721060002_institutions.sql +
 * 20260721070000_institutions_contact_fields.sql for the matching column
 * definitions/check constraints this schema must stay in sync with.
 */

export const institutionTypeSchema = z.enum([
  "bank",
  "wallet",
  "investment_platform",
  "insurer",
  "lender",
  "employer",
  "business",
  "government",
  "staking_platform",
  "other",
]);
export type InstitutionType = z.infer<typeof institutionTypeSchema>;

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  bank: "Bank",
  wallet: "Wallet",
  investment_platform: "Investment platform",
  insurer: "Insurer",
  lender: "Lender",
  employer: "Employer",
  business: "Business",
  government: "Government",
  staking_platform: "Staking platform",
  other: "Other",
};

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name is too long");

// Loose on purpose: accepts a bare domain ("hdfcbank.com") or a full URL
// with protocol/path — good enough to catch typos without rejecting a
// shape the pattern didn't anticipate. Domain extraction for duplicate
// detection happens separately (see duplicate-detection.ts), not here.
const WEBSITE_PATTERN =
  /^(https?:\/\/)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+(:\d+)?(\/.*)?$/i;

const websiteSchema = z
  .string()
  .trim()
  .max(300, "Website is too long")
  .refine((value) => WEBSITE_PATTERN.test(value), "Enter a valid website URL")
  .nullable()
  .optional();

// Loose on purpose: intl formatting varies (spaces, dashes, parens,
// leading +). Normalized only for duplicate detection, never rewritten.
const PHONE_PATTERN = /^[+()\-.\s\d]{6,30}$/;

const supportPhoneSchema = z
  .string()
  .trim()
  .refine((value) => PHONE_PATTERN.test(value), "Enter a valid phone number")
  .nullable()
  .optional();

const supportEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .nullable()
  .optional();

const platformNameSchema = z
  .string()
  .trim()
  .max(200, "Platform name is too long")
  .nullable()
  .optional();

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .nullable()
  .optional();

const institutionFieldsSchema = z.object({
  name: nameSchema,
  institutionType: institutionTypeSchema,
  website: websiteSchema,
  platformName: platformNameSchema,
  supportPhone: supportPhoneSchema,
  supportEmail: supportEmailSchema,
  notes: notesSchema,
});

export const institutionInputSchema = institutionFieldsSchema.extend({
  // When a duplicate warning was already shown and the user chose to
  // proceed anyway, the client resubmits with this set — see
  // src/features/institutions/actions.ts. Never used to skip validation,
  // only to skip the *warning*.
  confirmDuplicate: z.boolean().optional().default(false),
});
// z.input (not z.infer/output): this is the type of what a caller — a form,
// a Server Action's parameter — passes in *before* zod fills in
// confirmDuplicate's default, so `confirmDuplicate` here is legitimately
// optional. Inside runHouseholdMutation's `run`, the parsed value is
// z.infer<typeof institutionInputSchema>, where it's a required boolean —
// see src/lib/mutations/index.ts's generic `MutationContext<z.infer<TSchema>>`.
export type InstitutionInput = z.input<typeof institutionInputSchema>;

export const institutionUpdateSchema = institutionFieldsSchema;
export type InstitutionUpdateInput = z.infer<typeof institutionUpdateSchema>;

export type InstitutionFilters = {
  search?: string;
  institutionType?: InstitutionType;
  includeArchived?: boolean;
};
