/**
 * Pure helpers for the financial documents vault (PROMPT 34,
 * src/features/documents) — expiry classification and the storage-path/
 * filename plumbing shared between the upload dialog (browser) and the
 * finalize-upload server action.
 */

const EXPIRY_SOON_THRESHOLD_DAYS = 30;

function daysUntil(dateString: string, referenceDate: Date): number {
  const target = new Date(`${dateString}T00:00:00Z`);
  const reference = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - reference.getTime()) / msPerDay);
}

/** A document with no expiry date is never "expired" — most categories don't expire at all. */
export function isDocumentExpired(
  expiryDate: string | null,
  referenceDate: Date = new Date(),
): boolean {
  if (!expiryDate) return false;
  return daysUntil(expiryDate, referenceDate) < 0;
}

/** Within the next 30 days, inclusive of today, but not already expired (that's isDocumentExpired's job — the two are mutually exclusive so a caller never has to reconcile overlapping badges). */
export function isDocumentExpiringSoon(
  expiryDate: string | null,
  referenceDate: Date = new Date(),
  thresholdDays: number = EXPIRY_SOON_THRESHOLD_DAYS,
): boolean {
  if (!expiryDate) return false;
  const days = daysUntil(expiryDate, referenceDate);
  return days >= 0 && days <= thresholdDays;
}

/**
 * Strips path separators and anything outside a conservative safe charset
 * so a user-supplied filename can never alter the storage path's directory
 * structure (e.g. "../../other-household/x.pdf") — the path's
 * household/entity/document segments must remain exactly what the server
 * computed, never influenced by file content.
 */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const cleaned = base
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : "document";
}

/**
 * The vault's storage path convention (PROMPT 34):
 *   householdId/entityType/entityId/documentId/originalFilename
 * A document with no entity link uses the literal 'general' segment and the
 * household id again as entityId, so the path shape never needs a
 * conditional — and the existing 'documents' bucket RLS (which only ever
 * trusts the first segment) applies unchanged either way.
 */
export function buildDocumentStoragePath(params: {
  householdId: string;
  documentId: string;
  fileName: string;
  entityType?: string | null;
  entityId?: string | null;
}): string {
  const entityType = params.entityType ?? "general";
  const entityId = params.entityId ?? params.householdId;
  const fileName = sanitizeFileName(params.fileName);
  return `${params.householdId}/${entityType}/${entityId}/${params.documentId}/${fileName}`;
}
