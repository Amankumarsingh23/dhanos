import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import {
  applyArchivedFilter,
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import { isDocumentExpiringSoon } from "@/lib/calculations/documents";
import type { DocumentFilters } from "@/lib/validation/documents";
import type { Tables } from "@/types/database";

/**
 * Data access for the financial documents vault (PROMPT 34). A `documents`
 * row never carries file bytes or a public URL — only the storage_path,
 * resolved to a signed URL by getDocumentDownloadUrlAction
 * (src/features/documents/actions.ts) at read time. See
 * supabase/migrations/20260723180000_documents_vault.sql.
 */

export type DocumentRecord = Tables<"documents">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Lists a household's vault documents, following the standard query
 * contract: household-scoped, paginated, deterministically ordered
 * (newest first), archived rows excluded unless explicitly requested,
 * searchable by display name/original filename.
 */
export async function listDocuments(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: DocumentFilters = {},
  paginationInput: unknown = {},
): Promise<Page<DocumentRecord>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("documents").select("*");
  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "status",
    "active",
    Boolean(filters.includeArchived),
  );

  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }
  if (filters.entityId) {
    query = query.eq("entity_id", filters.entityId);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,original_filename.ilike.%${search}%`,
    );
  }

  query = applyDeterministicOrder(query, "created_at", "desc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as DocumentRecord[];
  return toPage(rawRows, pagination);
}

export type DocumentsOverview = {
  activeCount: number;
  archivedCount: number;
  expiringSoonCount: number;
  totalSizeBytes: number;
};

/**
 * The combined counts behind the vault's summary cards. Fetches every
 * household document once (household-scoped, capped at MAX_PAGE_SIZE like
 * getAssetsOverview) rather than issuing a separate COUNT query per figure.
 */
export async function getDocumentsOverview(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<DocumentsOverview> {
  const rows = unwrapList(
    await supabase
      .from("documents")
      .select("status, size_bytes, expiry_date")
      .eq("household_id", householdId)
      .limit(MAX_PAGE_SIZE),
  );

  let activeCount = 0;
  let archivedCount = 0;
  let expiringSoonCount = 0;
  let totalSizeBytes = 0;

  for (const row of rows) {
    if (row.status === "archived") {
      archivedCount += 1;
    } else {
      activeCount += 1;
    }
    totalSizeBytes += row.size_bytes;
    if (row.status !== "archived" && isDocumentExpiringSoon(row.expiry_date)) {
      expiringSoonCount += 1;
    }
  }

  return { activeCount, archivedCount, expiringSoonCount, totalSizeBytes };
}
