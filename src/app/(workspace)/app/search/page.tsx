import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { groupSearchResults, searchHousehold } from "@/features/search/queries";
import { SearchPageView } from "@/features/search/search-page-view";

export const metadata: Metadata = {
  title: "Search — DhanOS",
};

/** More headroom than the header palette's quick-jump limit, still bounded — PROMPT 39: "result limits". */
const SEARCH_PAGE_LIMIT_PER_ENTITY = 20;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The dedicated search page (PROMPT 39) — reached from the header command
 * palette's "View all results" link, or directly via `/app/search?q=...`.
 * Server-rendered: searchHousehold runs here exactly as it does for the
 * palette's Server Action, under the same household-scoped RLS.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const supabase = await createClient();
  const rows = await searchHousehold(
    supabase,
    household.id,
    query,
    SEARCH_PAGE_LIMIT_PER_ENTITY,
  );
  const groups = groupSearchResults(rows);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Search" }]} />}
        title="Search"
        description="Search across accounts, transactions, categories, people, institutions, investments, SIPs, staking positions, loans, borrowers, insurance policies, assets, liabilities, goals, documents, and decisions."
      />
      <SearchPageView initialQuery={query} groups={groups} />
    </PageShell>
  );
}
