import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ExpensesManager } from "@/features/expenses/expenses-manager";
import {
  getExpenseByCategory,
  getExpenseByMerchant,
  getExpenseByPerson,
  getExpenseMonthOverMonth,
  getExpenseSummary,
  getExpenseTrend,
  getLargestExpenses,
  listExpenses,
} from "@/features/expenses/queries";
import { listAccounts } from "@/features/accounts/queries";
import { listCategories } from "@/features/transaction-categories/queries";
import { listPeople } from "@/features/people/queries";
import {
  expenseViewSchema,
  type ExpenseFilters,
  type ExpenseView,
} from "@/lib/validation/expenses";
import { toIsoDateString } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Expenses — DhanOS",
};

type ExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Maps a named expense view to the extra filters it applies to the flat expense list — see src/lib/validation/expenses.ts's ExpenseView. */
function filtersForView(
  view: ExpenseView,
  monthStart: string,
  today: string,
): Partial<ExpenseFilters> {
  switch (view) {
    case "this_month":
      return { dateFrom: monthStart, dateTo: today };
    case "essentials":
      return { classificationBucket: "essential" };
    case "discretionary":
      return { classificationBucket: "discretionary" };
    case "irregular":
      return { isRecurring: false };
    case "recurring":
      return { isRecurring: true };
    case "unplanned":
      return { isPlanned: false };
    default:
      return {};
  }
}

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const viewParsed = expenseViewSchema.safeParse(params.view);
  const view = viewParsed.success ? viewParsed.data : "all";
  const search = typeof params.search === "string" ? params.search : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  const categoryId = typeof params.category === "string" ? params.category : "";
  const relatedPersonId =
    typeof params.person === "string" ? params.person : "";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const now = new Date();
  const monthStart = toIsoDateString(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const today = toIsoDateString(now);

  const filters: ExpenseFilters = {
    search,
    accountId,
    categoryId,
    relatedPersonId,
    ...filtersForView(view, monthStart, today),
  };

  const supabase = await createClient();
  const [
    expensesPage,
    accountsPage,
    categories,
    peoplePage,
    totals,
    monthOverMonth,
    trend,
    byCategory,
    byPerson,
    byMerchant,
    largest,
  ] = await Promise.all([
    listExpenses(supabase, household.id, filters, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
    }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listCategories(supabase, household.id, {}),
    listPeople(supabase, household.id, {}, { pageSize: 100 }),
    getExpenseSummary(supabase, household.id, monthStart, today),
    getExpenseMonthOverMonth(supabase, household.id, today),
    getExpenseTrend(supabase, household.id, 6, today),
    getExpenseByCategory(supabase, household.id, monthStart, today),
    getExpenseByPerson(supabase, household.id, monthStart, today),
    getExpenseByMerchant(supabase, household.id, monthStart, today),
    getLargestExpenses(supabase, household.id, monthStart, today, 10),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Expenses" }]} />}
        title="Expenses"
        description="Where your money goes — by category, person, merchant, and plan."
      />
      <ExpensesManager
        householdId={household.id}
        expenses={expensesPage}
        accounts={accountsPage.rows.map((a) => ({
          id: a.id,
          name: a.name,
          currencyCode: a.currency_code,
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          categoryKind: c.category_kind,
        }))}
        people={peoplePage.rows.map((p) => ({
          id: p.id,
          name: p.display_name,
        }))}
        summary={{
          currencyCode: household.base_currency_code,
          totals,
          monthOverMonth,
          trend,
          byCategory,
          byPerson,
          byMerchant,
          largest,
        }}
        filters={{
          view,
          search,
          accountId,
          categoryId,
          relatedPersonId,
        }}
      />
    </PageShell>
  );
}
