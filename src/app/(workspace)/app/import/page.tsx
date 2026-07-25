import type { Metadata } from "next";
import Link from "next/link";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IMPORT_TYPE_DESCRIPTIONS,
  IMPORT_TYPE_LABELS,
} from "@/features/imports/types";
import { listImportBatches } from "@/features/imports/queries";
import { importTypeSchema } from "@/lib/validation/imports";

export const metadata: Metadata = {
  title: "Import — DhanOS",
};

const IMPORT_TYPES = importTypeSchema.options;

const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to confirm",
  completed: "Completed",
  failed: "Failed",
  rolled_back: "Rolled back",
};

/**
 * The CSV import hub (PROMPT 41) — pick an import type, or jump back into
 * a recent batch. Manual entry remains the primary, always-available path
 * for every entity this app tracks; import is an additional way in for
 * bulk history, never a replacement (see docs/product-scope.md §4: "data
 * entry is manual or CSV import ... no automated bank feed ingestion").
 */
export default async function ImportHubPage() {
  const { household } = await requireHousehold();
  const supabase = await createClient();
  const recentBatches = await listImportBatches(supabase, household.id, {
    pageSize: 10,
  });

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Import" }]} />}
        title="Import"
        description="Bring in transactions, account balances, or investment valuations from a CSV file — never an automatic bank login."
      />

      <Alert className="mb-8">
        <AlertDescription>
          Every row is previewed, validated, and checked for likely
          duplicates before anything is written — nothing is imported until
          you explicitly confirm.
        </AlertDescription>
      </Alert>

      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {IMPORT_TYPES.map((importType) => (
          <Link key={importType} href={`/app/import/${importType}`}>
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader>
                <CardTitle className="text-base font-medium">
                  {IMPORT_TYPE_LABELS[importType]}
                </CardTitle>
                <CardDescription>
                  {IMPORT_TYPE_DESCRIPTIONS[importType]}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Recent imports</h2>
        {recentBatches.rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No imports yet — choose a type above to get started.
          </p>
        ) : (
          <div className="divide-border divide-y rounded-lg border">
            {recentBatches.rows.map((batch) => (
              <Link
                key={batch.id}
                href={`/app/import/batch/${batch.id}`}
                className="hover:bg-accent/50 flex items-center justify-between gap-4 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{batch.original_filename}</p>
                  <p className="text-muted-foreground text-xs">
                    {IMPORT_TYPE_LABELS[batch.import_type as keyof typeof IMPORT_TYPE_LABELS]}{" "}
                    · {new Date(batch.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="secondary">
                  {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
