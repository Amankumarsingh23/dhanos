import Link from "next/link";
import { WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { EmptyState } from "@/components/shared/empty-state";

function HomeActions() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Button asChild>
        <Link href="/login">Sign in</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/signup">Create account</Link>
      </Button>
    </div>
  );
}

export default function HomePage() {
  return (
    <PageShell size="narrow">
      <div className="flex flex-col items-center gap-8 py-12 text-center">
        <div className="space-y-2">
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            DhanOS
          </h1>
          <p className="text-muted-foreground">
            Your personal financial operating system.
          </p>
        </div>
        <EmptyState
          icon={WalletIcon}
          title="Financial modules aren't built yet"
          description="This build covers the engineering foundation — tooling, layouts, and shared components. See docs/implementation-status.md for what's next."
          action={<HomeActions />}
        />
      </div>
    </PageShell>
  );
}
