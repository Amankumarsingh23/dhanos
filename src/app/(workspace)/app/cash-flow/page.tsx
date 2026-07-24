import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TransactionsManager } from "@/features/transactions/transactions-manager";
import { listTransactions } from "@/features/transactions/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { listPeople } from "@/features/people/queries";
import {
  transactionKindSchema,
  transactionStatusSchema,
} from "@/lib/validation/transactions";

export const metadata: Metadata = {
  title: "Cash Flow — DhanOS",
};

type CashFlowPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CashFlowPage({
  searchParams,
}: CashFlowPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const kindParsed = transactionKindSchema.safeParse(params.kind);
  const kind = kindParsed.success ? kindParsed.data : undefined;
  const statusParsed = transactionStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const accountId = typeof params.account === "string" ? params.account : "";
  const includeCancelled = params.cancelled === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  // Deep-link support for e.g. the dashboard's "Income this month" card —
  // not part of the manager's own editable filter UI (see
  // TransactionsManager's filters prop), just an initial read from the URL.
  const dateFrom = typeof params.dateFrom === "string" ? params.dateFrom : "";
  const dateTo = typeof params.dateTo === "string" ? params.dateTo : "";

  const supabase = await createClient();
  const [transactionsPage, accountsPage, categories, peoplePage] =
    await Promise.all([
      listTransactions(
        supabase,
        household.id,
        {
          search,
          kind,
          status,
          accountId: accountId || undefined,
          includeCancelled,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listCategories(supabase, household.id, {}),
      listPeople(supabase, household.id, {}, { pageSize: 100 }),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Cash Flow" }]} />}
        title="Cash Flow"
        description="Income, expenses, and transfers across your accounts. Transfers are never counted as income or expense."
      />
      <TransactionsManager
        householdId={household.id}
        transactions={transactionsPage}
        accounts={accountsPage.rows.map((account) => ({
          id: account.id,
          name: account.name,
          currencyCode: account.currency_code,
        }))}
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
          categoryKind: category.category_kind,
        }))}
        people={peoplePage.rows.map((person) => ({
          id: person.id,
          name: person.display_name,
        }))}
        filters={{
          search,
          kind: kind ?? "",
          status: status ?? "",
          accountId,
          includeCancelled,
        }}
      />
    </PageShell>
  );
}
