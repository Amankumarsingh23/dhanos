import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import { getInsuranceDashboardData } from "@/features/insurance/dashboard-queries";
import { InsuranceDashboard } from "@/features/insurance/insurance-dashboard";

export const metadata: Metadata = {
  title: "Insurance dashboard — DhanOS",
};

export default async function InsuranceDashboardPage() {
  const { household } = await requireHousehold();
  const supabase = await createClient();

  const data = await getInsuranceDashboardData(
    supabase,
    household.id,
    household.base_currency_code,
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Insurance" }, { label: "Dashboard" }]}
          />
        }
        title="Insurance dashboard"
        description="Coverage, renewals, and claims across every tracked policy — renewal timing and waiting-period milestones are advisory, computed from the dates you've entered, and never override a policy's own status."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/insurance">
              <ArrowLeftIcon data-icon="inline-start" />
              All policies
            </Link>
          </Button>
        }
      />
      <InsuranceDashboard data={data} />
    </PageShell>
  );
}
