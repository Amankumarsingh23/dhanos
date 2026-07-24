"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDisplayDate } from "@/lib/dates";
import {
  MONTHLY_CLOSING_STATUS_LABELS,
  type MonthlyClosingStatus,
} from "@/lib/validation/monthly-closing";
import { startMonthlyClosingAction } from "./actions";
import type { MonthlyClosingPeriodSummary } from "./queries";

type MonthlyClosingListProps = {
  householdId: string;
  currencyCode: string;
  periods: MonthlyClosingPeriodSummary[];
};

function statusBadgeVariant(
  status: MonthlyClosingStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "closed") return "secondary";
  if (status === "reopened") return "destructive";
  return "outline";
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthlyClosingList({
  householdId,
  currencyCode,
  periods,
}: MonthlyClosingListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());

  function handleStart(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await startMonthlyClosingAction(householdId, {
        period,
        currencyCode,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success(`Closing started for ${period}`);
      router.push(`/app/monthly-closing/${result.data.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Start a monthly closing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleStart}
            className="flex flex-wrap items-end gap-3"
          >
            {formError && (
              <Alert variant="destructive" className="w-full">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="period">Period</Label>
              <Input
                id="period"
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Starting…" : "Start closing"}
            </Button>
          </form>
          <p className="text-muted-foreground mt-3 text-xs">
            You&rsquo;ll review 12 checklist items, then complete the closing to
            freeze that month&rsquo;s income, expense, investment, and debt
            totals alongside a net-worth snapshot.
          </p>
        </CardContent>
      </Card>

      {periods.length === 0 ? (
        <EmptyState
          title="No monthly closings yet"
          description="Start your first monthly closing above to begin building a reviewed, dated history of your finances."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Period</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Completed</th>
                <th className="px-4 py-2.5 font-medium">Net worth</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {periods.map(({ period: p, currentClosing, closingCount }) => (
                <tr key={p}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/monthly-closing/${currentClosing.id}`}
                      className="hover:underline"
                    >
                      {p}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={statusBadgeVariant(
                        currentClosing.status as MonthlyClosingStatus,
                      )}
                    >
                      {
                        MONTHLY_CLOSING_STATUS_LABELS[
                          currentClosing.status as MonthlyClosingStatus
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {currentClosing.completed_at
                      ? formatDisplayDate(
                          currentClosing.completed_at.slice(0, 10),
                        )
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {currentClosing.net_worth_snapshot_id ? (
                      <span className="text-muted-foreground text-xs">
                        Linked
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    v{currentClosing.report_version}
                    {closingCount > 1 && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        ({closingCount} records)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/app/monthly-closing/${currentClosing.id}`}>
                        {currentClosing.status === "in_progress"
                          ? "Continue"
                          : "View"}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
