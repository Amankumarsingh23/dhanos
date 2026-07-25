"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveHouseholdDialog } from "./archive-household-dialog";

type DangerousActionsSectionProps = {
  householdId: string;
  householdName: string;
  /** Owner-only — stricter than the general manage_household permission every other Settings edit uses. */
  isOwner: boolean;
};

/** The one "dangerous action" Settings offers (PROMPT 40) — archiving, never an unsafe permanent delete. Rendered only for the household's owner. */
export function DangerousActionsSection({
  householdId,
  householdName,
  isOwner,
}: DangerousActionsSectionProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!isOwner) {
    return null;
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Dangerous actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Archive this household</p>
            <p className="text-muted-foreground text-xs">
              Preserves all data; makes the household unreachable through
              the app until support restores it. Owner-only.
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setArchiveOpen(true)}
          >
            Archive…
          </Button>
        </div>
      </CardContent>
      <ArchiveHouseholdDialog
        householdId={householdId}
        householdName={householdName}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
      />
    </Card>
  );
}
