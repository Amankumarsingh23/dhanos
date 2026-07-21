import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import {
  applyArchivedFilter,
  scopeToHousehold,
} from "@/lib/queries/pagination";
import type { CategoryFilters } from "@/lib/validation/transaction-categories";
import type { Tables } from "@/types/database";

export type CategoryRow = Tables<"transaction_categories">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Lists a household's categories, ordered for direct tree rendering
 * (top-level groups and their children interleaved by sort_order, name as
 * a tiebreaker) rather than paginated — a household's category list is
 * small and bounded by construction (the seeded taxonomy plus whatever a
 * household adds by hand), unlike accounts/transactions/people, so this
 * intentionally does not go through src/lib/queries/pagination.ts's
 * Page<T> contract.
 */
export async function listCategories(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: CategoryFilters = {},
): Promise<CategoryRow[]> {
  let query = supabase.from("transaction_categories").select("*");

  query = scopeToHousehold(query, householdId);
  query = applyArchivedFilter(
    query,
    "is_archived",
    false,
    Boolean(filters.includeArchived),
  );

  if (filters.categoryKind) {
    query = query.eq("category_kind", filters.categoryKind);
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  return unwrapList(await query);
}
