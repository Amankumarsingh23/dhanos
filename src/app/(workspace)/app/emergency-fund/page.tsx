import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { getEmergencyFundPlanDetail } from "@/features/emergency-fund/queries";
import { EmergencyFundPlanner } from "@/features/emergency-fund/emergency-fund-planner";

export const metadata: Metadata = {
  title: "Emergency Fund — DhanOS",
};

export default async function EmergencyFundPage() {
  const { household } = await requireHousehold();

  const supabase = await createClient();
  const detail = await getEmergencyFundPlanDetail(
    supabase,
    household.id,
    household.base_currency_code,
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Emergency Fund" }]} />}
        title="Emergency fund planner"
        description="How many months of essential spending could you cover on liquid money alone, right now? Never a growth projection — just what's actually accessible today."
      />
      <EmergencyFundPlanner householdId={household.id} detail={detail} />
    </PageShell>
  );
}
