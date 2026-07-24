import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import {
  getLiabilitiesOverview,
  listLiabilities,
} from "@/features/liabilities/queries";
import { LiabilitiesManager } from "@/features/liabilities/liabilities-manager";
import {
  LIABILITY_CATEGORY_LABELS,
  liabilityCertaintySchema,
  liabilitySourceSchema,
  liabilityStatusSchema,
  type LiabilityCategory,
} from "@/lib/validation/liabilities";

export const metadata: Metadata = {
  title: "Liabilities — DhanOS",
};

type LiabilitiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LiabilitiesPage({
  searchParams,
}: LiabilitiesPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const sourceParsed = liabilitySourceSchema.safeParse(params.source);
  const liabilitySource = sourceParsed.success ? sourceParsed.data : undefined;
  const statusParsed = liabilityStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const certaintyParsed = liabilityCertaintySchema.safeParse(params.certainty);
  const certainty = certaintyParsed.success ? certaintyParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [
    liabilitiesPage,
    institutionsPage,
    peoplePage,
    accountsPage,
    overview,
  ] = await Promise.all([
    listLiabilities(
      supabase,
      household.id,
      { search, liabilitySource, status, certainty },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    getLiabilitiesOverview(
      supabase,
      household.id,
      household.base_currency_code,
    ),
  ]);

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: overview.currencyCode });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Liabilities" }]} />}
        title="Informal borrowing & liabilities"
        description="Non-bank liabilities — informal borrowing (family/friend/employer advance/business borrowing/personal settlement) and general obligations (taxes/bills/contracts/guarantees/maintenance/recurring commitments), integrated with total debt but kept distinguishable from institutional loans."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total debt (combined)"
          amount={money(overview.combinedDebt.totalDebtMinorUnits)}
          caption="Institutional + informal + general"
        />
        <SummaryCard
          title="Institutional debt"
          amount={money(
            overview.combinedDebt.institutionalOutstandingMinorUnits,
          )}
          caption="Loans — see /app/debts"
          href="/app/debts"
        />
        <SummaryCard
          title="Informal borrowing"
          amount={money(overview.combinedDebt.informalOutstandingMinorUnits)}
          caption="Family/friend/employer advance/business/settlement"
        />
        <SummaryCard
          title="General obligations"
          amount={money(
            overview.combinedDebt.generalObligationOutstandingMinorUnits,
          )}
          caption="Taxes/bills/contracts/guarantees/maintenance"
        />
      </div>

      {overview.totals.totalEstimatedOutstandingMinorUnits > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">
              <span className="font-medium">Estimated (not confirmed):</span>{" "}
              {money(overview.totals.totalEstimatedOutstandingMinorUnits)}{" "}
              across {overview.totals.estimatedCount} liabilit
              {overview.totals.estimatedCount === 1 ? "y" : "ies"} — kept
              separate from legally confirmed obligations, never blended into a
              single number.
            </p>
          </CardContent>
        </Card>
      )}

      {overview.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">By category</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y text-sm">
              {overview.categoryBreakdown.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between py-2"
                >
                  <span>
                    {LIABILITY_CATEGORY_LABELS[row.key as LiabilityCategory]}
                  </span>
                  <span className="font-medium">
                    {money(row.outstandingMinorUnits)}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({row.liabilityCount})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <LiabilitiesManager
        householdId={household.id}
        liabilities={liabilitiesPage}
        filters={{
          search,
          liabilitySource: liabilitySource ?? "",
          status: status ?? "",
          certainty: certainty ?? "",
        }}
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
