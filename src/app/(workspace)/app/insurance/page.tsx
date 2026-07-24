import type { Metadata } from "next";
import Link from "next/link";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import {
  getInsuranceOverview,
  listPolicies,
} from "@/features/insurance/queries";
import { InsuranceManager } from "@/features/insurance/insurance-manager";
import {
  policyStatusSchema,
  policyTypeSchema,
} from "@/lib/validation/insurance";

export const metadata: Metadata = {
  title: "Insurance — DhanOS",
};

type InsurancePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InsurancePage({
  searchParams,
}: InsurancePageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const typeParsed = policyTypeSchema.safeParse(params.type);
  const policyType = typeParsed.success ? typeParsed.data : undefined;
  const statusParsed = policyStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [policiesPage, institutionsPage, peoplePage, accountsPage, overview] =
    await Promise.all([
      listPolicies(
        supabase,
        household.id,
        { search, policyType, status },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      getInsuranceOverview(
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
        breadcrumbs={<Breadcrumbs items={[{ label: "Insurance" }]} />}
        title="Insurance"
        description="Policies, premiums, coverage, and renewals — a tracking summary for your own records, never a legal interpretation of the actual policy documents."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/insurance/dashboard">Insurance dashboard</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="Active policies"
          amount={String(overview.activePolicyCount)}
          caption="In your base currency"
        />
        <SummaryCard
          title="Total annual premium"
          amount={money(overview.totalAnnualPremiumMinorUnits)}
          caption="Active policies, normalized to yearly"
        />
        <SummaryCard
          title="Due for renewal soon"
          amount={String(overview.dueSoon.length)}
          caption="Within 30 days"
        />
      </div>

      {overview.dueSoon.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Due for renewal soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-border divide-y text-sm">
              {overview.dueSoon.map((policy) => (
                <li
                  key={policy.id}
                  className="flex items-center justify-between py-2"
                >
                  <Link
                    href={`/app/insurance/${policy.id}`}
                    className="font-medium hover:underline"
                  >
                    {policy.name}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    Due{" "}
                    {formatDisplayDate(
                      policy.renewal_date ?? policy.expiry_date ?? "",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <InsuranceManager
        householdId={household.id}
        policies={policiesPage}
        filters={{
          search,
          policyType: policyType ?? "",
          status: status ?? "",
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
