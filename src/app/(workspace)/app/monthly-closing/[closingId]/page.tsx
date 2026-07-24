import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  getMonthlyClosingReport,
  getMonthlyClosingWithItems,
} from "@/features/monthly-closing/queries";
import { MonthlyClosingChecklist } from "@/features/monthly-closing/monthly-closing-checklist";
import { MonthlyClosingReport } from "@/features/monthly-closing/monthly-closing-report";

export const metadata: Metadata = {
  title: "Monthly Closing — DhanOS",
};

type MonthlyClosingDetailPageProps = {
  params: Promise<{ closingId: string }>;
};

export default async function MonthlyClosingDetailPage({
  params,
}: MonthlyClosingDetailPageProps) {
  const { household } = await requireHousehold();
  const { closingId } = await params;

  const supabase = await createClient();
  const closing = await getMonthlyClosingWithItems(
    supabase,
    household.id,
    closingId,
  );

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Monthly Closing" }, { label: closing.period }]}
          />
        }
        title={`Closing ${closing.period}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/monthly-closing">
              <ArrowLeftIcon data-icon="inline-start" />
              All closings
            </Link>
          </Button>
        }
      />
      {closing.status === "in_progress" ? (
        <MonthlyClosingChecklist householdId={household.id} closing={closing} />
      ) : (
        <MonthlyClosingReport
          householdId={household.id}
          report={await getMonthlyClosingReport(
            supabase,
            household.id,
            closingId,
          )}
        />
      )}
    </PageShell>
  );
}
