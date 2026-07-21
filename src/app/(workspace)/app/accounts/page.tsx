import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { AccountsManager } from "@/features/accounts/accounts-manager";
import { listAccounts } from "@/features/accounts/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { accountTypeSchema } from "@/lib/validation/accounts";

export const metadata: Metadata = {
  title: "Accounts — DhanOS",
};

type AccountsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const accountTypeParsed = accountTypeSchema.safeParse(params.type);
  const accountType = accountTypeParsed.success
    ? accountTypeParsed.data
    : undefined;
  const includeClosed = params.closed === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [accountsPage, institutionsPage, peoplePage] = await Promise.all([
    listAccounts(
      supabase,
      household.id,
      { search, accountType, includeClosed },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Accounts" }]} />}
        title="Accounts"
        description="Bank accounts, wallets, deposits, and other holdings — balances are always calculated, never entered directly."
      />
      <AccountsManager
        householdId={household.id}
        accounts={accountsPage}
        institutions={institutionsPage.rows.map((institution) => ({
          id: institution.id,
          label: institution.name,
        }))}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
        }))}
        filters={{
          search,
          accountType: accountType ?? "",
          includeClosed,
        }}
      />
    </PageShell>
  );
}
