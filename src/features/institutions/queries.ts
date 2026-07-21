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
import type { InstitutionFilters } from "@/lib/validation/institutions";
import type { Tables } from "@/types/database";
import type { ExistingInstitution } from "./duplicate-detection";

export type InstitutionRow = Tables<"institutions"> & {
  /** Count of financial_accounts referencing this institution — see PROMPT 8, "linked-account count". Computed via a PostgREST embedded count, never a stored column (accounts can be added/removed independently). */
  linkedAccountCount: number;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawInstitutionRow = Tables<"institutions"> & {
  linked_accounts: { count: number }[] | null;
};

/**
 * Lists a household's institutions, following the standard query contract
 * (see docs/data-access-patterns.md §2): household-scoped, paginated,
 * deterministically ordered (name, then id as a tiebreaker), explicit
 * about archived records, and searchable by name. Each row's linked
 * account count comes from a single embedded-count query (no N+1).
 */
export async function listInstitutions(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: InstitutionFilters = {},
  paginationInput: unknown = {},
): Promise<Page<InstitutionRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase
    .from("institutions")
    .select(
      "id, household_id, name, institution_type, website, platform_name, support_phone, support_email, notes, is_archived, created_at, updated_at, linked_accounts:financial_accounts(count)",
    );

  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "is_archived",
    false,
    Boolean(filters.includeArchived),
  );

  if (filters.institutionType) {
    query = query.eq("institution_type", filters.institutionType);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawInstitutionRow[];

  const mapped = rows.map(({ linked_accounts, ...row }) => ({
    ...row,
    linkedAccountCount: linked_accounts?.[0]?.count ?? 0,
  }));

  return toPage(mapped, pagination);
}

/**
 * Fetches the minimal fields needed for duplicate detection (see
 * duplicate-detection.ts) across a household's institutions. Includes
 * archived institutions — an archived duplicate is still worth warning
 * about, since "archived" means retired, not gone.
 */
export async function listInstitutionsForDuplicateCheck(
  supabase: SupabaseServerClient,
  householdId: string,
  excludeInstitutionId?: string,
): Promise<ExistingInstitution[]> {
  let query = supabase
    .from("institutions")
    .select("id, name, website, support_phone")
    .eq("household_id", householdId);

  if (excludeInstitutionId) {
    query = query.neq("id", excludeInstitutionId);
  }

  const rows = unwrapList(await query);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    website: row.website,
    supportPhone: row.support_phone,
  }));
}
