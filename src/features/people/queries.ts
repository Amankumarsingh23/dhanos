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
import type { PersonFilters } from "@/lib/validation/people";
import type { Tables } from "@/types/database";

export type PersonRow = Tables<"people">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Lists a household's people, following the standard query contract (see
 * docs/data-access-patterns.md §2): household-scoped, paginated,
 * deterministically ordered (display_name, then id as a tiebreaker),
 * explicit about archived (`is_active = false`) records, and searchable by
 * display name.
 */
export async function listPeople(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: PersonFilters = {},
  paginationInput: unknown = {},
): Promise<Page<PersonRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase
    .from("people")
    .select(
      "id, household_id, display_name, relationship_type, user_id, birth_date, notes, is_active, created_at, updated_at",
    );

  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "is_active",
    true,
    Boolean(filters.includeArchived),
  );

  if (filters.relationshipType) {
    query = query.eq("relationship_type", filters.relationshipType);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("display_name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "display_name", "asc");

  const rows = unwrapList(await query.range(from, to));
  return toPage(rows, pagination);
}
