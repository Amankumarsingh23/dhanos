import { z } from "zod";
import { isoDateStringSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the People feature (src/features/people) — see
 * docs/financial-domain-model.md §2 and
 * supabase/migrations/20260721060001_people.sql for the matching column
 * definitions/check constraints this schema must stay in sync with.
 */

export const relationshipTypeSchema = z.enum([
  "self",
  "parent",
  "sibling",
  "spouse",
  "dependant",
  "lender",
  "borrower",
  "nominee",
  "co_owner",
  "other",
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  self: "Self",
  parent: "Parent",
  sibling: "Sibling",
  spouse: "Spouse",
  dependant: "Dependant",
  lender: "Lender",
  borrower: "Borrower",
  nominee: "Nominee",
  co_owner: "Co-owner",
  other: "Other",
};

const displayNameSchema = z
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

export const personInputSchema = z.object({
  displayName: displayNameSchema,
  relationshipType: relationshipTypeSchema,
  // Nullable rather than a required field with an empty-string sentinel —
  // birth date is optional per the PROMPT 6 brief ("avoid unnecessarily
  // sensitive information in v1").
  birthDate: isoDateStringSchema.nullable().optional(),
  notes: notesSchema,
});
export type PersonInput = z.infer<typeof personInputSchema>;

export const personUpdateSchema = personInputSchema;
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>;

export type PersonFilters = {
  search?: string;
  relationshipType?: RelationshipType;
  includeArchived?: boolean;
};
