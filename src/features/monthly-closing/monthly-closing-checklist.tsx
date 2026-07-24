"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  REVIEW_ITEM_DESCRIPTIONS,
  REVIEW_ITEM_LABELS,
  type ReviewItemType,
} from "@/lib/validation/monthly-closing";
import {
  completeMonthlyClosingAction,
  updateReviewItemAction,
} from "./actions";
import type { MonthlyClosingWithItems } from "./queries";

type MonthlyClosingChecklistProps = {
  householdId: string;
  closing: MonthlyClosingWithItems;
};

export function MonthlyClosingChecklist({
  householdId,
  closing,
}: MonthlyClosingChecklistProps) {
  const router = useRouter();
  const [isCompleting, startCompleting] = useTransition();
  const [notes, setNotes] = useState(closing.notes ?? "");

  const unresolvedCount = closing.reviewItems.filter(
    (item) => !item.is_reviewed,
  ).length;

  function handleToggle(reviewItemId: string, isReviewed: boolean) {
    startCompleting(async () => {
      const result = await updateReviewItemAction(householdId, {
        reviewItemId,
        isReviewed,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleComplete() {
    startCompleting(async () => {
      const result = await completeMonthlyClosingAction(householdId, {
        monthlyClosingId: closing.id,
        notes: notes || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Closing completed");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Review checklist — {unresolvedCount} of {closing.reviewItems.length}{" "}
            remaining
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          {closing.reviewItems.map((item) => {
            const itemType = item.item_type as ReviewItemType;
            return (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <input
                  type="checkbox"
                  className="border-input mt-1 size-4 rounded"
                  checked={item.is_reviewed}
                  disabled={isCompleting}
                  onChange={(event) =>
                    handleToggle(item.id, event.target.checked)
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{REVIEW_ITEM_LABELS[itemType]}</p>
                  <p className="text-muted-foreground text-xs">
                    {REVIEW_ITEM_DESCRIPTIONS[itemType]}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Notes (optional)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="closingNotes">Notes for this closing</Label>
            <Input
              id="closingNotes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div>
            <Button onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? "Completing…" : "Complete closing"}
            </Button>
            {unresolvedCount > 0 && (
              <p className="text-muted-foreground mt-2 text-xs">
                You can complete this closing with items still unresolved — the
                report will clearly say so, rather than pretending everything
                was reviewed.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
