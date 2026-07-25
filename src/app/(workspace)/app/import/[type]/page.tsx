import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireHousehold } from "@/lib/households/permissions";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { importTypeSchema } from "@/lib/validation/imports";
import {
  IMPORT_TYPE_DESCRIPTIONS,
  IMPORT_TYPE_LABELS,
} from "@/features/imports/types";
import { ImportWizard } from "@/features/imports/import-wizard";

type ImportTypePageProps = {
  params: Promise<{ type: string }>;
};

export async function generateMetadata({
  params,
}: ImportTypePageProps): Promise<Metadata> {
  const { type } = await params;
  const parsed = importTypeSchema.safeParse(type);
  return {
    title: parsed.success
      ? `Import ${IMPORT_TYPE_LABELS[parsed.data]} — DhanOS`
      : "Import — DhanOS",
  };
}

export default async function ImportTypePage({ params }: ImportTypePageProps) {
  const { type } = await params;
  const parsed = importTypeSchema.safeParse(type);
  if (!parsed.success) {
    notFound();
  }
  const importType = parsed.data;

  const { household } = await requireHousehold();

  return (
    <PageShell size="default">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Import", href: "/app/import" },
              { label: IMPORT_TYPE_LABELS[importType] },
            ]}
          />
        }
        title={`Import ${IMPORT_TYPE_LABELS[importType]}`}
        description={IMPORT_TYPE_DESCRIPTIONS[importType]}
      />
      <ImportWizard householdId={household.id} importType={importType} />
    </PageShell>
  );
}
