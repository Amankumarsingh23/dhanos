"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { formatMoney } from "@/lib/money";
import { validateDailyRate } from "@/lib/calculations/calculators/rate-validation";
import { computeDailyGrowth } from "@/lib/calculations/calculators/daily-growth";
import { MethodologyNote } from "./methodology-note";
import { PrincipalGrowthChart } from "./charts/principal-growth-chart";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { AccountLinkField, type LinkableAccount } from "./account-link-field";
import { tryParseAmount, tryParseInteger, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

type DailyGrowthCalculatorProps = {
  householdId: string;
  currencyCode: string;
  accounts: LinkableAccount[];
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

const CHART_SAMPLE_POINTS = 30;

export function DailyGrowthCalculator({
  householdId,
  currencyCode,
  accounts,
  scenarios,
  onScenariosChanged,
}: DailyGrowthCalculatorProps) {
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [startingAmount, setStartingAmount] = useState("50000");
  const [dailyRatePercent, setDailyRatePercent] = useState("0.1");
  const [days, setDays] = useState("365");
  const [contribution, setContribution] = useState("0");
  const [contributionEveryDays, setContributionEveryDays] = useState("0");
  const [withdrawal, setWithdrawal] = useState("0");
  const [withdrawalEveryDays, setWithdrawalEveryDays] = useState("0");
  const [saveOpen, setSaveOpen] = useState(false);

  const startingAmountMinorUnits = tryParseAmount(startingAmount, currencyCode);
  const dailyRate = tryParsePercent(dailyRatePercent);
  const daysCount = tryParseInteger(days);
  const contributionMinorUnits =
    tryParseAmount(contribution, currencyCode) ?? 0;
  const contributionEveryDaysCount =
    tryParseInteger(contributionEveryDays) ?? 0;
  const withdrawalMinorUnits = tryParseAmount(withdrawal, currencyCode) ?? 0;
  const withdrawalEveryDaysCount = tryParseInteger(withdrawalEveryDays) ?? 0;

  const rateValidation =
    dailyRate !== null ? validateDailyRate(dailyRate) : null;

  const canCompute =
    startingAmountMinorUnits !== null &&
    startingAmountMinorUnits >= 0 &&
    dailyRate !== null &&
    rateValidation?.valid &&
    daysCount !== null &&
    daysCount >= 0;

  const result = useMemo(() => {
    if (!canCompute || dailyRate === null || daysCount === null) {
      return null;
    }
    return computeDailyGrowth({
      startingAmountMinorUnits: startingAmountMinorUnits ?? 0,
      dailyRate,
      days: daysCount,
      contributionMinorUnits,
      contributionEveryDays: contributionEveryDaysCount,
      withdrawalMinorUnits,
      withdrawalEveryDays: withdrawalEveryDaysCount,
    });
  }, [
    canCompute,
    startingAmountMinorUnits,
    dailyRate,
    daysCount,
    contributionMinorUnits,
    contributionEveryDaysCount,
    withdrawalMinorUnits,
    withdrawalEveryDaysCount,
  ]);

  const chartData = useMemo(() => {
    if (!result || result.points.length === 0) return [];
    const step = Math.max(
      1,
      Math.floor(result.points.length / CHART_SAMPLE_POINTS),
    );
    const sampled = result.points.filter(
      (point, index) =>
        index % step === 0 || index === result.points.length - 1,
    );
    return sampled.map((point) => ({
      label: `Day ${point.dayIndex}`,
      principalMinorUnits:
        (startingAmountMinorUnits ?? 0) +
        point.cumulativeContributedMinorUnits -
        point.cumulativeWithdrawnMinorUnits,
      growthMinorUnits:
        point.valueMinorUnits -
        ((startingAmountMinorUnits ?? 0) +
          point.cumulativeContributedMinorUnits -
          point.cumulativeWithdrawnMinorUnits),
    }));
  }, [result, startingAmountMinorUnits]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Daily growth</CardTitle>
          <CardDescription>
            Day-by-day compounding with an optional recurring contribution
            and/or withdrawal schedule — the same daily-compounding approach
            used for a real staking position&apos;s projection.{" "}
            <Badge variant="secondary">Projection, not a guarantee</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AccountLinkField
            fieldId="daily-growth-account"
            accounts={accounts}
            value={linkedAccountId}
            label="Start from an account's current balance (optional)"
            onChange={(accountId, prefillAmount) => {
              setLinkedAccountId(accountId);
              if (prefillAmount !== null) {
                setStartingAmount(prefillAmount);
              }
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="daily-starting">Starting amount</Label>
              <Input
                id="daily-starting"
                inputMode="decimal"
                value={startingAmount}
                onChange={(event) => {
                  setLinkedAccountId("");
                  setStartingAmount(event.target.value);
                }}
              />
              {startingAmountMinorUnits === null &&
                startingAmount.trim() !== "" && (
                  <FormErrorMessage message="Enter a valid amount." />
                )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-rate">Daily rate (% per day)</Label>
              <Input
                id="daily-rate"
                inputMode="decimal"
                value={dailyRatePercent}
                onChange={(event) => setDailyRatePercent(event.target.value)}
              />
              {rateValidation && !rateValidation.valid && (
                <FormErrorMessage message={rateValidation.reason} />
              )}
              {rateValidation?.valid && rateValidation.warning && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {rateValidation.warning}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-days">Duration (days)</Label>
              <Input
                id="daily-days"
                inputMode="numeric"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="daily-contribution">
                Contribution amount (optional)
              </Label>
              <Input
                id="daily-contribution"
                inputMode="decimal"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-contribution-every">
                Every N days (0 = none)
              </Label>
              <Input
                id="daily-contribution-every"
                inputMode="numeric"
                value={contributionEveryDays}
                onChange={(event) =>
                  setContributionEveryDays(event.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-withdrawal">
                Withdrawal amount (optional)
              </Label>
              <Input
                id="daily-withdrawal"
                inputMode="decimal"
                value={withdrawal}
                onChange={(event) => setWithdrawal(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="daily-withdrawal-every">
                Every N days (0 = none)
              </Label>
              <Input
                id="daily-withdrawal-every"
                inputMode="numeric"
                value={withdrawalEveryDays}
                onChange={(event) => setWithdrawalEveryDays(event.target.value)}
              />
            </div>
          </div>

          <MethodologyNote>
            <p>
              Each day compounds the running value at the daily rate, then that
              day&apos;s scheduled contribution or withdrawal (if any) is
              applied: value = value × (1 + dailyRate), then ± the scheduled
              movement. A daily rate is never derived from — or converted into —
              an annual rate.
            </p>
          </MethodologyNote>

          {result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryFigure
                label="Final value"
                value={formatMoney({
                  amountMinorUnits: result.finalValueMinorUnits,
                  currencyCode,
                })}
                emphasize
              />
              <SummaryFigure
                label="Total growth"
                value={formatMoney({
                  amountMinorUnits: result.totalGrowthMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="Total contributed"
                value={formatMoney({
                  amountMinorUnits: result.totalContributedMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="Total withdrawn"
                value={formatMoney({
                  amountMinorUnits: result.totalWithdrawnMinorUnits,
                  currencyCode,
                })}
              />
            </div>
          )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a valid starting amount, daily rate, and duration to see a
                projection.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              disabled={!result}
              onClick={() => setSaveOpen(true)}
            >
              Save scenario
            </Button>
          </div>
        </CardContent>
      </Card>

      <PrincipalGrowthChart
        title="Principal vs. growth"
        data={chartData}
        currencyCode={currencyCode}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Saved scenarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScenarioList
            householdId={householdId}
            scenarios={scenarios}
            onChanged={onScenariosChanged}
            summarize={(outputs) =>
              `Final value ${formatMoney({ amountMinorUnits: Number(outputs.finalValueMinorUnits ?? 0), currencyCode })}`
            }
          />
        </CardContent>
      </Card>

      {result && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="daily_growth"
          inputs={{
            startingAmount,
            dailyRatePercent,
            days,
            contribution,
            contributionEveryDays,
            withdrawal,
            withdrawalEveryDays,
          }}
          outputs={{
            finalValueMinorUnits: result.finalValueMinorUnits,
            totalGrowthMinorUnits: result.totalGrowthMinorUnits,
            totalContributedMinorUnits: result.totalContributedMinorUnits,
            totalWithdrawnMinorUnits: result.totalWithdrawnMinorUnits,
          }}
          linkAccounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
