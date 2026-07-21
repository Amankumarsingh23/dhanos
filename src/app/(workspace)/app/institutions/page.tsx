import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { InstitutionsManager } from "@/features/institutions/institutions-manager";
import { listInstitutions } from "@/features/institutions/queries";
import { institutionTypeSchema } from "@/lib/validation/institutions";

export const metadata: Metadata = {
  title: "Institutions — DhanOS",
};

type InstitutionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstitutionsPage({
  searchParams,
}: InstitutionsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const institutionTypeParsed = institutionTypeSchema.safeParse(params.type);
  const institutionType = institutionTypeParsed.success
    ? institutionTypeParsed.data
    : undefined;
  const includeArchived = params.archived === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const institutionsPage = await listInstitutions(
    supabase,
    household.id,
    { search, institutionType, includeArchived },
    { page: Number.isFinite(page) && page > 0 ? page : 1 },
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Institutions" }]} />}
        title="Institutions"
        description="Banks, wallets, investment platforms, insurers, lenders, employers, and other businesses this household deals with."
      />
      <InstitutionsManager
        householdId={household.id}
        institutions={institutionsPage}
        filters={{
          search,
          institutionType: institutionType ?? "",
          includeArchived,
        }}
      />
    </PageShell>
  );
}
