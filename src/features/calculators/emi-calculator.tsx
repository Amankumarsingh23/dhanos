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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/forms/native-select";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { formatMoney } from "@/lib/money";
import { validateAnnualRate } from "@/lib/calculations/calculators/rate-validation";
import {
  EMI_PERIODS_PER_YEAR,
  computeEmi,
  type EmiPaymentFrequency,
} from "@/lib/calculations/calculators/emi";
import { MethodologyNote } from "./methodology-note";
import { AmortizationChart } from "./charts/amortization-chart";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { tryParseAmount, tryParseDecimalYears, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

const FREQUENCY_LABELS: Record<EmiPaymentFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

type EmiCalculatorProps = {
  householdId: string;
  currencyCode: string;
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

export function EmiCalculator({
  householdId,
  currencyCode,
  scenarios,
  onScenariosChanged,
}: EmiCalculatorProps) {
  const [principal, setPrincipal] = useState("2500000");
  const [annualRatePercent, setAnnualRatePercent] = useState("9");
  const [tenureYears, setTenureYears] = useState("20");
  const [paymentFrequency, setPaymentFrequency] =
    useState<EmiPaymentFrequency>("monthly");
  const [saveOpen, setSaveOpen] = useState(false);

  const principalMinorUnits = tryParseAmount(principal, currencyCode);
  const annualRate = tryParsePercent(annualRatePercent);
  const years = tryParseDecimalYears(tenureYears);

  const rateValidation =
    annualRate !== null ? validateAnnualRate(annualRate) : null;

  const canCompute =
    principalMinorUnits !== null &&
    principalMinorUnits > 0 &&
    annualRate !== null &&
    rateValidation?.valid &&
    years !== null &&
    years > 0;

  const result = useMemo(() => {
    if (!canCompute || annualRate === null || years === null) {
      return null;
    }
    return computeEmi({
      principalMinorUnits: principalMinorUnits ?? 0,
      annualInterestRate: annualRate,
      tenureYears: years,
      paymentFrequency,
    });
  }, [canCompute, principalMinorUnits, annualRate, years, paymentFrequency]);

  const periodsPerYear = EMI_PERIODS_PER_YEAR[paymentFrequency];
  const chartData = useMemo(() => {
    if (!result || result.schedule.length === 0) return [];
    const totalYears = Math.ceil(result.schedule.length / periodsPerYear);
    return Array.from({ length: totalYears }, (_, yearIndex) => {
      const rowsThisYear = result.schedule.slice(
        yearIndex * periodsPerYear,
        (yearIndex + 1) * periodsPerYear,
      );
      return {
        label: `Yr ${yearIndex + 1}`,
        principalMinorUnits: rowsThisYear.reduce(
          (sum, row) => sum + row.principalComponentMinorUnits,
          0,
        ),
        interestMinorUnits: rowsThisYear.reduce(
          (sum, row) => sum + row.interestComponentMinorUnits,
          0,
        ),
      };
    });
  }, [result, periodsPerYear]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>EMI</CardTitle>
          <CardDescription>
            The equated periodic installment for an amortizing loan, plus its
            full principal/interest amortization schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emi-principal">Principal</Label>
              <Input
                id="emi-principal"
                inputMode="decimal"
                value={principal}
                onChange={(event) => setPrincipal(event.target.value)}
              />
              {principalMinorUnits === null && principal.trim() !== "" && (
                <FormErrorMessage message="Enter a valid amount." />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emi-rate">Annual interest (% per year)</Label>
              <Input
                id="emi-rate"
                inputMode="decimal"
                value={annualRatePercent}
                onChange={(event) => setAnnualRatePercent(event.target.value)}
              />
              {rateValidation && !rateValidation.valid && (
                <FormErrorMessage message={rateValidation.reason} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emi-tenure">Tenure (years)</Label>
              <Input
                id="emi-tenure"
                inputMode="decimal"
                value={tenureYears}
                onChange={(event) => setTenureYears(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emi-frequency">Payment frequency</Label>
              <NativeSelect
                id="emi-frequency"
                value={paymentFrequency}
                onChange={(event) =>
                  setPaymentFrequency(event.target.value as EmiPaymentFrequency)
                }
              >
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <MethodologyNote>
            <p>
              payment = P × r × (1 + r)^n / ((1 + r)^n − 1) — P is the
              principal, r the periodic rate (annual rate ÷ payments per year),
              and n the total number of payments. An interest-free loan (r = 0)
              is simply P ÷ n.
            </p>
          </MethodologyNote>

          {result && (
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryFigure
                label={`${FREQUENCY_LABELS[paymentFrequency]} payment`}
                value={formatMoney({
                  amountMinorUnits: result.paymentMinorUnits,
                  currencyCode,
                })}
                emphasize
              />
              <SummaryFigure
                label="Total interest"
                value={formatMoney({
                  amountMinorUnits: result.totalInterestMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="Total payment"
                value={formatMoney({
                  amountMinorUnits: result.totalPaymentMinorUnits,
                  currencyCode,
                })}
              />
            </div>
          )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a positive principal, rate, and tenure to see a payment
                schedule.
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

      <AmortizationChart
        title="Principal vs. interest by year"
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
              `Payment ${formatMoney({ amountMinorUnits: Number(outputs.paymentMinorUnits ?? 0), currencyCode })}`
            }
          />
        </CardContent>
      </Card>

      {result && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="emi"
          inputs={{
            principal,
            annualRatePercent,
            tenureYears,
            paymentFrequency,
          }}
          outputs={{
            paymentMinorUnits: result.paymentMinorUnits,
            totalInterestMinorUnits: result.totalInterestMinorUnits,
            totalPaymentMinorUnits: result.totalPaymentMinorUnits,
          }}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
