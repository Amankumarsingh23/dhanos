import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { listAccounts } from "@/features/accounts/queries";
import { listAssets } from "@/features/assets/queries";
import { listRecurringRules } from "@/features/recurring/queries";
import { getMoneyDrainDetail } from "@/features/money-drains/queries";
import { MoneyDrainDetailView } from "@/features/money-drains/money-drain-detail-view";

export const metadata: Metadata = {
  title: "Money drain — DhanOS",
};

type MoneyDrainDetailPageProps = {
  params: Promise<{ moneyDrainId: string }>;
};

export default async function MoneyDrainDetailPage({
  params,
}: MoneyDrainDetailPageProps) {
  const { household } = await requireHousehold();
  const { moneyDrainId } = await params;

  const supabase = await createClient();
  const [drain, accountsPage, assetsPage, recurringRulesPage] =
    await Promise.all([
      getMoneyDrainDetail(supabase, household.id, moneyDrainId),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listAssets(supabase, household.id, {}, { pageSize: 100 }),
      listRecurringRules(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Money drains" }, { label: drain.item }]}
          />
        }
        title={drain.item}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/money-drains">
              <ArrowLeftIcon data-icon="inline-start" />
              All money drains
            </Link>
          </Button>
        }
      />
      <MoneyDrainDetailView
        householdId={household.id}
        drain={drain}
        accounts={accountsPage.rows.map((account) => ({
          id: account.id,
          name: account.name,
          currencyCode: account.currency_code,
        }))}
        assets={assetsPage.rows.map((asset) => ({
          id: asset.id,
          name: asset.name,
        }))}
        recurringRules={recurringRulesPage.rows.map((rule) => ({
          id: rule.id,
          name: rule.name,
          currencyCode: rule.currency_code,
        }))}
      />
    </PageShell>
  );
}
