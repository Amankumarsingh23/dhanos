import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { listAccounts } from "@/features/accounts/queries";
import { listAssets } from "@/features/assets/queries";
import { listRecurringRules } from "@/features/recurring/queries";
import {
  getMoneyDrainsOverview,
  listMoneyDrains,
} from "@/features/money-drains/queries";
import { MoneyDrainsManager } from "@/features/money-drains/money-drains-manager";
import {
  drainStatusSchema,
  drainTypeSchema,
  drainUsageFrequencySchema,
} from "@/lib/validation/money-drains";

export const metadata: Metadata = {
  title: "Money drains — DhanOS",
};

type MoneyDrainsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MoneyDrainsPage({
  searchParams,
}: MoneyDrainsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const typeParsed = drainTypeSchema.safeParse(params.type);
  const drainType = typeParsed.success ? typeParsed.data : undefined;
  const statusParsed = drainStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const usageParsed = drainUsageFrequencySchema.safeParse(params.usage);
  const usageFrequency = usageParsed.success ? usageParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [drainsPage, accountsPage, assetsPage, recurringRulesPage, overview] =
    await Promise.all([
      listMoneyDrains(
        supabase,
        household.id,
        { search, drainType, status, usageFrequency },
        { page: Number.isFinite(page) && page > 0 ? page : 1 },
      ),
      listAccounts(supabase, household.id, {}, { pageSize: 100 }),
      listAssets(supabase, household.id, {}, { pageSize: 100 }),
      listRecurringRules(supabase, household.id, {}, { pageSize: 100 }),
      getMoneyDrainsOverview(
        supabase,
        household.id,
        household.base_currency_code,
      ),
    ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Money drains" }]} />}
        title="Depreciating & money-draining items"
        description="Subscriptions, memberships, vehicles, unused services, rented space, gadgets, maintenance-heavy assets, contractual commitments, and recurring fees — all in one place. This is a tracking and analysis view; DhanOS never cancels or changes anything on your behalf."
      />
      <MoneyDrainsManager
        householdId={household.id}
        currencyCode={household.base_currency_code}
        drains={drainsPage}
        overview={overview}
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
        filters={{
          search,
          drainType: drainType ?? "",
          status: status ?? "",
          usageFrequency: usageFrequency ?? "",
        }}
      />
    </PageShell>
  );
}
