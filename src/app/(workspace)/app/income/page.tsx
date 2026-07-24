import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { IncomeManager } from "@/features/income/income-manager";
import {
  getIncomeBySource,
  getIncomeByPerson,
  getIncomeTrend,
  listIncomeSources,
} from "@/features/income/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { incomeSourceTypeSchema } from "@/lib/validation/income-sources";
import { toIsoDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Income — DhanOS",
};

type IncomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IncomePage({ searchParams }: IncomePageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const sourceTypeParsed = incomeSourceTypeSchema.safeParse(params.type);
  const sourceType = sourceTypeParsed.success
    ? sourceTypeParsed.data
    : undefined;
  const includeInactive = params.inactive === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const now = new Date();
  const monthStart = toIsoDateString(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const today = toIsoDateString(now);

  const supabase = await createClient();
  const [
    sourcesPage,
    institutionsPage,
    peoplePage,
    accountsPage,
    categories,
    bySource,
    byPerson,
    trend,
  ] = await Promise.all([
    listIncomeSources(
      supabase,
      household.id,
      { search, sourceType, includeInactive },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listCategories(supabase, household.id, {}),
    getIncomeBySource(supabase, household.id, monthStart, today),
    getIncomeByPerson(supabase, household.id, monthStart, today),
    getIncomeTrend(supabase, household.id, 6, today),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Income" }]} />}
        title="Income"
        description="Declared income sources and the actual receipts recorded against them."
      />
      <IncomeManager
        householdId={household.id}
        sources={sourcesPage}
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
        summary={{
          currencyCode: household.base_currency_code,
          bySource,
          byPerson,
          trend,
        }}
        filters={{ search, sourceType: sourceType ?? "", includeInactive }}
      />
    </PageShell>
  );
}
