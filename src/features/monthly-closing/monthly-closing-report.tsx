"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  MONTHLY_CLOSING_STATUS_LABELS,
  type MonthlyClosingStatus,
} from "@/lib/validation/monthly-closing";
import { GOAL_TYPE_LABELS, type GoalType } from "@/lib/validation/goals";
import type { GoalOnTrackStatus } from "@/lib/calculations/goals";
import { ReopenClosingDialog } from "./reopen-closing-dialog";
import type { MonthlyClosingReport as MonthlyClosingReportData } from "./queries";

type MonthlyClosingReportProps = {
  householdId: string;
  report: MonthlyClosingReportData;
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

const ON_TRACK_LABELS: Record<GoalOnTrackStatus, string> = {
  funded: "Funded",
  on_track: "On track",
  needs_contribution: "Needs contribution",
  overdue: "Overdue",
};

export function MonthlyClosingReport({
  householdId,
  report,
}: MonthlyClosingReportProps) {
  const router = useRouter();
  const { closing } = report;
  const currencyCode = closing.currency_code;
  const [reopenOpen, setReopenOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {closing.period}
              <Badge
                variant={
                  closing.status === "reopened" ? "destructive" : "secondary"
                }
              >
                {
                  MONTHLY_CLOSING_STATUS_LABELS[
                    closing.status as MonthlyClosingStatus
                  ]
                }
              </Badge>
              <Badge variant="outline">v{closing.report_version}</Badge>
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              Completed{" "}
              {closing.completed_at
                ? formatDisplayDate(closing.completed_at.slice(0, 10))
                : "—"}
            </p>
          </div>
          {closing.status === "closed" && (
            <Button variant="outline" onClick={() => setReopenOpen(true)}>
              Reopen
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!report.completeness.isComplete && (
            <Alert className="mb-4">
              <AlertTriangleIcon />
              <AlertDescription>
                <p className="font-medium">
                  This report is based on incomplete data:
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {report.completeness.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {closing.status === "reopened" && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                This closing was reopened
                {closing.reopened_at &&
                  ` on ${formatDisplayDate(closing.reopened_at.slice(0, 10))}`}
                {closing.reopen_reason && `: "${closing.reopen_reason}"`}. The
                figures below are exactly what was recorded at the original
                completion time — look for a newer version of this period if one
                exists.
              </AlertDescription>
            </Alert>
          )}
          {closing.notes && (
            <p className="text-muted-foreground mb-4 text-sm">
              <span className="font-medium">Notes: </span>
              {closing.notes}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Income"
              amount={money(
                closing.income_total_minor_units ?? 0,
                currencyCode,
              )}
            />
            <SummaryCard
              title="Expenses"
              amount={money(
                closing.expense_total_minor_units ?? 0,
                currencyCode,
              )}
            />
            <SummaryCard
              title="Free cash flow"
              amount={money(
                closing.net_cash_flow_minor_units ?? 0,
                currencyCode,
              )}
              caption="Income − expenses − debt payments"
            />
            <SummaryCard
              title="Investment contribution"
              amount={money(
                closing.investment_contribution_minor_units ?? 0,
                currencyCode,
              )}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Debt payment"
              amount={money(
                closing.debt_payment_minor_units ?? 0,
                currencyCode,
              )}
            />
            <SummaryCard
              title="Debt reduction"
              amount={
                report.netWorth.debtReductionMinorUnits !== null
                  ? money(report.netWorth.debtReductionMinorUnits, currencyCode)
                  : "—"
              }
              caption="Vs. the prior net-worth snapshot"
            />
            <SummaryCard
              title="Net worth"
              amount={
                report.netWorth.currentMinorUnits !== null
                  ? money(report.netWorth.currentMinorUnits, currencyCode)
                  : "—"
              }
            />
            <SummaryCard
              title="Net worth change"
              amount={
                report.netWorth.changeMinorUnits !== null
                  ? money(report.netWorth.changeMinorUnits, currencyCode)
                  : "—"
              }
              caption="Vs. the prior net-worth snapshot"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Major/unusual expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.majorUnusualExpenses.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No expenses recorded this period.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {report.majorUnusualExpenses.map((expense) => (
                  <li
                    key={expense.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="truncate">
                      {expense.description ?? expense.counterparty ?? "Expense"}
                    </span>
                    <span className="font-medium">
                      {money(expense.amount_minor_units, currencyCode)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Missed commitments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.missedCommitments.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing overdue as of this closing.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {report.missedCommitments.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex items-center justify-between py-2"
                  >
                    <Link
                      href={`/app/recurring/${rule.id}`}
                      className="truncate hover:underline"
                    >
                      {rule.name}
                    </Link>
                    <span className="font-medium">
                      {money(rule.currentAmountMinorUnits, rule.currency_code)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Goal progress</CardTitle>
          </CardHeader>
          <CardContent>
            {report.goals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No active goals to report on.
              </p>
            ) : (
              <ul className="divide-border divide-y text-sm">
                {report.goals.map((goal) => (
                  <li key={goal.id} className="py-2">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/app/goals/${goal.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {goal.name}
                      </Link>
                      <Badge variant="outline">
                        {ON_TRACK_LABELS[goal.onTrackStatus]}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {GOAL_TYPE_LABELS[goal.goal_type as GoalType]} — gap{" "}
                      {money(goal.fundingGapMinorUnits, goal.currency_code)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Upcoming obligations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.upcomingRecurring.length === 0 &&
            report.upcomingInsuranceRenewals.length === 0 &&
            report.upcomingMoneyDrainRenewals.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing due in the next couple of weeks.
              </p>
            ) : (
              <>
                {report.upcomingRecurring.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{rule.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {rule.next_due_date
                        ? formatDisplayDate(rule.next_due_date)
                        : "—"}
                    </span>
                  </div>
                ))}
                {report.upcomingInsuranceRenewals.map((policy) => (
                  <div
                    key={policy.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{policy.name} (insurance)</span>
                    <span className="text-muted-foreground text-xs">
                      {(policy.renewal_date ?? policy.expiry_date)
                        ? formatDisplayDate(
                            (policy.renewal_date ?? policy.expiry_date)!,
                          )
                        : "—"}
                    </span>
                  </div>
                ))}
                {report.upcomingMoneyDrainRenewals.map((drain) => (
                  <div
                    key={drain.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="truncate">{drain.item}</span>
                    <span className="text-muted-foreground text-xs">
                      {drain.next_renewal_date
                        ? formatDisplayDate(drain.next_renewal_date)
                        : "—"}
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ReopenClosingDialog
        householdId={householdId}
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        monthlyClosingId={closing.id}
        period={closing.period}
        onReopened={() => router.refresh()}
      />
    </div>
  );
}
