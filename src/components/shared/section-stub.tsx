import { ConstructionIcon } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";

type SectionStubProps = {
  title: string;
  description: string;
};

/**
 * Placeholder body for a launched-but-empty navigation section. The route
 * exists (so navigation, deep links, and refresh behave correctly from day
 * one); the module's real UI replaces this as it ships — see
 * docs/implementation-status.md §3 for sequencing.
 */
export function SectionStub({ title, description }: SectionStubProps) {
  return (
    <PageShell size="wide">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[{ label: "Dashboard", href: "/app" }, { label: title }]}
          />
        }
        title={title}
        description={description}
      />
      <EmptyState
        icon={ConstructionIcon}
        title={`${title} isn't built yet`}
        description="This section is on the roadmap — see docs/implementation-status.md for sequencing."
      />
    </PageShell>
  );
}
