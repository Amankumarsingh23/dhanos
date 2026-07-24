import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { TransfersManager } from "@/features/transfers/transfers-manager";
import { listTransfers } from "@/features/transfers/queries";
import { listAccounts } from "@/features/accounts/queries";
import { transactionStatusSchema } from "@/lib/validation/transactions";
import type { TransferFilters } from "@/lib/validation/transfers";

export const metadata: Metadata = {
  title: "Transfers — DhanOS",
};

type TransfersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransfersPage({
  searchParams,
}: TransfersPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  const statusParsed = transactionStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const filters: TransferFilters = { search, accountId, status };

  const supabase = await createClient();
  const [transfersPage, accountsPage] = await Promise.all([
    listTransfers(supabase, household.id, filters, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
    }),
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Transfers" }]} />}
        title="Transfers"
        description="Move money between your own accounts — never counted as income or expense."
      />
      <TransfersManager
        householdId={household.id}
        transfers={transfersPage}
        accounts={accountsPage.rows.map((a) => ({
          id: a.id,
          name: a.name,
          currencyCode: a.currency_code,
        }))}
        filters={{ search, accountId, status: status ?? "" }}
      />
    </PageShell>
  );
}
