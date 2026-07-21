import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { AccountDetailView } from "@/features/accounts/account-detail-view";
import { getAccountDetail } from "@/features/accounts/queries";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";

export const metadata: Metadata = {
  title: "Account — DhanOS",
};

type AccountDetailPageProps = {
  params: Promise<{ accountId: string }>;
};

export default async function AccountDetailPage({
  params,
}: AccountDetailPageProps) {
  const { household } = await requireHousehold();
  const { accountId } = await params;

  const supabase = await createClient();
  const [account, institutionsPage, peoplePage] = await Promise.all([
    getAccountDetail(supabase, household.id, accountId),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Accounts", href: "/app/accounts" },
              { label: account.name },
            ]}
          />
        }
        title={account.name}
      />
      <AccountDetailView
        householdId={household.id}
        account={account}
        institutions={institutionsPage.rows.map((institution) => ({
          id: institution.id,
          label: institution.name,
        }))}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
        }))}
      />
    </PageShell>
  );
}
