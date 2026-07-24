"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDisplayDate, toIsoDateString } from "@/lib/dates";
import {
  isWaitingPeriodMilestoneUpcoming,
  isWaitingPeriodPassed,
} from "@/lib/calculations/insurance";
import { deleteWaitingPeriodAction } from "./actions";
import { WaitingPeriodDialog } from "./waiting-period-dialog";
import type { WaitingPeriodRow } from "./queries";

type WaitingPeriodsSectionProps = {
  householdId: string;
  policyId: string;
  policyStartDate?: string;
  waitingPeriods: WaitingPeriodRow[];
};

/**
 * Structured, dated waiting periods (PROMPT 26) — supplements the
 * freeform "waiting periods" text field above with entries a dashboard can
 * compute a real milestone date from. Purely additive: this section never
 * touches insurance_policies.waiting_periods.
 */
export function WaitingPeriodsSection({
  householdId,
  policyId,
  policyStartDate,
  waitingPeriods,
}: WaitingPeriodsSectionProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const today = toIsoDateString(new Date());

  async function handleDelete(waitingPeriodId: string) {
    const result = await deleteWaitingPeriodAction(householdId, {
      waitingPeriodId,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Waiting periods</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </div>
      {waitingPeriods.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No structured waiting periods added yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {waitingPeriods.map((waitingPeriod) => {
            const passed = isWaitingPeriodPassed(
              waitingPeriod.milestoneDate,
              today,
            );
            const upcoming =
              !passed &&
              isWaitingPeriodMilestoneUpcoming(
                waitingPeriod.milestoneDate,
                today,
              );
            return (
              <li
                key={waitingPeriod.id}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span>
                  {waitingPeriod.label}
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {waitingPeriod.duration_months} months from{" "}
                    {formatDisplayDate(waitingPeriod.starts_from)} — ends{" "}
                    {formatDisplayDate(waitingPeriod.milestoneDate)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {passed ? (
                    <Badge variant="secondary">Passed</Badge>
                  ) : upcoming ? (
                    <Badge variant="outline">Coming up</Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleDelete(waitingPeriod.id)}
                    aria-label={`Remove ${waitingPeriod.label}`}
                  >
                    <XIcon />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <WaitingPeriodDialog
        householdId={householdId}
        policyId={policyId}
        policyStartDate={policyStartDate ?? today}
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
