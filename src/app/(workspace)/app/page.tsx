import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { createMoney, formatMoney, subtractMoney } from "@/lib/money";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { FinancialPrivacyNotice } from "@/components/shared/financial-privacy-notice";
import { SummaryCard } from "@/components/shared/summary-card";

// Static title only — never put amounts (or anything derived from them)
// into metadata/browser titles. See docs/security-model.md.
export const metadata: Metadata = {
  title: "Dashboard — DhanOS",
};

export default async function DashboardPage() {
  const { household } = await requireHousehold();

  const supabase = await createClient();
  const { data: snapshot } = await supabase
    .from("net_worth_snapshots")
    .select("*")
    .eq("household_id", household.id)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const zero = formatMoney(createMoney(0, household.base_currency_code));

  const netWorth = snapshot
    ? formatMoney(
        subtractMoney(
          createMoney(
            snapshot.total_assets_minor_units,
            snapshot.currency_code,
          ),
          createMoney(
            snapshot.total_liabilities_minor_units,
            snapshot.currency_code,
          ),
        ),
      )
    : zero;

  const snapshotCaption = snapshot
    ? `As of ${snapshot.as_of_date}`
    : "No snapshot recorded yet";

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Dashboard" }]} />}
        title="Dashboard"
        description={`An overview of ${household.name}'s finances.`}
      />
      <div className="space-y-6">
        <FinancialPrivacyNotice />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            title="Net worth"
            amount={netWorth}
            caption={snapshotCaption}
          />
          <SummaryCard
            title="Income this month"
            amount={zero}
            caption="Income tracking hasn't been built yet"
          />
          <SummaryCard
            title="Expenses this month"
            amount={zero}
            caption="Expense tracking hasn't been built yet"
          />
          <SummaryCard
            title="Investments"
            amount={zero}
            caption="Investment tracking hasn't been built yet"
          />
          <SummaryCard
            title="Debts"
            amount={zero}
            caption="Debt tracking hasn't been built yet"
          />
          <SummaryCard
            title="Account balances"
            amount={zero}
            caption="Accounts haven't been built yet"
          />
        </div>
      </div>
    </PageShell>
  );
}
