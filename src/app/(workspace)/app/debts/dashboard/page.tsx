import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { getDebtDashboardData } from "@/features/loans/debt-dashboard-queries";
import { DebtDashboard } from "@/features/loans/debt-dashboard";

export const metadata: Metadata = {
  title: "Debt dashboard — DhanOS",
};

export default async function DebtDashboardPage() {
  const { household } = await requireHousehold();
  const supabase = await createClient();

  const data = await getDebtDashboardData(
    supabase,
    household.id,
    household.base_currency_code,
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs items={[{ label: "Debts" }, { label: "Dashboard" }]} />
        }
        title="Debt dashboard"
        description="Metrics and charts built from actual recorded payments — projections (like the prepayment simulator) are always labeled and kept separate from what's actually happened."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/debts">
              <ArrowLeftIcon data-icon="inline-start" />
              All loans
            </Link>
          </Button>
        }
      />
      <DebtDashboard data={data} />
    </PageShell>
  );
}
