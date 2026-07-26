"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SummaryCard } from "@/components/shared/summary-card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  RECURRING_FREQUENCY_LABELS,
  RECURRING_RULE_KIND_LABELS,
  RECURRING_RULE_STATUS_LABELS,
  type RecurringFrequency,
  type RecurringRuleKind,
  type RecurringRuleStatus,
} from "@/lib/validation/recurring-rules";
import {
  catchUpRecurringRuleAction,
  endRecurringRuleAction,
  pauseRecurringRuleAction,
  reactivateRecurringRuleAction,
  resumeRecurringRuleAction,
  skipOccurrenceAction,
} from "./actions";
import {
  RecurringRuleDialog,
  type AccountOption,
  type CategoryOption,
  type PersonOption,
} from "./recurring-rule-dialog";
import { AmountChangeDialog } from "./amount-change-dialog";
import { RecordOccurrenceDialog } from "./record-occurrence-dialog";
import type { RecurringRuleDetail } from "./queries";

type RecurringDetailViewProps = {
  householdId: string;
  rule: RecurringRuleDetail;
  accounts: AccountOption[];
  categories: CategoryOption[];
  people: PersonOption[];
};

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  amount_scheduled: "Amount change scheduled",
  paused: "Paused",
  resumed: "Resumed",
  skipped: "Occurrence skipped",
  ended: "Ended",
  occurrence_generated: "Occurrence recorded",
  reactivated: "Reactivated",
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

export function RecurringDetailView({
  householdId,
  rule,
  accounts,
  categories,
  people,
}: RecurringDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [amountChangeOpen, setAmountChangeOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);
  const [catchUpConfirmOpen, setCatchUpConfirmOpen] = useState(false);
  const [reactivateConfirmOpen, setReactivateConfirmOpen] = useState(false);

  async function handlePauseResumeConfirm() {
    const action =
      rule.status === "paused"
        ? resumeRecurringRuleAction
        : pauseRecurringRuleAction;
    const result = await action(householdId, { recurringRuleId: rule.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(rule.status === "paused" ? "Rule resumed" : "Rule paused");
    router.refresh();
  }

  async function handleEndConfirm() {
    const result = await endRecurringRuleAction(householdId, {
      recurringRuleId: rule.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rule ended");
    router.refresh();
  }

  async function handleSkipConfirm() {
    const result = await skipOccurrenceAction(householdId, {
      recurringRuleId: rule.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Occurrence skipped");
    router.refresh();
  }

  async function handleCatchUpConfirm() {
    const result = await catchUpRecurringRuleAction(householdId, {
      recurringRuleId: rule.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.recordedCount === 0
        ? "Already up to date — nothing to catch up"
        : `Recorded ${result.data.recordedCount} occurrence${result.data.recordedCount === 1 ? "" : "s"}`,
    );
    router.refresh();
  }

  async function handleReactivateConfirm() {
    const result = await reactivateRecurringRuleAction(householdId, {
      recurringRuleId: rule.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Rule reactivated");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {RECURRING_RULE_KIND_LABELS[rule.kind as RecurringRuleKind]}
            </Badge>
            <Badge variant="outline">
              {RECURRING_FREQUENCY_LABELS[rule.frequency as RecurringFrequency]}
            </Badge>
            <Badge variant={rule.status === "active" ? "secondary" : "outline"}>
              {RECURRING_RULE_STATUS_LABELS[rule.status as RecurringRuleStatus]}
            </Badge>
            {rule.isMissed && (
              <Badge variant="destructive">
                <AlertTriangleIcon />
                Missed
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {[rule.accountName, rule.categoryName, rule.personName]
              .filter(Boolean)
              .join(" · ") || "No account, category, or person set"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rule.status === "active" && rule.next_due_date && (
            <>
              <Button onClick={() => setRecordOpen(true)}>
                Record occurrence
              </Button>
              {rule.isMissed && (
                <Button
                  variant="outline"
                  onClick={() => setCatchUpConfirmOpen(true)}
                >
                  Catch up missed occurrences
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setSkipConfirmOpen(true)}
              >
                Skip
              </Button>
            </>
          )}
          {rule.status === "ended" && (
            <Button onClick={() => setReactivateConfirmOpen(true)}>
              Reactivate
            </Button>
          )}
          <Button variant="outline" onClick={() => setAmountChangeOpen(true)}>
            Change amount
          </Button>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          {rule.status !== "ended" && (
            <>
              <Button
                variant="outline"
                onClick={() => setPauseConfirmOpen(true)}
              >
                {rule.status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setEndConfirmOpen(true)}
              >
                End
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title="Current amount"
          amount={money(rule.currentAmountMinorUnits, rule.currency_code)}
          caption={
            rule.amountSchedule.length > 0
              ? `${rule.amountSchedule.length} scheduled change${rule.amountSchedule.length === 1 ? "" : "s"}`
              : undefined
          }
        />
        <SummaryCard
          title="Next due"
          amount={
            rule.next_due_date ? formatDisplayDate(rule.next_due_date) : "—"
          }
          caption={
            rule.end_date
              ? `Ends ${formatDisplayDate(rule.end_date)}`
              : "No end date"
          }
        />
        <SummaryCard
          title="Last recorded"
          amount={
            rule.last_generated_date
              ? formatDisplayDate(rule.last_generated_date)
              : "Never"
          }
        />
      </div>

      {rule.amountSchedule.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled amount changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Effective from</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rule.amountSchedule.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2 pr-4">
                        {formatDisplayDate(entry.effective_date)}
                      </td>
                      <td className="py-2 pr-4">
                        <SensitiveAmount
                          value={money(
                            entry.amount_minor_units,
                            rule.currency_code,
                          )}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent occurrences</CardTitle>
        </CardHeader>
        <CardContent>
          {rule.recentOccurrences.length === 0 ? (
            <EmptyState
              headingLevel="h3"
              title="No occurrences recorded yet"
              description="Use “Record occurrence” to confirm the first one, or “Generate due occurrences” from the Recurring page for auto-create rules."
            />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rule.recentOccurrences.map((occurrence) => (
                    <tr key={occurrence.id}>
                      <td className="py-2 pr-4">
                        {formatDisplayDate(occurrence.transaction_date)}
                      </td>
                      <td className="py-2 pr-4">
                        <SensitiveAmount
                          value={money(
                            occurrence.amount_minor_units,
                            occurrence.currency_code,
                          )}
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            occurrence.status === "cancelled"
                              ? "outline"
                              : "secondary"
                          }
                        >
                          {occurrence.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recurrence history</CardTitle>
        </CardHeader>
        <CardContent>
          {rule.events.length === 0 ? (
            <EmptyState headingLevel="h3" title="No history yet" />
          ) : (
            <ul className="space-y-2">
              {rule.events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-b-0"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </Badge>
                    {event.occurrence_date && (
                      <span className="text-muted-foreground text-xs">
                        {formatDisplayDate(event.occurrence_date)}
                      </span>
                    )}
                    {event.event_type === "amount_scheduled" &&
                      event.previous_amount_minor_units !== null &&
                      event.new_amount_minor_units !== null && (
                        <span className="text-muted-foreground text-xs">
                          {money(
                            event.previous_amount_minor_units,
                            rule.currency_code,
                          )}
                          {" → "}
                          {money(
                            event.new_amount_minor_units,
                            rule.currency_code,
                          )}
                          {event.effective_date &&
                            ` from ${formatDisplayDate(event.effective_date)}`}
                        </span>
                      )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDisplayDate(event.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {rule.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground text-sm whitespace-pre-wrap">
              {rule.notes}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <RecurringRuleDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        rule={rule}
        accounts={accounts}
        categories={categories}
        people={people}
        onSaved={() => router.refresh()}
      />
      <AmountChangeDialog
        householdId={householdId}
        open={amountChangeOpen}
        onOpenChange={setAmountChangeOpen}
        rule={rule}
        onSaved={() => router.refresh()}
      />
      <RecordOccurrenceDialog
        householdId={householdId}
        open={recordOpen}
        onOpenChange={setRecordOpen}
        rule={rule}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={pauseConfirmOpen}
        onOpenChange={setPauseConfirmOpen}
        title={
          rule.status === "paused" ? "Resume this rule?" : "Pause this rule?"
        }
        description={
          rule.status === "paused"
            ? "Its schedule picks back up from the same next due date — nothing is fast-forwarded."
            : "Its next due date is frozen until resumed. Past records are preserved and unaffected."
        }
        confirmLabel={rule.status === "paused" ? "Resume" : "Pause"}
        onConfirm={handlePauseResumeConfirm}
      />
      <ConfirmDialog
        open={endConfirmOpen}
        onOpenChange={setEndConfirmOpen}
        title="End this rule?"
        description={`${rule.name} will stop generating or reminding about occurrences. Its history is preserved, never deleted.`}
        confirmLabel="End"
        destructive
        onConfirm={handleEndConfirm}
      />
      <ConfirmDialog
        open={skipConfirmOpen}
        onOpenChange={setSkipConfirmOpen}
        title="Skip this occurrence?"
        description={
          rule.next_due_date
            ? `The occurrence due ${formatDisplayDate(rule.next_due_date)} will be marked skipped — no transaction is written for it.`
            : undefined
        }
        confirmLabel="Skip"
        onConfirm={handleSkipConfirm}
      />
      <ConfirmDialog
        open={catchUpConfirmOpen}
        onOpenChange={setCatchUpConfirmOpen}
        title="Catch up missed occurrences?"
        description={
          rule.next_due_date
            ? `Records every occurrence due from ${formatDisplayDate(rule.next_due_date)} through today as cleared — one real transaction per scheduled date, in one step instead of one at a time.`
            : undefined
        }
        confirmLabel="Catch up"
        onConfirm={handleCatchUpConfirm}
      />
      <ConfirmDialog
        open={reactivateConfirmOpen}
        onOpenChange={setReactivateConfirmOpen}
        title="Reactivate this rule?"
        description="Undoes an 'ended' status set by mistake. Its schedule resumes from the same next due date — nothing is fast-forwarded."
        confirmLabel="Reactivate"
        onConfirm={handleReactivateConfirm}
      />
    </div>
  );
}
