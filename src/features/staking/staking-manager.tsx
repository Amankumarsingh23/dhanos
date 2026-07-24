"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  ClockIcon,
  LockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { StaleDataIndicator } from "@/components/shared/stale-data-indicator";
import { formatMoney } from "@/lib/money";
import {
  STAKING_POSITION_STATUS_LABELS,
  type StakingPositionStatus,
} from "@/lib/validation/staking";
import {
  closeStakingPositionAction,
  pauseStakingPositionAction,
  resumeStakingPositionAction,
} from "./actions";
import { PositionDialog, type InstitutionOption } from "./position-dialog";
import { DailySnapshotDialog } from "./daily-snapshot-dialog";
import type {
  PlatformConcentrationRow,
  StakingPositionRow,
  StakingSnapshotRecord,
} from "./queries";
import type {
  InvestmentAccountRecord,
  InvestmentAssetRecord,
} from "@/features/investment-sips/queries";

type StakingManagerProps = {
  householdId: string;
  positions: readonly StakingPositionRow[];
  platformConcentration: PlatformConcentrationRow[];
  snapshotsByPosition: Record<string, StakingSnapshotRecord[]>;
  assets: InvestmentAssetRecord[];
  platforms: InvestmentAccountRecord[];
  institutions: InstitutionOption[];
  defaultCurrencyCode: string;
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

const CONCENTRATION_WARNING_THRESHOLD_PERCENT = 50;

export function StakingManager({
  householdId,
  positions,
  platformConcentration,
  snapshotsByPosition,
  assets,
  platforms,
  institutions,
  defaultCurrencyCode,
}: StakingManagerProps) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StakingPositionRow | null>(null);
  const [snapshotTarget, setSnapshotTarget] =
    useState<StakingPositionRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<{
    position: StakingPositionRow;
    kind: "pause" | "resume" | "close";
  } | null>(null);

  const highReturnCount = positions.filter((p) => p.highReturnWarning).length;
  const staleCount = positions.filter((p) => p.isSnapshotStale).length;
  const manualCount = positions.filter(
    (p) => p.latestSnapshot?.manually_confirmed,
  ).length;
  const concentrationWarnings = platformConcentration.filter(
    (row) => row.sharePercent >= CONCENTRATION_WARNING_THRESHOLD_PERCENT,
  );

  async function handleStatusConfirm() {
    if (!statusTarget) return;
    const { position, kind } = statusTarget;
    const action =
      kind === "pause"
        ? pauseStakingPositionAction
        : kind === "resume"
          ? resumeStakingPositionAction
          : closeStakingPositionAction;
    const result = await action(householdId, {
      stakingPositionId: position.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      kind === "pause"
        ? "Position paused"
        : kind === "resume"
          ? "Position resumed"
          : "Position closed",
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {highReturnCount > 0 && (
                  <AlertTriangleIcon className="text-destructive size-4" />
                )}
                High-return warnings
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{highReturnCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Positions with an unusually high expected daily rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {concentrationWarnings.length > 0 && (
                  <AlertTriangleIcon className="text-destructive size-4" />
                )}
                Platform concentration
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {platformConcentration.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                No valued positions yet.
              </p>
            ) : (
              platformConcentration.slice(0, 3).map((row) => (
                <div
                  key={`${row.platformName}-${row.currencyCode}`}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="truncate">{row.platformName}</span>
                  <span
                    className={
                      row.sharePercent >=
                      CONCENTRATION_WARNING_THRESHOLD_PERCENT
                        ? "text-destructive font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {row.sharePercent.toFixed(0)}%
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {staleCount > 0 && (
                  <ClockIcon className="text-destructive size-4" />
                )}
                Stale snapshots
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{staleCount}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Positions with no snapshot in the last 2 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Manually entered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {manualCount} / {positions.length}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Positions whose latest snapshot was manually confirmed
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Positions</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add position
        </Button>
      </div>

      {positions.length === 0 ? (
        <EmptyState
          icon={ZapIcon}
          title="No staking positions yet"
          description="Track a crypto staking position or any other daily-growth arrangement — record a snapshot each day to build its real value history."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add position</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Latest value</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {positions.map((position) => (
                <tr key={position.id}>
                  <td className="px-4 py-2.5 font-medium">{position.name}</td>
                  <td className="px-4 py-2.5">{position.assetName}</td>
                  <td className="px-4 py-2.5">{position.platformName}</td>
                  <td className="px-4 py-2.5">
                    {position.latestSnapshot ? (
                      <SensitiveAmount
                        value={money(
                          position.latestSnapshot.closing_value_minor_units,
                          position.currency_code,
                        )}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        position.status === "active" ? "secondary" : "outline"
                      }
                    >
                      {
                        STAKING_POSITION_STATUS_LABELS[
                          position.status as StakingPositionStatus
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {position.hasNoSnapshotYet ? (
                        <Badge variant="destructive">No snapshot</Badge>
                      ) : position.isSnapshotStale ? (
                        <StaleDataIndicator
                          asOf={position.latestSnapshot!.snapshot_date}
                          staleAfterHours={48}
                        />
                      ) : null}
                      {position.isLocked && (
                        <Badge variant="outline">
                          <LockIcon />
                          Locked
                        </Badge>
                      )}
                      {position.highReturnWarning && (
                        <Badge variant="destructive">
                          <AlertTriangleIcon />
                          High return
                        </Badge>
                      )}
                      {position.latestSnapshot &&
                        !position.latestSnapshot.manually_confirmed && (
                          <Badge variant="outline">Auto-estimated</Badge>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {position.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditTarget(position)}
                        >
                          Edit
                        </DropdownMenuItem>
                        {position.status === "active" && (
                          <DropdownMenuItem
                            onClick={() => setSnapshotTarget(position)}
                          >
                            Record snapshot
                          </DropdownMenuItem>
                        )}
                        {position.status === "active" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ position, kind: "pause" })
                            }
                          >
                            Pause
                          </DropdownMenuItem>
                        )}
                        {position.status === "paused" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ position, kind: "resume" })
                            }
                          >
                            Resume
                          </DropdownMenuItem>
                        )}
                        {position.status !== "closed" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ position, kind: "close" })
                            }
                          >
                            Close
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PositionDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        assets={assets}
        platforms={platforms}
        institutions={institutions}
        defaultCurrencyCode={defaultCurrencyCode}
        onSaved={() => router.refresh()}
      />
      <PositionDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        position={editTarget}
        assets={assets}
        platforms={platforms}
        institutions={institutions}
        defaultCurrencyCode={defaultCurrencyCode}
        onSaved={() => router.refresh()}
      />
      <DailySnapshotDialog
        householdId={householdId}
        open={Boolean(snapshotTarget)}
        onOpenChange={(open) => !open && setSnapshotTarget(null)}
        position={snapshotTarget}
        existingSnapshots={
          snapshotTarget ? (snapshotsByPosition[snapshotTarget.id] ?? []) : []
        }
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={
          statusTarget?.kind === "pause"
            ? "Pause this position?"
            : statusTarget?.kind === "resume"
              ? "Resume this position?"
              : "Close this position?"
        }
        description={
          statusTarget?.kind === "close"
            ? "History (every daily snapshot) is preserved, never deleted."
            : "Snapshot history is unaffected either way."
        }
        confirmLabel={
          statusTarget?.kind === "pause"
            ? "Pause"
            : statusTarget?.kind === "resume"
              ? "Resume"
              : "Close"
        }
        destructive={statusTarget?.kind === "close"}
        onConfirm={handleStatusConfirm}
      />
    </div>
  );
}
