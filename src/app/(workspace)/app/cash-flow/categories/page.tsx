import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { CategoriesManager } from "@/features/transaction-categories/categories-manager";
import { listCategories } from "@/features/transaction-categories/queries";

export const metadata: Metadata = {
  title: "Categories — DhanOS",
};

type CategoriesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;
  const includeArchived = params.archived === "true";

  const supabase = await createClient();
  const categories = await listCategories(supabase, household.id, {
    includeArchived,
  });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Cash Flow", href: "/app/cash-flow" },
              { label: "Categories" },
            ]}
          />
        }
        title="Categories"
        description="Income, expense, and investment labels — a default set is seeded for every household, plus whatever custom ones you add."
      />
      <CategoriesManager
        householdId={household.id}
        categories={categories}
        includeArchived={includeArchived}
      />
    </PageShell>
  );
}
