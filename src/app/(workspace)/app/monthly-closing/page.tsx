import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { listMonthlyClosingPeriods } from "@/features/monthly-closing/queries";
import { MonthlyClosingList } from "@/features/monthly-closing/monthly-closing-list";

export const metadata: Metadata = {
  title: "Monthly Closing — DhanOS",
};

export default async function MonthlyClosingPage() {
  const { household } = await requireHousehold();

  const supabase = await createClient();
  const periods = await listMonthlyClosingPeriods(supabase, household.id);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Monthly Closing" }]} />}
        title="Monthly financial closing"
        description="A guided monthly review: check account balances, income, expenses, transfers, SIP contributions, investment valuations, loan balances, lending repayments, insurance premiums, asset changes, goals, and unusual transactions, then close the month to freeze a dated report."
      />
      <MonthlyClosingList
        householdId={household.id}
        currencyCode={household.base_currency_code}
        periods={periods}
      />
    </PageShell>
  );
}
