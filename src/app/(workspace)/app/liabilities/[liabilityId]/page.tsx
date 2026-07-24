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
import { getLiabilityDetail } from "@/features/liabilities/queries";
import { LiabilityDetailView } from "@/features/liabilities/liability-detail-view";

export const metadata: Metadata = {
  title: "Liability — DhanOS",
};

type LiabilityDetailPageProps = {
  params: Promise<{ liabilityId: string }>;
};

export default async function LiabilityDetailPage({
  params,
}: LiabilityDetailPageProps) {
  const { household } = await requireHousehold();
  const { liabilityId } = await params;

  const supabase = await createClient();
  const [liability, institutionsPage, peoplePage, accountsPage] =
    await Promise.all([
      getLiabilityDetail(supabase, household.id, liabilityId),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Liabilities" }, { label: liability.name }]}
          />
        }
        title={liability.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/liabilities">
              <ArrowLeftIcon data-icon="inline-start" />
              All liabilities
            </Link>
          </Button>
        }
      />
      <LiabilityDetailView
        householdId={household.id}
        liability={liability}
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
