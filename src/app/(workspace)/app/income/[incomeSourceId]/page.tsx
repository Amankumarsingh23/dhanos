import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { IncomeDetailView } from "@/features/income/income-detail-view";
import { getIncomeSourceDetail } from "@/features/income/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";

export const metadata: Metadata = {
  title: "Income source — DhanOS",
};

type IncomeDetailPageProps = {
  params: Promise<{ incomeSourceId: string }>;
};

export default async function IncomeDetailPage({
  params,
}: IncomeDetailPageProps) {
  const { household } = await requireHousehold();
  const { incomeSourceId } = await params;

  const supabase = await createClient();
  const [source, institutionsPage, peoplePage, accountsPage, categories] =
    await Promise.all([
      getIncomeSourceDetail(supabase, household.id, incomeSourceId),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listCategories(supabase, household.id, {}),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Income", href: "/app/income" },
              { label: source.name },
            ]}
          />
        }
        title={source.name}
      />
      <IncomeDetailView
        householdId={household.id}
        source={source}
        institutions={institutionsPage.rows.map((i) => ({
          id: i.id,
          label: i.name,
        }))}
        people={peoplePage.rows.map((p) => ({
          id: p.id,
          label: p.display_name,
        }))}
        accounts={accountsPage.rows.map((a) => ({
          id: a.id,
          label: a.name,
          currencyCode: a.currency_code,
        }))}
        categories={categories.map((c) => ({ id: c.id, label: c.name }))}
      />
    </PageShell>
  );
}
