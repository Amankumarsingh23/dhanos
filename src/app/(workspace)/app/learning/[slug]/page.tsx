import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { getTodayInTimeZone } from "@/lib/dates";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLearningTopic } from "@/features/learning/content";
import { getLearningInsights } from "@/features/learning/queries";
import { LearningInsightSingle } from "@/features/learning/insights-panel";

type LearningTopicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: LearningTopicPageProps): Promise<Metadata> {
  const { slug } = await params;
  const topic = getLearningTopic(slug);
  return {
    title: topic
      ? `${topic.title} — Money Classroom — DhanOS`
      : "Money Classroom — DhanOS",
  };
}

/**
 * One Money Classroom topic (PROMPT 38) — content is entirely static and
 * source-controlled (src/features/learning/content.ts); the only dynamic
 * part of this page is the one personalized insight relevant to this topic
 * (if any), computed fresh from the household's own records via
 * src/features/learning/queries.ts and never guessed when that data doesn't
 * exist yet.
 */
export default async function LearningTopicPage({
  params,
}: LearningTopicPageProps) {
  const { slug } = await params;
  const topic = getLearningTopic(slug);
  if (!topic) {
    notFound();
  }

  const { household } = await requireHousehold();

  let insightSection: ReactNode = null;
  if (topic.relatedInsightKey) {
    const supabase = await createClient();
    const asOfDate = getTodayInTimeZone(household.timezone);
    const insights = await getLearningInsights(
      supabase,
      household.id,
      household.base_currency_code,
      asOfDate,
    );
    insightSection = (
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Your own numbers</h2>
        <LearningInsightSingle
          insightKey={topic.relatedInsightKey}
          insights={insights}
        />
      </div>
    );
  }

  return (
    <PageShell size="default">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Money Classroom", href: "/app/learning" },
              { label: topic.title },
            ]}
          />
        }
        title={topic.title}
        description={topic.summary}
      />

      <Alert className="mb-8">
        <AlertDescription>
          This is educational content, not individualized financial advice.
        </AlertDescription>
      </Alert>

      <div className="space-y-8">
        {insightSection}

        <div className="space-y-6">
          {topic.sections.map((section) => (
            <Card key={section.heading}>
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  {section.heading}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground space-y-3 text-sm">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Key takeaways
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
              {topic.keyTakeaways.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
