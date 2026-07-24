import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { toIsoDateString } from "@/lib/dates";
import { listAccounts } from "@/features/accounts/queries";
import { listCalculatorScenarios } from "@/features/calculators/queries";
import { CalculatorsManager } from "@/features/calculators/calculators-manager";

export const metadata: Metadata = {
  title: "Calculators — DhanOS",
};

export default async function CalculatorsPage() {
  const { household } = await requireHousehold();
  const currencyCode = household.base_currency_code;
  const today = toIsoDateString(new Date());

  const supabase = await createClient();
  const [accountsPage, scenarios] = await Promise.all([
    listAccounts(supabase, household.id, {}, { pageSize: 100 }),
    listCalculatorScenarios(supabase, household.id),
  ]);

  const accounts = accountsPage.rows
    .filter((account) => account.currency_code === currencyCode)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currencyCode: account.currency_code,
      currentBalanceMinorUnits: account.currentBalance.amountMinorUnits,
    }));

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Calculators" }]} />}
        title="Financial calculators"
        description="Standalone and account-linked what-if tools — every figure here is a projection based on assumptions you enter, never a guarantee. Nothing is saved unless you explicitly choose to."
      />

      <CalculatorsManager
        householdId={household.id}
        currencyCode={currencyCode}
        today={today}
        accounts={accounts}
        scenarios={scenarios}
      />
    </PageShell>
  );
}
