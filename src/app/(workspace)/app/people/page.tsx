import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PeopleManager } from "@/features/people/people-manager";
import { listPeople } from "@/features/people/queries";
import { relationshipTypeSchema } from "@/lib/validation/people";

export const metadata: Metadata = {
  title: "People — DhanOS",
};

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const relationshipTypeParsed = relationshipTypeSchema.safeParse(
    params.relationship,
  );
  const relationshipType = relationshipTypeParsed.success
    ? relationshipTypeParsed.data
    : undefined;
  const includeArchived = params.archived === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const peoplePage = await listPeople(
    supabase,
    household.id,
    { search, relationshipType, includeArchived },
    { page: Number.isFinite(page) && page > 0 ? page : 1 },
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "People" }]} />}
        title="People"
        description="Everyone relevant to this household's finances — you, family members, lenders, borrowers, and nominees."
      />
      <PeopleManager
        householdId={household.id}
        people={peoplePage}
        filters={{
          search,
          relationshipType: relationshipType ?? "",
          includeArchived,
        }}
      />
    </PageShell>
  );
}
