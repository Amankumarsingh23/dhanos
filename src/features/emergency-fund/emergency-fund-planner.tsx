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
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { SummaryCard } from "@/components/shared/summary-card";
import { formatMoney } from "@/lib/money";
import { suggestCoverageTargetMonths } from "@/lib/calculations/emergency-fund";
import {
  saveEmergencyFundPlanAction,
  setEmergencyFundSourceOverrideAction,
  clearEmergencyFundSourceOverrideAction,
} from "./actions";
import type {
  EmergencyFundPlanDetail,
  EmergencyFundSourceRow,
} from "./queries";

type EmergencyFundPlannerProps = {
  householdId: string;
  detail: EmergencyFundPlanDetail;
};

function money(amountMinorUnits: number, currencyCode: string): string {
  return formatMoney({ amountMinorUnits, currencyCode });
}

function liquidityBadgeVariant(
  liquidity: string,
): "secondary" | "outline" | "destructive" {
  if (liquidity === "liquid") return "secondary";
  if (liquidity === "illiquid") return "outline";
  return "outline";
}

function SourceRow({
  source,
  householdId,
  planId,
  currencyCode,
}: {
  source: EmergencyFundSourceRow;
  householdId: string;
  planId: string;
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle(nextIncluded: boolean) {
    startTransition(async () => {
      const result = await setEmergencyFundSourceOverrideAction(householdId, {
        emergencyFundPlanId: planId,
        sourceType: source.sourceType,
        accountId: source.sourceType === "account" ? source.sourceId : null,
        investmentHoldingId:
          source.sourceType === "investment_holding" ? source.sourceId : null,
        isIncluded: nextIncluded,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleResetToDefault() {
    startTransition(async () => {
      const result = await clearEmergencyFundSourceOverrideAction(householdId, {
        emergencyFundPlanId: planId,
        sourceType: source.sourceType,
        accountId: source.sourceType === "account" ? source.sourceId : null,
        investmentHoldingId:
          source.sourceType === "investment_holding" ? source.sourceId : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {source.sourceName}{" "}
          <span className="text-muted-foreground font-normal">
            ({source.sourceType === "account" ? "Account" : "Investment"})
          </span>
        </p>
        <p className="text-muted-foreground text-xs">
          {source.currentValueMinorUnits !== null
            ? money(source.currentValueMinorUnits, source.currencyCode)
            : "No value yet"}
          {source.currencyCode !== currencyCode &&
            ` — excluded from totals (currency: ${source.currencyCode})`}
        </p>
        <p className="text-muted-foreground text-xs">
          {source.liquidityReason}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={liquidityBadgeVariant(source.liquidity)}>
          {source.liquidity.replace("_", "-")}
        </Badge>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="border-input size-4 rounded"
            checked={source.isIncluded}
            disabled={isPending}
            onChange={(event) => handleToggle(event.target.checked)}
          />
          Included
        </label>
        {source.overrideId && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={handleResetToDefault}
          >
            Reset to default
          </Button>
        )}
      </div>
    </div>
  );
}

function PlanSettingsForm({
  householdId,
  detail,
}: {
  householdId: string;
  detail: EmergencyFundPlanDetail;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [dependantsCount, setDependantsCount] = useState(
    String(detail.plan?.dependants_count ?? 0),
  );
  const [coverageTargetMonths, setCoverageTargetMonths] = useState(
    String(
      detail.plan?.coverage_target_months ?? suggestCoverageTargetMonths(0),
    ),
  );
  const [notes, setNotes] = useState(detail.plan?.notes ?? "");

  const suggested = suggestCoverageTargetMonths(Number(dependantsCount) || 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveEmergencyFundPlanAction(householdId, {
        coverageTargetMonths: Number(coverageTargetMonths),
        dependantsCount: Number(dependantsCount),
        notes: notes || null,
      });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      toast.success(
        detail.plan ? "Plan updated" : "Emergency fund plan created",
      );
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dependantsCount">Dependants</Label>
          <Input
            id="dependantsCount"
            type="number"
            min={0}
            value={dependantsCount}
            onChange={(event) => setDependantsCount(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coverageTargetMonths">Coverage target (months)</Label>
          <Input
            id="coverageTargetMonths"
            type="number"
            min={1}
            step="0.5"
            value={coverageTargetMonths}
            onChange={(event) => setCoverageTargetMonths(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Suggested for {dependantsCount || 0} dependant(s): {suggested}{" "}
            months — always your own choice, never enforced.
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Input
          id="notes"
          value={notes ?? ""}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : detail.plan ? "Save changes" : "Create plan"}
      </Button>
    </form>
  );
}

export function EmergencyFundPlanner({
  householdId,
  detail,
}: EmergencyFundPlannerProps) {
  const { plan, result, currencyCode } = detail;

  if (!plan || !result) {
    return (
      <div className="max-w-xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Set up your emergency fund plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">
              Choose how many months of essential spending you want to be able
              to cover, and how many dependants rely on that cushion. Everything
              else — essential expenses, EMIs, insurance commitments, and which
              accounts/investments count — is computed automatically from your
              real data.
            </p>
            <PlanSettingsForm householdId={householdId} detail={detail} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Liquid emergency money"
          amount={money(result.liquidEmergencyMoneyMinorUnits, currencyCode)}
          caption="Only sources you've included count"
        />
        <SummaryCard
          title="Months of coverage"
          amount={
            result.monthsOfCoverage !== null
              ? result.monthsOfCoverage.toFixed(1)
              : "—"
          }
          caption={`Target: ${plan.coverage_target_months} months`}
        />
        <SummaryCard
          title="Target amount"
          amount={money(result.targetAmountMinorUnits, currencyCode)}
          caption={`${money(result.monthlyBurnRateMinorUnits, currencyCode)}/mo burn rate × ${plan.coverage_target_months}`}
        />
        <SummaryCard
          title="Shortfall"
          amount={money(result.shortfallMinorUnits, currencyCode)}
          caption={
            result.progressPercentage !== null
              ? `${result.progressPercentage.toFixed(0)}% of target funded`
              : undefined
          }
        />
      </div>

      {result.shortfallMinorUnits > 0 && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm">
              <span className="font-medium">
                Suggested monthly contribution:
              </span>{" "}
              <SensitiveAmount
                value={money(
                  result.suggestedMonthlyContributionMinorUnits,
                  currencyCode,
                )}
              />{" "}
              to close the shortfall over about 12 months — a suggestion only,
              never a commitment DhanOS tracks or enforces.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Why liquidity matters
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm">
          <p>
            An emergency fund only works if you can actually get to the money
            when you need it — often within days, sometimes immediately.
            That&rsquo;s why this planner only counts real, accessible accounts
            and investments, and why it separates &ldquo;liquid&rdquo;
            (spendable right away) from &ldquo;semi-liquid&rdquo; (accessible,
            but slower or with a penalty) and &ldquo;illiquid&rdquo;
            (effectively locked).
          </p>
          <p>
            Property, disputed money owed to you, unused credit limits, and
            uncertain inherited assets are never counted here at all —
            they&rsquo;re either not liquid, not certain, or not actually yours
            to spend yet. Retirement accounts and fixed deposits default to
            excluded for the same reason, though you can override that below if
            you genuinely consider them accessible.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            What&rsquo;s driving the target
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-xs">
                Average essential monthly expenses (trailing 3 months)
              </dt>
              <dd className="text-sm font-medium">
                <Link href="/app/expenses" className="hover:underline">
                  {money(
                    detail.averageEssentialMonthlyExpensesMinorUnits,
                    currencyCode,
                  )}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Monthly EMIs</dt>
              <dd className="text-sm font-medium">
                <Link href="/app/debts" className="hover:underline">
                  {money(detail.monthlyEmiMinorUnits, currencyCode)}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                Insurance commitments (monthly-equivalent)
              </dt>
              <dd className="text-sm font-medium">
                <Link href="/app/insurance" className="hover:underline">
                  {money(
                    detail.monthlyInsuranceCommitmentsMinorUnits,
                    currencyCode,
                  )}
                </Link>
              </dd>
            </div>
          </dl>
          {detail.excludedCurrencyMismatchCount > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {detail.excludedCurrencyMismatchCount} included source(s) excluded
              from the total above due to a currency mismatch with{" "}
              {currencyCode}.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Plan settings</CardTitle>
        </CardHeader>
        <CardContent>
          <PlanSettingsForm householdId={householdId} detail={detail} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Qualifying accounts and investments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.sources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No qualifying accounts or investments found yet.
            </p>
          ) : (
            <div className="divide-border divide-y">
              {detail.sources.map((source) => (
                <SourceRow
                  key={`${source.sourceType}:${source.sourceId}`}
                  source={source}
                  householdId={householdId}
                  planId={plan.id}
                  currencyCode={currencyCode}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
