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
import { NativeSelect } from "@/components/forms/native-select";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { formatMoney } from "@/lib/money";
import {
  validateAnnualRate,
  validateDurationYears,
} from "@/lib/calculations/calculators/rate-validation";
import {
  SIP_PERIODS_PER_YEAR,
  computeSipProjection,
  type SipFrequency,
} from "@/lib/calculations/calculators/sip-projection";
import { MethodologyNote } from "./methodology-note";
import { PrincipalGrowthChart } from "./charts/principal-growth-chart";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { tryParseAmount, tryParseDecimalYears, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

const FREQUENCY_LABELS: Record<SipFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
};

type SipProjectionCalculatorProps = {
  householdId: string;
  currencyCode: string;
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

export function SipProjectionCalculator({
  householdId,
  currencyCode,
  scenarios,
  onScenariosChanged,
}: SipProjectionCalculatorProps) {
  const [contribution, setContribution] = useState("10000");
  const [frequency, setFrequency] = useState<SipFrequency>("monthly");
  const [annualReturnPercent, setAnnualReturnPercent] = useState("12");
  const [durationYears, setDurationYears] = useState("15");
  const [stepUpPercent, setStepUpPercent] = useState("0");
  const [inflationPercent, setInflationPercent] = useState("6");
  const [saveOpen, setSaveOpen] = useState(false);

  const contributionMinorUnits = tryParseAmount(contribution, currencyCode);
  const annualReturnRate = tryParsePercent(annualReturnPercent);
  const years = tryParseDecimalYears(durationYears);
  const stepUpRate = tryParsePercent(stepUpPercent) ?? 0;
  const inflationRate = tryParsePercent(inflationPercent) ?? 0;

  const returnValidation =
    annualReturnRate !== null
      ? validateAnnualRate(annualReturnRate, "expected annual return")
      : null;
  const durationValidation =
    years !== null ? validateDurationYears(years) : null;

  const canCompute =
    contributionMinorUnits !== null &&
    contributionMinorUnits >= 0 &&
    annualReturnRate !== null &&
    returnValidation?.valid &&
    years !== null &&
    durationValidation?.valid;

  const result = useMemo(() => {
    if (!canCompute || annualReturnRate === null || years === null) {
      return null;
    }
    return computeSipProjection({
      contributionMinorUnits: contributionMinorUnits ?? 0,
      frequency,
      annualReturnRate,
      durationYears: years,
      annualStepUpRate: stepUpRate,
      inflationRate,
    });
  }, [
    canCompute,
    contributionMinorUnits,
    frequency,
    annualReturnRate,
    years,
    stepUpRate,
    inflationRate,
  ]);

  const periodsPerYear = SIP_PERIODS_PER_YEAR[frequency];
  const chartData = useMemo(() => {
    if (!result || !years) return [];
    const wholeYears = Math.max(1, Math.floor(years));
    return Array.from({ length: wholeYears }, (_, index) => {
      const yearNumber = index + 1;
      const periodIndex = Math.min(
        result.periods.length,
        yearNumber * periodsPerYear,
      );
      const point = result.periods[periodIndex - 1];
      const principal = point?.cumulativeContributedMinorUnits ?? 0;
      const total = point?.cumulativeValueMinorUnits ?? 0;
      return {
        label: `Yr ${yearNumber}`,
        principalMinorUnits: principal,
        growthMinorUnits: total - principal,
      };
    });
  }, [result, years, periodsPerYear]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>SIP projection</CardTitle>
          <CardDescription>
            Projects a recurring investment — optionally stepped up each year —
            at an assumed rate of return.{" "}
            <Badge variant="secondary">Projection, not a guarantee</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sip-contribution">Contribution amount</Label>
              <Input
                id="sip-contribution"
                inputMode="decimal"
                value={contribution}
                onChange={(event) => setContribution(event.target.value)}
              />
              {contributionMinorUnits === null &&
                contribution.trim() !== "" && (
                  <FormErrorMessage message="Enter a valid amount." />
                )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-frequency">Frequency</Label>
              <NativeSelect
                id="sip-frequency"
                value={frequency}
                onChange={(event) =>
                  setFrequency(event.target.value as SipFrequency)
                }
              >
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-return">
                Expected annual return (% per year)
              </Label>
              <Input
                id="sip-return"
                inputMode="decimal"
                value={annualReturnPercent}
                onChange={(event) => setAnnualReturnPercent(event.target.value)}
              />
              {returnValidation && !returnValidation.valid && (
                <FormErrorMessage message={returnValidation.reason} />
              )}
              {returnValidation?.valid && returnValidation.warning && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {returnValidation.warning}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-duration">Duration (years)</Label>
              <Input
                id="sip-duration"
                inputMode="decimal"
                value={durationYears}
                onChange={(event) => setDurationYears(event.target.value)}
              />
              {durationValidation && !durationValidation.valid && (
                <FormErrorMessage message={durationValidation.reason} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-stepup">
                Annual contribution increase (% per year, optional)
              </Label>
              <Input
                id="sip-stepup"
                inputMode="decimal"
                value={stepUpPercent}
                onChange={(event) => setStepUpPercent(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sip-inflation">
                Inflation assumption (% per year)
              </Label>
              <Input
                id="sip-inflation"
                inputMode="decimal"
                value={inflationPercent}
                onChange={(event) => setInflationPercent(event.target.value)}
              />
            </div>
          </div>

          <MethodologyNote>
            <p>
              Each {FREQUENCY_LABELS[frequency].toLowerCase()} period compounds
              the running value at the return rate converted to that frequency,
              then adds that period&apos;s contribution: value = value × (1 +
              periodRate) + contribution.
            </p>
            <p>
              The contribution itself grows once per elapsed year by the step-up
              rate. The real (inflation-adjusted) figure divides the nominal
              result by (1 + inflation) raised to the number of years.
            </p>
          </MethodologyNote>

          {result && (
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryFigure
                label="Total contributed"
                value={formatMoney({
                  amountMinorUnits: result.totalContributedMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="Projected value (nominal)"
                value={formatMoney({
                  amountMinorUnits: result.nominalFutureValueMinorUnits,
                  currencyCode,
                })}
                emphasize
              />
              <SummaryFigure
                label="Projected value (inflation-adjusted)"
                value={formatMoney({
                  amountMinorUnits: result.realFutureValueMinorUnits,
                  currencyCode,
                })}
              />
            </div>
          )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a valid contribution, return rate, and duration to see a
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
              `Projected ${formatMoney({ amountMinorUnits: Number(outputs.nominalFutureValueMinorUnits ?? 0), currencyCode })}`
            }
          />
        </CardContent>
      </Card>

      {result && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="sip_projection"
          inputs={{
            contribution,
            frequency,
            annualReturnPercent,
            durationYears,
            stepUpPercent,
            inflationPercent,
          }}
          outputs={{
            totalContributedMinorUnits: result.totalContributedMinorUnits,
            nominalFutureValueMinorUnits: result.nominalFutureValueMinorUnits,
            realFutureValueMinorUnits: result.realFutureValueMinorUnits,
          }}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
