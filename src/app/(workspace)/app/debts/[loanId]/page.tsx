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
import { getLoanDetail } from "@/features/loans/queries";
import { LoanDetailView } from "@/features/loans/loan-detail-view";
import { selectEffectivePayments } from "@/lib/calculations/loan-outstanding";

export const metadata: Metadata = {
  title: "Loan — DhanOS",
};

type LoanDetailPageProps = {
  params: Promise<{ loanId: string }>;
};

export default async function LoanDetailPage({ params }: LoanDetailPageProps) {
  const { household } = await requireHousehold();
  const { loanId } = await params;

  const supabase = await createClient();
  const [loan, institutionsPage, peoplePage, accountsPage] = await Promise.all([
    getLoanDetail(supabase, household.id, loanId),
    listInstitutions(supabase, household.id, {}, { pageSize: 100 }),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  const effectivePayments = selectEffectivePayments(
    loan.allPayments.map((payment) => ({
      id: payment.id,
      reversesPaymentId: payment.reverses_payment_id,
      principalComponentMinorUnits: payment.principal_component_minor_units,
      original: payment,
    })),
  )
    .map((payment) => payment.original)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Debts" }, { label: loan.name }]} />
        }
        title={loan.name}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/debts">
              <ArrowLeftIcon data-icon="inline-start" />
              All loans
            </Link>
          </Button>
        }
      />
      <LoanDetailView
        householdId={household.id}
        loan={loan}
        effectivePayments={effectivePayments}
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
