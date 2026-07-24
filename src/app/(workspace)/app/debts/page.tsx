import type { Metadata } from "next";
import Link from "next/link";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { listInstitutions } from "@/features/institutions/queries";
import { listPeople } from "@/features/people/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listLoans } from "@/features/loans/queries";
import { LoansManager } from "@/features/loans/loans-manager";
import { loanStatusSchema, loanTypeSchema } from "@/lib/validation/loans";

export const metadata: Metadata = {
  title: "Debts — DhanOS",
};

type DebtsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DebtsPage({ searchParams }: DebtsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const loanTypeParsed = loanTypeSchema.safeParse(params.type);
  const loanType = loanTypeParsed.success ? loanTypeParsed.data : undefined;
  const statusParsed = loanStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [loansPage, institutionsPage, peoplePage, accountsPage] =
    await Promise.all([
      listLoans(
        supabase,
        household.id,
        { search, loanType, status },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Debts" }]} />}
        title="Loans & debt"
        description="Education, personal, business, home, vehicle, gold, credit-card, family, and informal loans — outstanding is always calculated from actual payments, never a mutable field."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/debts/dashboard">Debt dashboard</Link>
          </Button>
        }
      />
      <LoansManager
        householdId={household.id}
        loans={loansPage}
        filters={{
          search,
          loanType: loanType ?? "",
          status: status ?? "",
        }}
        institutions={institutionsPage.rows.map((institution) => ({
          id: institution.id,
          label: institution.name,
        }))}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          label: person.display_name,
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
