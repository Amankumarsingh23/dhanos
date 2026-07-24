import { z } from "zod";
import { isoDateStringSchema, uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the financial documents vault (PROMPT 34,
 * src/features/documents) — see
 * supabase/migrations/20260723180000_documents_vault.sql for the matching
 * column definitions/check constraints. Distinct from
 * src/lib/validation/assets.ts's attachAssetDocumentSchema and friends,
 * which finalize an upload against `attachments` (one entity, no category/
 * expiry/checksum) rather than `documents` (see the migration's file header
 * for why the two tables are separate).
 */

export const DOCUMENT_CATEGORIES = [
  "bank_statement",
  "salary_slip",
  "loan_agreement",
  "education_loan_document",
  "insurance_policy",
  "premium_receipt",
  "claim_document",
  "investment_statement",
  "tax_document",
  "property_paper",
  "valuation_report",
  "lending_agreement",
  "nominee_record",
  "invoice",
  "receipt",
  "identity_document",
  "other",
] as const;
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  bank_statement: "Bank statement",
  salary_slip: "Salary slip",
  loan_agreement: "Loan agreement",
  education_loan_document: "Education-loan document",
  insurance_policy: "Insurance policy",
  premium_receipt: "Premium receipt",
  claim_document: "Claim document",
  investment_statement: "Investment statement",
  tax_document: "Tax document",
  property_paper: "Property paper",
  valuation_report: "Valuation report",
  lending_agreement: "Lending agreement",
  nominee_record: "Nominee record",
  invoice: "Invoice",
  receipt: "Receipt",
  identity_document: "Identity-related document",
  other: "Other",
};

export const DOCUMENT_STATUSES = ["active", "archived"] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  active: "Active",
  archived: "Archived",
};

/**
 * The entity types a document can be loosely linked to — a fixed list for
 * the picker UI, but (unlike attachments.attachable_type) not enforced by
 * a DB trigger against the referenced table; see the migration's comment.
 */
export const DOCUMENT_ENTITY_TYPES = [
  "financial_account",
  "transaction",
  "loan",
  "lending",
  "liability",
  "insurance_policy",
  "insurance_claim",
  "asset",
  "investment_account",
  "goal",
  "person",
] as const;
export const documentEntityTypeSchema = z.enum(DOCUMENT_ENTITY_TYPES);
export type DocumentEntityType = z.infer<typeof documentEntityTypeSchema>;

export const DOCUMENT_ENTITY_TYPE_LABELS: Record<DocumentEntityType, string> =
  {
    financial_account: "Financial account",
    transaction: "Transaction",
    loan: "Loan",
    lending: "Lending",
    liability: "Liability",
    insurance_policy: "Insurance policy",
    insurance_claim: "Insurance claim",
    asset: "Asset",
    investment_account: "Investment account",
    goal: "Goal",
    person: "Person",
  };

/** 25 MB — generous for scanned statements/policy PDFs, small enough to reject anything that isn't really a document. Enforced both client-side (fail fast, before spending upload bandwidth) and server-side in createDocumentSchema below. */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

/** MIME allowlist — the vault only ever stores document-shaped files, never executables/archives/scripts. Keep in sync with the `accept` attribute on the vault's file input. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
] as const;
export type AllowedDocumentMimeType =
  (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export function isAllowedDocumentMimeType(
  value: string,
): value is AllowedDocumentMimeType {
  return (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

/**
 * The fields shared by create and edit — deliberately excludes the
 * upload-only fields (storagePath, originalFilename, mimeType, sizeBytes,
 * checksum), which are only ever set once, at creation, and never change on
 * an edit (editing metadata never re-uploads the file — a new version is a
 * new document, matching "documents remain private" rather than mutable).
 */
export const documentMetadataFieldsSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Enter a display name")
      .max(255, "Display name is too long"),
    category: documentCategorySchema,
    entityType: documentEntityTypeSchema.nullable().optional(),
    entityId: uuidSchema.nullable().optional(),
    documentDate: optionalDateSchema,
    expiryDate: optionalDateSchema,
    notes: notesSchema,
  })
  .refine((values) => Boolean(values.entityType) === Boolean(values.entityId), {
    message: "Select an entity type and enter its ID, or leave both blank",
    path: ["entityId"],
  });
export type DocumentMetadataFieldsInput = z.input<
  typeof documentMetadataFieldsSchema
>;

/**
 * Finalizes an already-uploaded Storage object as a vault entry — same
 * "browser uploads bytes directly, this only records the result" split as
 * attachAssetDocumentSchema (src/lib/validation/assets.ts).
 */
export const createDocumentSchema = documentMetadataFieldsSchema.and(
  z.object({
    /** Client-generated (crypto.randomUUID()) before upload, so it's part of the storage path (see buildDocumentStoragePath) and becomes this row's id — the two always match. */
    documentId: uuidSchema,
    storagePath: z.string().trim().min(1),
    originalFilename: z.string().trim().min(1).max(255),
    mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, {
      message: "This file type isn't supported.",
    }),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(
        MAX_DOCUMENT_SIZE_BYTES,
        "File is too large — the vault accepts files up to 25 MB.",
      ),
    checksum: z.string().trim().max(128).nullable().optional(),
  }),
);
export type CreateDocumentInput = z.input<typeof createDocumentSchema>;

export const updateDocumentMetadataSchema = documentMetadataFieldsSchema.and(
  z.object({ documentId: uuidSchema }),
);
export type UpdateDocumentMetadataInput = z.input<
  typeof updateDocumentMetadataSchema
>;

export const documentIdSchema = z.object({ documentId: uuidSchema });
export type DocumentIdInput = z.input<typeof documentIdSchema>;

export type DocumentFilters = {
  search?: string;
  category?: DocumentCategory;
  /** Mirrors AccountFilters.includeClosed (src/features/accounts/queries.ts) — archived documents are excluded from the list by default, opt-in only. */
  includeArchived?: boolean;
  entityType?: DocumentEntityType;
  entityId?: string;
};
