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
import { listCategories } from "@/features/transaction-categories/queries";
import {
  getPolicyDetail,
  listWaitingPeriodsForPolicy,
} from "@/features/insurance/queries";
import { listClaimsForPolicy } from "@/features/insurance/claims-queries";
import { PolicyDetailView } from "@/features/insurance/policy-detail-view";

export const metadata: Metadata = {
  title: "Insurance policy — DhanOS",
};

type PolicyDetailPageProps = {
  params: Promise<{ policyId: string }>;
};

export default async function PolicyDetailPage({
  params,
}: PolicyDetailPageProps) {
  const { household } = await requireHousehold();
  const { policyId } = await params;

  const supabase = await createClient();
  const [
    policy,
    institutionsPage,
    peoplePage,
    accountsPage,
    categories,
    claims,
    waitingPeriods,
  ] = await Promise.all([
    getPolicyDetail(supabase, household.id, policyId),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listCategories(supabase, household.id, { categoryKind: "expense" }),
    listClaimsForPolicy(supabase, household.id, policyId),
    listWaitingPeriodsForPolicy(supabase, household.id, policyId),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Insurance" }, { label: policy.name }]}
          />
        }
        title={policy.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/insurance">
              <ArrowLeftIcon data-icon="inline-start" />
              All policies
            </Link>
          </Button>
        }
      />
      <PolicyDetailView
        householdId={household.id}
        policy={policy}
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
        categories={categories.map((category) => ({
          id: category.id,
          label: category.name,
          classification: category.classification,
        }))}
        claims={claims}
        waitingPeriods={waitingPeriods}
      />
    </PageShell>
  );
}
