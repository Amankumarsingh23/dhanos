import type { Metadata } from "next";
import { requireHousehold } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SummaryCard } from "@/components/shared/summary-card";
import { getDocumentsOverview, listDocuments } from "@/features/documents/queries";
import { DocumentsManager } from "@/features/documents/documents-manager";
import {
  documentCategorySchema,
  type DocumentCategory,
} from "@/lib/validation/documents";

export const metadata: Metadata = {
  title: "Documents — DhanOS",
};

type DocumentsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  const { household } = await requireHousehold();
  const params = await searchParams;

  const search = typeof params.search === "string" ? params.search : "";
  const categoryParsed = documentCategorySchema.safeParse(params.category);
  const category = categoryParsed.success ? categoryParsed.data : undefined;
  const includeArchived = params.archived === "true";
  const page = typeof params.page === "string" ? Number(params.page) : 1;

  const supabase = await createClient();
  const [documentsPage, overview] = await Promise.all([
    listDocuments(
      supabase,
      household.id,
      { search, category, includeArchived },
      { page: Number.isFinite(page) && page > 0 ? page : 1 },
    ),
    getDocumentsOverview(supabase, household.id),
  ]);

  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Documents" }]} />}
        title="Documents"
        description="Statements, policies, and receipts — stored in a private vault, never a public link. Every view uses a short-lived signed URL, generated only after your household membership is re-checked server-side."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Active documents"
          amount={String(overview.activeCount)}
          caption="Not archived"
        />
        <SummaryCard
          title="Expiring soon"
          amount={String(overview.expiringSoonCount)}
          caption="Within the next 30 days"
        />
        <SummaryCard
          title="Archived"
          amount={String(overview.archivedCount)}
          caption="Kept, but out of the main list"
        />
        <SummaryCard
          title="Storage used"
          amount={formatBytes(overview.totalSizeBytes)}
          caption="Across every uploaded document"
        />
      </div>

      <DocumentsManager
        householdId={household.id}
        documents={documentsPage}
        filters={{
          search,
          category: (category ?? "") as DocumentCategory | "",
          includeArchived,
        }}
      />
    </PageShell>
  );
}
