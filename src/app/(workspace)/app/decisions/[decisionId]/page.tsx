import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { NotFoundError } from "@/lib/errors/app-error";
import {
  getDecisionDetail,
  resolveDecisionEntityLinks,
} from "@/features/decisions/queries";
import { fetchDecisionEntityOptions } from "@/features/decisions/entity-options";
import { DecisionDetailView } from "@/features/decisions/decision-detail-view";

type DecisionDetailPageProps = {
  params: Promise<{ decisionId: string }>;
};

export async function generateMetadata({
  params,
}: DecisionDetailPageProps): Promise<Metadata> {
  const { decisionId } = await params;
  return { title: `Decision — DhanOS`, description: decisionId };
}

export default async function DecisionDetailPage({
  params,
}: DecisionDetailPageProps) {
  const { decisionId } = await params;
  const { household } = await requireHousehold();
  const supabase = await createClient();

  let decision;
  try {
    decision = await getDecisionDetail(supabase, household.id, decisionId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  async function fetchTitle(id: string | null): Promise<string | null> {
    if (!id) return null;
    const response = await supabase
      .from("decision_journal_entries")
      .select("title")
      .eq("id", id)
      .eq("household_id", household.id)
      .maybeSingle();
    return response.data?.title ?? null;
  }

  const [entityLinks, entityOptions, supersedesTitle, supersededByTitle] =
    await Promise.all([
      resolveDecisionEntityLinks(supabase, household.id, [decision]),
      fetchDecisionEntityOptions(supabase, household.id),
      fetchTitle(decision.supersedes_entry_id),
      fetchTitle(decision.supersededByEntryId),
    ]);

  const entityLink =
    decision.entity_type && decision.entity_id
      ? entityLinks.get(`${decision.entity_type}:${decision.entity_id}`) ?? null
      : null;

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Decision Journal", href: "/app/decisions" },
              { label: decision.title },
            ]}
          />
        }
        title={decision.title}
      />

      <DecisionDetailView
        householdId={household.id}
        decision={decision}
        entityLink={entityLink}
        supersedesTitle={supersedesTitle}
        supersededByTitle={supersededByTitle}
        entityOptions={entityOptions}
      />
    </PageShell>
  );
}
