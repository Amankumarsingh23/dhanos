import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { listDecisions } from "@/features/decisions/queries";
import { DecisionsManager } from "@/features/decisions/decisions-manager";
import { fetchDecisionEntityOptions } from "@/features/decisions/entity-options";
import {
  decisionEntityTypeSchema,
  decisionStatusSchema,
  type DecisionEntityType,
  type DecisionStatus,
} from "@/lib/validation/decisions";

export const metadata: Metadata = {
  title: "Decision Journal — DhanOS",
};

type DecisionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DecisionsPage({
  searchParams,
}: DecisionsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const statusParsed = decisionStatusSchema.safeParse(params.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const entityTypeParsed = decisionEntityTypeSchema.safeParse(params.entityType);
  const entityType = entityTypeParsed.success ? entityTypeParsed.data : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [decisions, entityOptions] = await Promise.all([
    listDecisions(
      supabase,
      household.id,
      { search, status, entityType },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    fetchDecisionEntityOptions(supabase, household.id),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Decision Journal" }]} />}
        title="Decision Journal"
        description="The reasoning behind significant financial decisions, captured at the time — never rewritten in hindsight."
      />

      <DecisionsManager
        householdId={household.id}
        decisions={decisions}
        filters={{
          search,
          status: (status ?? "") as DecisionStatus | "",
          entityType: (entityType ?? "") as DecisionEntityType | "",
        }}
        entityOptions={entityOptions}
      />
    </PageShell>
  );
}
