import type { Metadata } from "next";
import Link from "next/link";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { getTodayInTimeZone } from "@/lib/dates";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LEARNING_CATEGORIES,
  learningTopicsByCategory,
} from "@/features/learning/content";
import { getLearningInsights } from "@/features/learning/queries";
import { LearningInsightsPanel } from "@/features/learning/insights-panel";

export const metadata: Metadata = {
  title: "Money Classroom — DhanOS",
};

/**
 * The Money Classroom hub (PROMPT 38) — a fixed, source-controlled catalogue
 * of financial-literacy topics (see src/features/learning/content.ts),
 * grouped by category, plus a panel of the six personalized insights the
 * prompt names, each computed deterministically from the household's own
 * records and linked back to them. This is educational content, not
 * individualized financial advice — the standing disclaimer below applies
 * to every page under /app/learning.
 */
export default async function LearningPage() {
  const { household } = await requireHousehold();
  const supabase = await createClient();
  const asOfDate = getTodayInTimeZone(household.timezone);

  const insights = await getLearningInsights(
    supabase,
    household.id,
    household.base_currency_code,
    asOfDate,
  );
  const grouped = learningTopicsByCategory();

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Money Classroom" }]} />}
        title="Money Classroom"
        description="Plain-language explanations of core financial concepts, plus a few deterministic figures computed from your own records."
      />

      <Alert className="mb-8">
        <AlertDescription>
          This is educational content, not individualized financial advice.
          Nothing here recommends a specific product, tells you to take a
          loan, or states a guaranteed return — see each topic for what it
          does and doesn&rsquo;t cover.
        </AlertDescription>
      </Alert>

      <div className="mb-10 space-y-3">
        <h2 className="text-sm font-medium">
          Your numbers, computed from your own records
        </h2>
        <LearningInsightsPanel insights={insights} />
      </div>

      <div className="space-y-8">
        {LEARNING_CATEGORIES.map((category) => {
          const topics = grouped.get(category) ?? [];
          if (topics.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <h2 className="text-sm font-medium">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {topics.map((topic) => (
                  <Link key={topic.slug} href={`/app/learning/${topic.slug}`}>
                    <Card className="h-full transition-colors hover:bg-accent/50">
                      <CardHeader>
                        <CardTitle className="text-base font-medium">
                          {topic.title}
                        </CardTitle>
                        <CardDescription>{topic.summary}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
