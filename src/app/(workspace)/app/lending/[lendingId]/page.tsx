import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import { getLendingDetail } from "@/features/lending/queries";
import { LendingDetailView } from "@/features/lending/lending-detail-view";

export const metadata: Metadata = {
  title: "Lending — DhanOS",
};

type LendingDetailPageProps = {
  params: Promise<{ lendingId: string }>;
};

export default async function LendingDetailPage({
  params,
}: LendingDetailPageProps) {
  const { household } = await requireHousehold();
  const { lendingId } = await params;

  const supabase = await createClient();
  const [lending, institutionsPage, peoplePage, accountsPage] =
    await Promise.all([
      getLendingDetail(supabase, household.id, lendingId),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Lending" }, { label: lending.name }]}
          />
        }
        title={lending.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/lending">
              <ArrowLeftIcon data-icon="inline-start" />
              All lending
            </Link>
          </Button>
        }
      />
      <LendingDetailView
        householdId={household.id}
        lending={lending}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
        }))}
        institutions={institutionsPage.rows.map((institution) => ({
          id: institution.id,
          label: institution.name,
        }))}
        accounts={accountsPage.rows.map((account) => ({
          id: account.id,
          label: account.name,
          currencyCode: account.currency_code,
        }))}
      />
    </PageShell>
  );
}
