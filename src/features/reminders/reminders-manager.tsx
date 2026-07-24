"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlarmClockIcon,
  CheckIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { addDays } from "date-fns";
import { toIsoDateString } from "@/lib/dates";
import {
  REMINDER_TYPE_LABELS,
  REMINDER_VIEWS,
  type ReminderType,
  type ReminderView,
} from "@/lib/validation/reminders";
import {
  completeReminderAction,
  reopenReminderAction,
  skipReminderAction,
  snoozeReminderAction,
  syncRemindersAction,
} from "./actions";
import type { ReminderEntityLink, ReminderRecord } from "./queries";

type RemindersManagerProps = {
  householdId: string;
  reminders: ReminderRecord[];
  entityLinks: Record<string, ReminderEntityLink>;
  asOfDate: string;
  filters: {
    view: ReminderView;
    reminderType: ReminderType | "";
  };
};

const VIEW_LABELS: Record<ReminderView, string> = {
  upcoming: "Upcoming",
  overdue: "Overdue",
  snoozed: "Snoozed",
  completed: "Completed",
  skipped: "Skipped",
};

const REMINDER_TYPE_OPTIONS = Object.entries(REMINDER_TYPE_LABELS) as [
  ReminderType,
  string,
][];

function formatDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round(
    (new Date(`${toDate}T00:00:00Z`).getTime() -
      new Date(`${fromDate}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

function DueBadge({
  dueDate,
  asOfDate,
}: {
  dueDate: string;
  asOfDate: string;
}) {
  const days = daysBetween(asOfDate, dueDate);
  if (days < 0) {
    return (
      <Badge variant="destructive">
        {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} overdue
      </Badge>
    );
  }
  if (days === 0) return <Badge variant="outline">Due today</Badge>;
  return (
    <Badge variant="secondary">
      In {days} day{days === 1 ? "" : "s"}
    </Badge>
  );
}

export function RemindersManager({
  householdId,
  reminders,
  entityLinks,
  asOfDate,
  filters,
}: RemindersManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<ReminderRecord | null>(
    null,
  );
  const [snoozeDate, setSnoozeDate] = useState("");

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleRefresh() {
    setIsSyncing(true);
    try {
      const result = await syncRemindersAction(householdId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Calendar refreshed");
      router.refresh();
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleComplete(reminder: ReminderRecord) {
    const result = await completeReminderAction(householdId, reminder.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Marked completed");
    router.refresh();
  }

  async function handleSkip(reminder: ReminderRecord) {
    const result = await skipReminderAction(householdId, reminder.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Skipped");
    router.refresh();
  }

  async function handleReopen(reminder: ReminderRecord) {
    const result = await reopenReminderAction(householdId, reminder.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Reopened");
    router.refresh();
  }

  function openSnooze(reminder: ReminderRecord) {
    setSnoozeTarget(reminder);
    setSnoozeDate(toIsoDateString(addDays(new Date(`${asOfDate}T00:00:00Z`), 7)));
  }

  async function handleSnoozeConfirm() {
    if (!snoozeTarget || !snoozeDate) return;
    const result = await snoozeReminderAction(householdId, {
      reminderId: snoozeTarget.id,
      snoozedUntil: snoozeDate,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Snoozed until ${formatDate(snoozeDate)}`);
    setSnoozeTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {REMINDER_VIEWS.map((view) => (
            <Button
              key={view}
              size="sm"
              variant={filters.view === view ? "default" : "outline"}
              onClick={() => updateParams({ view })}
            >
              {VIEW_LABELS[view]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by reminder type"
            className="w-auto"
            value={filters.reminderType}
            onChange={(event) =>
              updateParams({ type: event.target.value })
            }
          >
            <option value="">All types</option>
            {REMINDER_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={handleRefresh} disabled={isSyncing}>
            {isSyncing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {reminders.length === 0 ? (
        <EmptyState
          icon={AlarmClockIcon}
          title={
            filters.view === "upcoming"
              ? "Nothing upcoming"
              : `No ${VIEW_LABELS[filters.view].toLowerCase()} reminders`
          }
          description="SIP contributions, EMIs, insurance premiums and renewals, expected income, lending repayments, document expiry, FD maturity, and periodic reviews all surface here automatically."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Reminder</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Due date</th>
                {(filters.view === "upcoming" || filters.view === "overdue") && (
                  <th className="px-4 py-2.5 font-medium">Status</th>
                )}
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {reminders.map((reminder) => {
                const link =
                  entityLinks[`${reminder.entity_type}:${reminder.entity_id}`];
                const title = link?.label ?? REMINDER_TYPE_LABELS[reminder.reminder_type as ReminderType];
                return (
                  <tr key={reminder.id}>
                    <td className="px-4 py-2.5 font-medium">
                      {link?.href ? (
                        <Link href={link.href} className="hover:underline">
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                      {reminder.notes && (
                        <span className="text-muted-foreground block text-xs font-normal">
                          {reminder.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline">
                        {REMINDER_TYPE_LABELS[reminder.reminder_type as ReminderType]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">{formatDate(reminder.due_date)}</td>
                    {(filters.view === "upcoming" || filters.view === "overdue") && (
                      <td className="px-4 py-2.5">
                        <DueBadge dueDate={reminder.due_date} asOfDate={asOfDate} />
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <MoreHorizontalIcon />
                            <span className="sr-only">Actions for {title}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {reminder.status === "pending" ? (
                            <>
                              <DropdownMenuItem onClick={() => handleComplete(reminder)}>
                                <CheckIcon data-icon="inline-start" />
                                Mark completed
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openSnooze(reminder)}>
                                <AlarmClockIcon data-icon="inline-start" />
                                Snooze
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSkip(reminder)}>
                                <XIcon data-icon="inline-start" />
                                Skip
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => handleReopen(reminder)}>
                              <RotateCcwIcon data-icon="inline-start" />
                              Reopen
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(snoozeTarget)} onOpenChange={(open) => !open && setSnoozeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snooze reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="snoozedUntil">Hide until</Label>
            <Input
              id="snoozedUntil"
              type="date"
              value={snoozeDate}
              onChange={(event) => setSnoozeDate(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              The reminder reappears in Upcoming/Overdue automatically once this date passes.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnoozeTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSnoozeConfirm} disabled={!snoozeDate}>
              Snooze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
