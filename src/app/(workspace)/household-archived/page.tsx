import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getCurrentHousehold } from "@/lib/households/permissions";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

export const metadata: Metadata = {
  title: "Household archived — DhanOS",
};

/**
 * The dead end requireHousehold() redirects to for an archived household
 * (PROMPT 40's "archive, never delete" dangerous action) — deliberately not
 * /onboarding, since re-onboarding would just resolve back to this same
 * household via get_or_create_household's per-user idempotency and loop.
 * Nothing here is destructive: the household's data is fully intact,
 * exactly as it was, only unreachable through the normal app shell.
 */
export default async function HouseholdArchivedPage() {
  await requireUser();
  const current = await getCurrentHousehold();

  if (!current) {
    redirect("/onboarding");
  }
  if (!current.household.deleted_at) {
    redirect("/app");
  }

  return (
    <PageShell size="narrow">
      <Card>
        <CardHeader>
          <CardTitle>This household has been archived</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            <span className="font-medium">
              {current.household.name}
            </span>{" "}
            was archived on{" "}
            {new Date(current.household.deleted_at).toLocaleDateString(
              "en-IN",
              { year: "numeric", month: "long", day: "numeric" },
            )}
            .
          </p>
          <p className="text-muted-foreground">
            Nothing was deleted — every account, transaction, and record is
            preserved exactly as it was. This household is just no longer
            reachable through the normal app for any member. If this was a
            mistake or you need it restored, contact support.
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
