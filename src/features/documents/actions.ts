"use server";

import { NotFoundError, toUserMessage } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { createSignedDownloadUrl } from "@/lib/storage";
import {
  createDocumentSchema,
  documentIdSchema,
  updateDocumentMetadataSchema,
  type CreateDocumentInput,
  type UpdateDocumentMetadataInput,
} from "@/lib/validation/documents";
import type { DocumentRecord } from "./queries";

/**
 * Server Actions for the financial documents vault (PROMPT 34) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one of
 * these implements via runHouseholdMutation. The browser uploads file bytes
 * directly to Storage (RLS-gated by the 'documents' bucket policies);
 * createDocumentAction only ever records the resulting metadata row, same
 * split as attachAssetDocumentAction (src/features/assets/actions.ts).
 * Permanent deletion is deliberately restricted to owner/admin (see the
 * migration) — archiving (an ordinary metadata update) is the reversible,
 * editor-accessible alternative.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const DELETE_ROLES = ["owner", "admin"] as const;
const DOCUMENTS_REVALIDATE_PATHS = ["/app/documents"];

/** A short-lived signed URL is generated on demand, never cached beyond this TTL — see docs/security-model.md §5. */
const DOWNLOAD_URL_TTL_SECONDS = 120;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function toDocumentFieldsArgs(
  values: CreateDocumentInput | UpdateDocumentMetadataInput,
) {
  return {
    display_name: values.displayName,
    category: values.category,
    entity_type: values.entityType || null,
    entity_id: values.entityId || null,
    document_date: values.documentDate || null,
    expiry_date: values.expiryDate || null,
    notes: values.notes ?? null,
  };
}

async function fetchDocument(
  supabase: SupabaseServerClient,
  householdId: string,
  documentId: string,
): Promise<DocumentRecord> {
  const response = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  if (!response.data) {
    throw new NotFoundError();
  }
  return response.data;
}

export async function createDocumentAction(
  householdId: string,
  input: CreateDocumentInput,
): Promise<ActionResult<DocumentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createDocumentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("documents")
        .insert({
          id: values.documentId,
          household_id: householdId,
          original_filename: values.originalFilename,
          mime_type: values.mimeType,
          size_bytes: values.sizeBytes,
          storage_bucket: "documents",
          storage_path: values.storagePath,
          checksum: values.checksum ?? null,
          ...toDocumentFieldsArgs(values),
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "document.uploaded",
      entityType: "document",
      entityId: output.id,
      metadata: { category: output.category },
    }),
    revalidatePaths: [...DOCUMENTS_REVALIDATE_PATHS],
  });
}

export async function updateDocumentMetadataAction(
  householdId: string,
  input: UpdateDocumentMetadataInput,
): Promise<ActionResult<DocumentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateDocumentMetadataSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("documents")
        .update(toDocumentFieldsArgs(values))
        .eq("id", values.documentId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "document.updated",
      entityType: "document",
      entityId: output.id,
    }),
    revalidatePaths: [...DOCUMENTS_REVALIDATE_PATHS],
  });
}

async function setDocumentStatus(
  householdId: string,
  documentId: string,
  status: "active" | "archived",
): Promise<ActionResult<DocumentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: documentIdSchema,
    input: { documentId },
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("documents")
        .update({ status })
        .eq("id", values.documentId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: status === "archived" ? "document.archived" : "document.restored",
      entityType: "document",
      entityId: output.id,
    }),
    revalidatePaths: [...DOCUMENTS_REVALIDATE_PATHS],
  });
}

export async function archiveDocumentAction(
  householdId: string,
  documentId: string,
): Promise<ActionResult<DocumentRecord>> {
  return setDocumentStatus(householdId, documentId, "archived");
}

export async function restoreDocumentAction(
  householdId: string,
  documentId: string,
): Promise<ActionResult<DocumentRecord>> {
  return setDocumentStatus(householdId, documentId, "active");
}

/**
 * Permanently deletes a document — the row first, then the Storage object.
 * Restricted to owner/admin at the RLS layer already; allowedRoles here
 * just fails fast with a clear message before the RLS rejection would.
 */
export async function deleteDocumentAction(
  householdId: string,
  documentId: string,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...DELETE_ROLES],
    schema: documentIdSchema,
    input: { documentId },
    run: async ({ supabase, input: values }) => {
      const document = await fetchDocument(
        supabase,
        householdId,
        values.documentId,
      );

      const deleteResponse = await supabase
        .from("documents")
        .delete()
        .eq("id", values.documentId)
        .eq("household_id", householdId);
      if (deleteResponse.error) {
        throw mapSupabaseError(deleteResponse.error);
      }

      await supabase.storage
        .from(document.storage_bucket)
        .remove([document.storage_path]);

      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "document.deleted",
      entityType: "document",
      entityId: documentId,
    }),
    revalidatePaths: [...DOCUMENTS_REVALIDATE_PATHS],
  });
}

/** A short-lived signed URL to view/download one vault document — never a permanent public link (see docs/security-model.md §5). */
export async function getDocumentDownloadUrlAction(
  householdId: string,
  documentId: string,
): Promise<ActionResult<string>> {
  const parsed = documentIdSchema.safeParse({ documentId });
  if (!parsed.success) {
    return actionError("Invalid document id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const document = await fetchDocument(
      supabase,
      householdId,
      parsed.data.documentId,
    );
    const url = await createSignedDownloadUrl(
      document.storage_bucket,
      document.storage_path,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return actionOk(url);
  } catch (error) {
    return actionError(toUserMessage(error));
  }
}
