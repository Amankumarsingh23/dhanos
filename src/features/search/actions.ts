"use server";

import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { groupSearchResults, searchHousehold } from "./queries";
import type { SearchResultGroup } from "./types";

/**
 * Global search (PROMPT 39) — a read-only Server Action, not a
 * `runHouseholdMutation` (there is nothing to write, no activity event, no
 * path to revalidate), but it still resolves the authenticated user's own
 * household exactly like a Server Component page would (`requireHousehold`)
 * rather than trusting a client-supplied household id, and it never lets a
 * raw database error reach the client — any failure resolves to an empty
 * result set instead of a thrown error, since a search box coming up empty
 * is a safe, unsurprising failure mode.
 */
export async function searchAction(
  query: string,
  limitPerEntity: number,
): Promise<SearchResultGroup[]> {
  try {
    const { household } = await requireHousehold();
    const supabase = await createClient();
    const rows = await searchHousehold(
      supabase,
      household.id,
      query,
      limitPerEntity,
    );
    return groupSearchResults(rows);
  } catch {
    return [];
  }
}
