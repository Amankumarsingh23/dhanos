import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { listPeople } from "@/features/people/queries";
import { listLoans } from "@/features/loans/queries";
import { getAssetsOverview, listAssets } from "@/features/assets/queries";
import { AssetsManager } from "@/features/assets/assets-manager";
import {
  ASSET_GROUP_LABELS,
  assetGroupSchema,
  ownershipStatusSchema,
  type AssetGroup,
} from "@/lib/validation/assets";

export const metadata: Metadata = {
  title: "Assets — DhanOS",
};

type AssetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const groupParsed = assetGroupSchema.safeParse(params.group);
  const assetGroup = groupParsed.success ? groupParsed.data : undefined;
  const statusParsed = ownershipStatusSchema.safeParse(params.status);
  const ownershipStatus = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [assetsPage, peoplePage, loansPage, overview] = await Promise.all([
    listAssets(
      supabase,
      household.id,
      { search, assetGroup, ownershipStatus },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listLoans(supabase, household.id, {}, { pageSize: 100 }),
    getAssetsOverview(supabase, household.id, household.base_currency_code),
  ]);

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: overview.currencyCode });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Assets" }]} />}
        title="Assets"
        description="Movable, immovable, and business property this household owns — values always come from dated valuations, never a single mutable figure."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Tracked assets"
          amount={String(overview.assetCount)}
          caption="In your base currency"
        />
        <SummaryCard
          title="Net worth contribution"
          amount={money(overview.totalNetWorthContributionMinorUnits)}
          caption="Owned share, excluding disputed/expected and opted-out assets"
        />
        <SummaryCard
          title="Disputed / expected value"
          amount={money(overview.totalUncertainOwnedValueMinorUnits)}
          caption="Tracked, but never counted toward net worth"
        />
        <SummaryCard
          title="Missing a valuation"
          amount={String(overview.assetsWithoutValuation)}
          caption="No dated value recorded yet"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Net worth contribution by group
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(ASSET_GROUP_LABELS) as AssetGroup[]).map((group) => (
              <div key={group}>
                <dt className="text-muted-foreground text-xs">
                  {ASSET_GROUP_LABELS[group]}
                </dt>
                <dd className="text-sm font-medium">
                  {money(overview.byGroupMinorUnits[group])}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <AssetsManager
        householdId={household.id}
        assets={assetsPage}
        filters={{
          search,
          assetGroup: assetGroup ?? "",
          ownershipStatus: ownershipStatus ?? "",
        }}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
        }))}
        loans={loansPage.rows.map((loan) => ({
          id: loan.id,
          label: loan.name,
        }))}
      />
    </PageShell>
  );
}
