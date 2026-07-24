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
  computeLumpSumGrowth,
  type CompoundingFrequency,
} from "@/lib/calculations/calculators/lump-sum";
import { MethodologyNote } from "./methodology-note";
import { PrincipalGrowthChart } from "./charts/principal-growth-chart";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { AccountLinkField, type LinkableAccount } from "./account-link-field";
import { tryParseAmount, tryParseDecimalYears, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

const COMPOUNDING_LABELS: Record<CompoundingFrequency, string> = {
  annually: "Annually",
  semi_annually: "Semi-annually",
  quarterly: "Quarterly",
  monthly: "Monthly",
  daily: "Daily",
};

type LumpSumCalculatorProps = {
  householdId: string;
  currencyCode: string;
  accounts: LinkableAccount[];
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

export function LumpSumCalculator({
  householdId,
  currencyCode,
  accounts,
  scenarios,
  onScenariosChanged,
}: LumpSumCalculatorProps) {
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [principal, setPrincipal] = useState("100000");
  const [annualRatePercent, setAnnualRatePercent] = useState("8");
  const [durationYears, setDurationYears] = useState("10");
  const [compoundingFrequency, setCompoundingFrequency] =
    useState<CompoundingFrequency>("annually");
  const [saveOpen, setSaveOpen] = useState(false);

  const principalMinorUnits = tryParseAmount(principal, currencyCode);
  const annualRate = tryParsePercent(annualRatePercent);
  const years = tryParseDecimalYears(durationYears);

  const rateValidation =
    annualRate !== null ? validateAnnualRate(annualRate) : null;
  const durationValidation =
    years !== null ? validateDurationYears(years) : null;

  const canCompute =
    principalMinorUnits !== null &&
    principalMinorUnits >= 0 &&
    annualRate !== null &&
    rateValidation?.valid &&
    years !== null &&
    durationValidation?.valid;

  const result = useMemo(() => {
    if (!canCompute || annualRate === null || years === null) {
      return null;
    }
    return computeLumpSumGrowth({
      principalMinorUnits: principalMinorUnits ?? 0,
      annualRate,
      durationYears: years,
      compoundingFrequency,
    });
  }, [
    canCompute,
    principalMinorUnits,
    annualRate,
    years,
    compoundingFrequency,
  ]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.yearlyPoints.map((point) => ({
      label: `Yr ${point.yearIndex}`,
      principalMinorUnits: principalMinorUnits ?? 0,
      growthMinorUnits: point.valueMinorUnits - (principalMinorUnits ?? 0),
    }));
  }, [result, principalMinorUnits]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Lump sum</CardTitle>
          <CardDescription>
            Standard compound growth for a one-time investment.{" "}
            <Badge variant="secondary">Projection, not a guarantee</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AccountLinkField
            fieldId="lumpsum-account"
            accounts={accounts}
            value={linkedAccountId}
            label="Start from an account's current balance (optional)"
            onChange={(accountId, prefillAmount) => {
              setLinkedAccountId(accountId);
              if (prefillAmount !== null) {
                setPrincipal(prefillAmount);
              }
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lumpsum-principal">Principal</Label>
              <Input
                id="lumpsum-principal"
                inputMode="decimal"
                value={principal}
                onChange={(event) => {
                  setLinkedAccountId("");
                  setPrincipal(event.target.value);
                }}
              />
              {principalMinorUnits === null && principal.trim() !== "" && (
                <FormErrorMessage message="Enter a valid amount." />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lumpsum-rate">Annual rate (% per year)</Label>
              <Input
                id="lumpsum-rate"
                inputMode="decimal"
                value={annualRatePercent}
                onChange={(event) => setAnnualRatePercent(event.target.value)}
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
              <Label htmlFor="lumpsum-duration">Duration (years)</Label>
              <Input
                id="lumpsum-duration"
                inputMode="decimal"
                value={durationYears}
                onChange={(event) => setDurationYears(event.target.value)}
              />
              {durationValidation && !durationValidation.valid && (
                <FormErrorMessage message={durationValidation.reason} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lumpsum-compounding">Compounding frequency</Label>
              <NativeSelect
                id="lumpsum-compounding"
                value={compoundingFrequency}
                onChange={(event) =>
                  setCompoundingFrequency(
                    event.target.value as CompoundingFrequency,
                  )
                }
              >
                {Object.entries(COMPOUNDING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <MethodologyNote>
            <p>
              FV = P × (1 + r/n)^(n × t) — P is the principal, r the annual
              rate, n the compounding periods per year, and t the duration in
              years. A higher compounding frequency compounds the same nominal
              rate more often, producing a larger future value.
            </p>
          </MethodologyNote>

          {result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryFigure
                label="Future value"
                value={formatMoney({
                  amountMinorUnits: result.futureValueMinorUnits,
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
            </div>
          )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a valid principal, rate, and duration to see a projection.
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
              `Future value ${formatMoney({ amountMinorUnits: Number(outputs.futureValueMinorUnits ?? 0), currencyCode })}`
            }
          />
        </CardContent>
      </Card>

      {result && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="lump_sum"
          inputs={{
            principal,
            annualRatePercent,
            durationYears,
            compoundingFrequency,
          }}
          outputs={{
            futureValueMinorUnits: result.futureValueMinorUnits,
            totalGrowthMinorUnits: result.totalGrowthMinorUnits,
          }}
          linkAccounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
