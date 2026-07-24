import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { listPeople } from "@/features/people/queries";
import { listLoans } from "@/features/loans/queries";
import { listAccounts } from "@/features/accounts/queries";
import {
  getAssetDetail,
  listAssetDocuments,
  listAssetIncomeTransactions,
} from "@/features/assets/queries";
import { AssetDetailView } from "@/features/assets/asset-detail-view";

export const metadata: Metadata = {
  title: "Asset — DhanOS",
};

type AssetDetailPageProps = {
  params: Promise<{ assetId: string }>;
};

export default async function AssetDetailPage({
  params,
}: AssetDetailPageProps) {
  const { household } = await requireHousehold();
  const { assetId } = await params;

  const supabase = await createClient();
  const [
    asset,
    documents,
    incomeTransactions,
    peoplePage,
    loansPage,
    accountsPage,
  ] = await Promise.all([
    getAssetDetail(supabase, household.id, assetId),
    listAssetDocuments(supabase, household.id, assetId),
    listAssetIncomeTransactions(supabase, household.id, assetId),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listLoans(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Assets" }, { label: asset.name }]} />
        }
        title={asset.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/assets">
              <ArrowLeftIcon data-icon="inline-start" />
              All assets
            </Link>
          </Button>
        }
      />
      <AssetDetailView
        householdId={household.id}
        asset={asset}
        documents={documents}
        incomeTransactions={incomeTransactions}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
        }))}
        loans={loansPage.rows.map((loan) => ({
          id: loan.id,
          label: loan.name,
        }))}
        accounts={accountsPage.rows.map((account) => ({
          id: account.id,
          label: account.name,
        }))}
      />
    </PageShell>
  );
}
