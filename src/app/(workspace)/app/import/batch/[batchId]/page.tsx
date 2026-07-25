import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  canManageHousehold,
  requireHousehold,
} from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { createSignedDownloadUrl } from "@/lib/storage";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getImportBatchDetail } from "@/features/imports/queries";
import { getImportFieldDefinitions, IMPORT_TYPE_LABELS } from "@/features/imports/types";
import { BatchActions } from "@/features/imports/batch-actions";
import type { NotFoundError } from "@/lib/errors/app-error";

export const metadata: Metadata = {
  title: "Import — DhanOS",
};

type BatchPageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  imported: "secondary",
  skipped_duplicate: "outline",
  rejected: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Ready to import",
  imported: "Imported",
  skipped_duplicate: "Skipped (duplicate)",
  rejected: "Rejected",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready: "Ready to confirm",
  completed: "Completed",
  failed: "Failed",
  rolled_back: "Rolled back",
};

export default async function ImportBatchPage({ params, searchParams }: BatchPageProps) {
  const { batchId } = await params;
  const { household, membership } = await requireHousehold();
  const sp = await searchParams;
  const statusFilter = typeof sp.status === "string" ? sp.status : undefined;
  const page = typeof sp.page === "string" ? Number(sp.page) : 1;

  const supabase = await createClient();

  let detail;
  try {
    detail = await getImportBatchDetail(
      supabase,
      household.id,
      batchId,
      statusFilter,
      { page, pageSize: 50 },
    );
  } catch (error) {
    if ((error as NotFoundError).name === "NotFoundError") {
      notFound();
    }
    throw error;
  }

  const { batch, rows } = detail;
  const fieldDefs = getImportFieldDefinitions(
    batch.import_type as "transactions" | "account_balances" | "investment_valuations",
  );

  const fileUrl = batch.stored_file_path
    ? await createSignedDownloadUrl("documents", batch.stored_file_path).catch(
        () => null,
      )
    : null;

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Import", href: "/app/import" }, { label: batch.original_filename }]}
          />
        }
        title={batch.original_filename}
        description={`${IMPORT_TYPE_LABELS[batch.import_type as keyof typeof IMPORT_TYPE_LABELS]} import`}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="secondary">
                {BATCH_STATUS_LABELS[batch.status] ?? batch.status}
              </Badge>
              <span className="text-muted-foreground text-sm">
                {batch.total_row_count} row(s) total
              </span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">Imported</dt>
                <dd className="text-lg font-medium">{batch.imported_row_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Skipped (duplicate)</dt>
                <dd className="text-lg font-medium">{batch.skipped_row_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Rejected</dt>
                <dd className="text-lg font-medium">{batch.rejected_row_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Awaiting confirmation
                </dt>
                <dd className="text-lg font-medium">
                  {batch.status === "ready"
                    ? batch.total_row_count -
                      batch.skipped_row_count -
                      batch.rejected_row_count
                    : 0}
                </dd>
              </div>
            </dl>
            {fileUrl && (
              <p className="text-sm">
                <a href={fileUrl} className="hover:underline" target="_blank" rel="noreferrer">
                  Download the original file →
                </a>
              </p>
            )}
            <BatchActions
              householdId={household.id}
              batch={batch}
              canWrite={membership.role !== "viewer"}
              canManage={canManageHousehold(membership.role)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Rows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {["pending", "imported", "skipped_duplicate", "rejected"].map((status) => (
                <Link
                  key={status}
                  href={`/app/import/batch/${batchId}${status === statusFilter ? "" : `?status=${status}`}`}
                  className={`rounded-full border px-2.5 py-1 ${status === statusFilter ? "bg-muted" : ""}`}
                >
                  {STATUS_LABELS[status]}
                </Link>
              ))}
              {statusFilter && (
                <Link
                  href={`/app/import/batch/${batchId}`}
                  className="text-muted-foreground rounded-full border px-2.5 py-1"
                >
                  Clear filter
                </Link>
              )}
            </div>

            {rows.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No rows match this filter.</p>
            ) : (
              <div className="divide-border divide-y">
                {rows.rows.map((row) => (
                  <div key={row.id} className="space-y-1 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        Row {row.row_number}
                      </span>
                      <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? "outline"}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {fieldDefs
                        .map((field) => {
                          const value = (row.raw_data as Record<string, string | null>)[
                            field.key
                          ];
                          return value ? `${field.label}: ${value}` : null;
                        })
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {row.error_message && (
                      <p className="text-destructive text-xs">{row.error_message}</p>
                    )}
                    {row.duplicate_reason && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        {row.duplicate_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
