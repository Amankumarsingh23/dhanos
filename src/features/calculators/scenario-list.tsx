"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDisplayDate } from "@/lib/dates";
import { deleteCalculatorScenarioAction } from "./actions";
import type { CalculatorScenarioRecord } from "./queries";

type ScenarioListProps = {
  householdId: string;
  scenarios: CalculatorScenarioRecord[];
  /** Renders a one-line result summary from a saved scenario's frozen outputs — each calculator knows its own output shape. */
  summarize: (outputs: Record<string, unknown>) => string;
  onChanged?: () => void;
};

/**
 * Saved scenarios for one calculator — a frozen snapshot list, never
 * recomputed against the current formula (see save-scenario-dialog.tsx).
 * Deleting is the only other write this feature offers besides saving.
 */
export function ScenarioList({
  householdId,
  scenarios,
  summarize,
  onChanged,
}: ScenarioListProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete(scenarioId: string) {
    startTransition(async () => {
      const result = await deleteCalculatorScenarioAction(householdId, {
        scenarioId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Scenario deleted");
      onChanged?.();
    });
  }

  if (scenarios.length === 0) {
    return (
      <EmptyState
        title="No saved scenarios yet"
        description="Nothing is saved automatically — use “Save scenario” above to keep one for later."
        headingLevel="h3"
        className="border-0 px-0 py-6"
      />
    );
  }

  return (
    <div className="space-y-2">
      {scenarios.map((scenario) => (
        <Card key={scenario.id} size="sm">
          <CardContent className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-medium">{scenario.name}</p>
              <p className="text-muted-foreground text-xs">
                {summarize(scenario.outputs as Record<string, unknown>)}
              </p>
              <p className="text-muted-foreground text-xs">
                Saved {formatDisplayDate(scenario.created_at)}
                {scenario.notes ? ` · ${scenario.notes}` : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${scenario.name}`}
              disabled={isPending}
              onClick={() => handleDelete(scenario.id)}
            >
              <Trash2Icon />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
