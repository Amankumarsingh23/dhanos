import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REPORT_CATEGORIES, reportsByCategory } from "@/features/reports/registry";

export const metadata: Metadata = {
  title: "Reports — DhanOS",
};

/**
 * The reporting centre hub (PROMPT 36) — every report answers one named
 * question (shown as its card description), grouped by the same product
 * areas the rest of the app's navigation uses. Each card links to
 * `/app/reports/[slug]`, which applies whichever shared filters that
 * specific report supports and renders its chart + reconciling table.
 */
export default function ReportsPage() {
  const grouped = reportsByCategory();

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Reports" }]} />}
        title="Reports"
        description="Point-in-time and period-based reports, each with a stated date range, data cutoff, and an exportable table that always reconciles with its chart."
      />

      <div className="space-y-8">
        {REPORT_CATEGORIES.map((category) => {
          const reports = grouped.get(category) ?? [];
          if (reports.length === 0) return null;
          return (
            <section key={category} className="space-y-3">
              <h2 className="text-sm font-medium">{category}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => (
                  <Link key={report.slug} href={`/app/reports/${report.slug}`}>
                    <Card className="h-full transition-colors hover:bg-accent/50">
                      <CardHeader>
                        <CardTitle className="text-base font-medium">
                          {report.label}
                        </CardTitle>
                        <CardDescription>{report.question}</CardDescription>
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
