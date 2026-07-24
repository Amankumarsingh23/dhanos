import type { Metadata } from "next";
import Link from "next/link";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import {
  getLendingOverviewData,
  listLendings,
} from "@/features/lending/queries";
import { LendingsManager } from "@/features/lending/lendings-manager";
import { RecoveryHistoryChart } from "@/features/lending/charts/recovery-history-chart";
import { BorrowerExposureChart } from "@/features/lending/charts/borrower-exposure-chart";
import {
  lendingRiskLevelSchema,
  lendingStatusSchema,
} from "@/lib/validation/lending";

export const metadata: Metadata = {
  title: "Lending — DhanOS",
};

type LendingPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LendingPage({ searchParams }: LendingPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const statusParsed = lendingStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const riskParsed = lendingRiskLevelSchema.safeParse(params.risk);
  const riskLevel = riskParsed.success ? riskParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [lendingsPage, institutionsPage, peoplePage, accountsPage, overview] =
    await Promise.all([
      listLendings(
        supabase,
        household.id,
        { search, status, riskLevel },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      getLendingOverviewData(
        supabase,
        household.id,
        household.base_currency_code,
      ),
    ]);

  const money = (amountMinorUnits: number) =>
    formatMoney({
      amountMinorUnits,
      currencyCode: overview.currencyCode,
    });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Lending" }]} />}
        title="Money lent & receivables"
        description="Money the household has lent to people or companies — recovery is always calculated from actual repayments, never a mutable field. Never counted as household spending."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total lent (lifetime)"
          amount={money(overview.totals.totalLentMinorUnits)}
          caption="Every lending, any status"
        />
        <SummaryCard
          title="Total outstanding"
          amount={money(overview.totals.totalOutstandingMinorUnits)}
          caption={`${overview.totals.currentlyOwedCount} currently owed`}
        />
        <SummaryCard
          title="Principal recovered"
          amount={money(overview.totals.totalPrincipalRecoveredMinorUnits)}
          caption="Lifetime, never treated as income"
        />
        <SummaryCard
          title="Interest received"
          amount={money(overview.totals.totalInterestReceivedMinorUnits)}
          caption="Tracked separately from principal"
        />
      </div>

      {overview.totals.totalWrittenOffMinorUnits > 0 && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm">
              <span className="font-medium">Written off:</span>{" "}
              {money(overview.totals.totalWrittenOffMinorUnits)} — kept visible
              in history, excluded from current outstanding.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <RecoveryHistoryChart
          data={overview.recoveryHistory}
          currencyCode={overview.currencyCode}
        />
        <BorrowerExposureChart
          rows={overview.borrowerExposure}
          currencyCode={overview.currencyCode}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.overdue.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing overdue.</p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {overview.overdue.map((lending) => (
                  <li
                    key={lending.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <Link
                        href={`/app/lending/${lending.id}`}
                        className="font-medium hover:underline"
                      >
                        {lending.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {lending.borrowerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {money(lending.outstandingMinorUnits)}
                      </p>
                      <Badge variant="destructive">
                        {lending.overdue.trackable
                          ? `${lending.overdue.daysOverdue} days overdue`
                          : ""}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing due in the next 30 days.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {overview.upcoming.map((lending) => (
                  <li
                    key={lending.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <Link
                        href={`/app/lending/${lending.id}`}
                        className="font-medium hover:underline"
                      >
                        {lending.name}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {lending.borrowerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {money(lending.outstandingMinorUnits)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Due{" "}
                        {lending.expected_repayment_date
                          ? formatDisplayDate(lending.expected_repayment_date)
                          : "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <LendingsManager
        householdId={household.id}
        lendings={lendingsPage}
        filters={{
          search,
          status: status ?? "",
          riskLevel: riskLevel ?? "",
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
