"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  MoreHorizontalIcon,
  PiggyBankIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { formatMoney } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  INVESTMENT_SIP_STATUS_LABELS,
  SIP_FREQUENCY_LABELS,
  type InvestmentSipStatus,
  type SipFrequency,
} from "@/lib/validation/investment-sips";
import { INVESTMENT_ASSET_CLASS_LABELS } from "@/lib/validation/investments";
import type { Page } from "@/lib/queries/pagination";
import {
  activateSipAction,
  cancelSipAction,
  catchUpSipContributionsAction,
  completeSipAction,
  pauseSipAction,
  reactivateSipAction,
  resumeSipAction,
} from "./actions";
import {
  SipDialog,
  type AccountOption,
  type InstitutionOption,
} from "./sip-dialog";
import { RecordContributionDialog } from "./record-contribution-dialog";
import type {
  CurrencyAmount,
  DistributionRow,
  InvestmentAccountRecord,
  InvestmentAssetRecord,
  InvestmentSipRow,
  SipContributionRow,
} from "./queries";

type StatusActionKind =
  | "activate"
  | "pause"
  | "resume"
  | "cancel"
  | "complete"
  | "reactivate";

type SipsManagerProps = {
  householdId: string;
  sips: Page<InvestmentSipRow>;
  upcoming: InvestmentSipRow[];
  missed: InvestmentSipRow[];
  completedThisMonth: SipContributionRow[];
  totalCommitment: { monthly: CurrencyAmount[]; daily: CurrencyAmount[] };
  platformDistribution: DistributionRow[];
  assetClassDistribution: DistributionRow[];
  assets: InvestmentAssetRecord[];
  platforms: InvestmentAccountRecord[];
  institutions: InstitutionOption[];
  contributionAccounts: AccountOption[];
  defaultCurrencyCode: string;
  filters: {
    search: string;
    status: InvestmentSipStatus | "";
  };
};

const STATUS_OPTIONS = Object.entries(INVESTMENT_SIP_STATUS_LABELS) as [
  InvestmentSipStatus,
  string,
][];

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

function CurrencyAmountList({ rows }: { rows: CurrencyAmount[] }) {
  if (rows.length === 0) {
    return (
      <span className="text-muted-foreground text-xs">No active SIPs</span>
    );
  }
  return (
    <div className="space-y-0.5">
      {rows.map((row) => (
        <SensitiveAmount
          key={row.currencyCode}
          className="block text-lg font-semibold"
          value={money(row.amountMinorUnits, row.currencyCode)}
        />
      ))}
    </div>
  );
}

function DistributionList({ rows }: { rows: DistributionRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-xs">No active SIPs yet.</p>;
  }
  return (
    <div className="space-y-1.5">
      {rows.slice(0, 6).map((row) => (
        <div
          key={`${row.label}-${row.currencyCode}`}
          className="flex items-center justify-between text-xs"
        >
          <span className="truncate">{row.label}</span>
          <SensitiveAmount
            className="shrink-0"
            value={money(row.monthlyEquivalentMinorUnits, row.currencyCode)}
          />
        </div>
      ))}
    </div>
  );
}

function SipSummaryRow({ sip }: { sip: InvestmentSipRow }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-1 truncate">{sip.name}</span>
      <span className="text-muted-foreground w-20 shrink-0">
        {sip.next_due_date
          ? formatDisplayDate(sip.next_due_date, "d MMM")
          : "—"}
      </span>
      <SensitiveAmount
        className="w-20 shrink-0 text-right"
        value={money(sip.contribution_amount_minor_units, sip.currency_code)}
      />
    </div>
  );
}

const STATUS_ACTION_COPY: Record<
  StatusActionKind,
  {
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
  }
> = {
  activate: {
    title: "Activate this SIP?",
    description:
      "Contributions can be recorded and its schedule starts advancing.",
    confirmLabel: "Activate",
  },
  pause: {
    title: "Pause this SIP?",
    description:
      "Its next due date is frozen until resumed. Past contributions are preserved and unaffected.",
    confirmLabel: "Pause",
  },
  resume: {
    title: "Resume this SIP?",
    description:
      "Its schedule picks back up from the same next due date — nothing is fast-forwarded.",
    confirmLabel: "Resume",
  },
  complete: {
    title: "Mark this SIP as completed?",
    description:
      "History is preserved. Use this when its goal is reached, even before the schedule naturally ends.",
    confirmLabel: "Mark completed",
  },
  cancel: {
    title: "Cancel this SIP?",
    description:
      "It stops generating or reminding about contributions. History is preserved, never deleted.",
    confirmLabel: "Cancel SIP",
    destructive: true,
  },
  reactivate: {
    title: "Reactivate this SIP?",
    description:
      "Undoes a completed/cancelled status set by mistake. Its schedule resumes from the same next due date — nothing is fast-forwarded.",
    confirmLabel: "Reactivate",
  },
};

export function SipsManager({
  householdId,
  sips,
  upcoming,
  missed,
  completedThisMonth,
  totalCommitment,
  platformDistribution,
  assetClassDistribution,
  assets,
  platforms,
  institutions,
  contributionAccounts,
  defaultCurrencyCode,
  filters,
}: SipsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InvestmentSipRow | null>(null);
  const [contributionTarget, setContributionTarget] =
    useState<InvestmentSipRow | null>(null);
  const [statusActionTarget, setStatusActionTarget] = useState<{
    sip: InvestmentSipRow;
    kind: StatusActionKind;
  } | null>(null);
  const [catchUpTarget, setCatchUpTarget] = useState<InvestmentSipRow | null>(
    null,
  );

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Any filter change resets to page 1 — but a call that's explicitly
    // setting the page itself (the Previous/Next buttons) must not have
    // that same value immediately deleted again (PROMPT 56 finding —
    // this unconditional delete silently broke every "Next" button in
    // the app: goToPage(n) calls updateParams({ page: String(n) }),
    // which set it, then this line deleted it again immediately after).
    if (!("page" in patch)) {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  async function handleStatusActionConfirm() {
    if (!statusActionTarget) return;
    const { sip, kind } = statusActionTarget;
    const action =
      kind === "activate"
        ? activateSipAction
        : kind === "pause"
          ? pauseSipAction
          : kind === "resume"
            ? resumeSipAction
            : kind === "complete"
              ? completeSipAction
              : kind === "reactivate"
                ? reactivateSipAction
                : cancelSipAction;
    const result = await action(householdId, { investmentSipId: sip.id });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(STATUS_ACTION_COPY[kind].confirmLabel + "d");
    router.refresh();
  }

  async function handleCatchUpConfirm() {
    if (!catchUpTarget) return;
    const result = await catchUpSipContributionsAction(householdId, {
      investmentSipId: catchUpTarget.id,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.recordedCount === 0
        ? "Already up to date — nothing to catch up"
        : `Recorded ${result.data.recordedCount} contribution${result.data.recordedCount === 1 ? "" : "s"}`,
    );
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  const activeAction = statusActionTarget
    ? STATUS_ACTION_COPY[statusActionTarget.kind]
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Total monthly commitment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyAmountList rows={totalCommitment.monthly} />
            <p className="text-muted-foreground mt-1 text-xs">
              Approximate — normalized across cadences
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Daily commitment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CurrencyAmountList rows={totalCommitment.daily} />
            <p className="text-muted-foreground mt-1 text-xs">
              Approximate — normalized across cadences
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Completed this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {completedThisMonth.length}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Contribution{completedThisMonth.length === 1 ? "" : "s"} recorded
              this month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Upcoming contributions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Nothing due in the next couple of weeks.
              </p>
            ) : (
              upcoming
                .slice(0, 8)
                .map((sip) => <SipSummaryRow key={sip.id} sip={sip} />)
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                {missed.length > 0 && (
                  <AlertTriangleIcon className="text-destructive size-4" />
                )}
                Missed contributions
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {missed.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nothing overdue.</p>
            ) : (
              missed
                .slice(0, 8)
                .map((sip) => <SipSummaryRow key={sip.id} sip={sip} />)
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Platform distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionList rows={platformDistribution} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Asset-class distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionList
              rows={assetClassDistribution.map((row) => ({
                ...row,
                label:
                  INVESTMENT_ASSET_CLASS_LABELS[
                    row.label as keyof typeof INVESTMENT_ASSET_CLASS_LABELS
                  ] ?? row.label,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 gap-2 sm:max-w-sm"
        >
          <Input
            placeholder="Search by name…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search SIPs"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={() => setCreateOpen(true)}>
          <PlusIcon data-icon="inline-start" />
          Add SIP
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Filter by status"
          className="w-auto"
          value={filters.status}
          onChange={(event) => updateParams({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {sips.rows.length === 0 ? (
        <EmptyState
          icon={PiggyBankIcon}
          title="No SIPs yet"
          description="Set up a systematic investment plan — a daily gold purchase, a monthly mutual fund contribution, or any other recurring investment."
          action={<Button onClick={() => setCreateOpen(true)}>Add SIP</Button>}
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Platform</th>
                <th className="px-4 py-2.5 font-medium">Frequency</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Next due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {sips.rows.map((sip) => (
                <tr key={sip.id}>
                  <td className="px-4 py-2.5 font-medium">{sip.name}</td>
                  <td className="px-4 py-2.5">{sip.assetName}</td>
                  <td className="px-4 py-2.5">{sip.platformName}</td>
                  <td className="px-4 py-2.5 capitalize">
                    {SIP_FREQUENCY_LABELS[sip.frequency as SipFrequency]}
                  </td>
                  <td className="px-4 py-2.5">
                    <SensitiveAmount
                      value={money(
                        sip.contribution_amount_minor_units,
                        sip.currency_code,
                      )}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    {sip.next_due_date ? (
                      formatDisplayDate(sip.next_due_date)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant={
                          sip.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {
                          INVESTMENT_SIP_STATUS_LABELS[
                            sip.status as InvestmentSipStatus
                          ]
                        }
                      </Badge>
                      {sip.isMissed && (
                        <Badge variant="destructive">
                          <AlertTriangleIcon />
                          Missed
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {sip.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(sip)}>
                          Edit
                        </DropdownMenuItem>
                        {sip.status === "active" && (
                          <DropdownMenuItem
                            onClick={() => setContributionTarget(sip)}
                          >
                            Record contribution
                          </DropdownMenuItem>
                        )}
                        {sip.status === "active" && sip.isMissed && (
                          <DropdownMenuItem
                            onClick={() => setCatchUpTarget(sip)}
                          >
                            Catch up missed contributions
                          </DropdownMenuItem>
                        )}
                        {sip.status === "planned" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusActionTarget({ sip, kind: "activate" })
                            }
                          >
                            Activate
                          </DropdownMenuItem>
                        )}
                        {sip.status === "active" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusActionTarget({ sip, kind: "pause" })
                            }
                          >
                            Pause
                          </DropdownMenuItem>
                        )}
                        {sip.status === "paused" && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusActionTarget({ sip, kind: "resume" })
                            }
                          >
                            Resume
                          </DropdownMenuItem>
                        )}
                        {(sip.status === "active" ||
                          sip.status === "paused") && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusActionTarget({ sip, kind: "complete" })
                            }
                          >
                            Mark completed
                          </DropdownMenuItem>
                        )}
                        {sip.status !== "cancelled" &&
                          sip.status !== "completed" && (
                            <DropdownMenuItem
                              onClick={() =>
                                setStatusActionTarget({ sip, kind: "cancel" })
                              }
                            >
                              Cancel
                            </DropdownMenuItem>
                          )}
                        {(sip.status === "completed" ||
                          sip.status === "cancelled") && (
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusActionTarget({ sip, kind: "reactivate" })
                            }
                          >
                            Reactivate
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

      {(sips.page > 1 || sips.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={sips.page <= 1 || isPending}
            onClick={() => goToPage(sips.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {sips.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!sips.hasMore || isPending}
            onClick={() => goToPage(sips.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <SipDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        assets={assets}
        platforms={platforms}
        institutions={institutions}
        contributionAccounts={contributionAccounts}
        defaultCurrencyCode={defaultCurrencyCode}
        onSaved={() => router.refresh()}
      />
      <SipDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        sip={editTarget}
        assets={assets}
        platforms={platforms}
        institutions={institutions}
        contributionAccounts={contributionAccounts}
        defaultCurrencyCode={defaultCurrencyCode}
        onSaved={() => router.refresh()}
      />
      <RecordContributionDialog
        householdId={householdId}
        open={Boolean(contributionTarget)}
        onOpenChange={(open) => !open && setContributionTarget(null)}
        sip={contributionTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(statusActionTarget)}
        onOpenChange={(open) => !open && setStatusActionTarget(null)}
        title={activeAction?.title ?? ""}
        description={activeAction?.description ?? ""}
        confirmLabel={activeAction?.confirmLabel ?? "Confirm"}
        destructive={activeAction?.destructive}
        onConfirm={handleStatusActionConfirm}
      />
      <ConfirmDialog
        open={Boolean(catchUpTarget)}
        onOpenChange={(open) => !open && setCatchUpTarget(null)}
        title="Catch up missed contributions?"
        description={
          catchUpTarget
            ? `Records every contribution due from ${formatDisplayDate(catchUpTarget.next_due_date ?? "")} through today as cleared — one real transaction per scheduled date, in one step instead of one at a time.`
            : ""
        }
        confirmLabel="Catch up"
        onConfirm={handleCatchUpConfirm}
      />
    </div>
  );
}
