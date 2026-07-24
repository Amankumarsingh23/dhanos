import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import {
  getCurrentNetWorthBreakdown,
  getNetWorthChartsData,
} from "@/features/net-worth/queries";
import { NetWorthDashboard } from "@/features/net-worth/net-worth-dashboard";

export const metadata: Metadata = {
  title: "Net Worth — DhanOS",
};

export default async function NetWorthPage() {
  const { household } = await requireHousehold();

  const supabase = await createClient();
  const [breakdown, charts] = await Promise.all([
    getCurrentNetWorthBreakdown(
      supabase,
      household.id,
      household.base_currency_code,
    ),
    getNetWorthChartsData(supabase, household.id, household.base_currency_code),
  ]);

  const hasSnapshotToday = charts.netWorthCurve.some(
    (point) => point.asOfDate === breakdown.asOfDate,
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Net Worth" }]} />}
        title="Net worth"
        description="Eligible account balances, investment valuations, ownership-adjusted asset values, and receivables, minus institutional debt, informal debt, and other confirmed liabilities."
      />
      <NetWorthDashboard
        householdId={household.id}
        breakdown={breakdown}
        charts={charts}
        hasSnapshotToday={hasSnapshotToday}
      />
    </PageShell>
  );
}
