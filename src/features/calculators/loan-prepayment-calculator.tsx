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
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { formatMoney } from "@/lib/money";
import { validateAnnualRate } from "@/lib/calculations/calculators/rate-validation";
import { computeLoanPrepayment } from "@/lib/calculations/calculators/loan-prepayment";
import { MethodologyNote } from "./methodology-note";
import { AmortizationChart } from "./charts/amortization-chart";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { tryParseAmount, tryParseInteger, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

type LoanPrepaymentCalculatorProps = {
  householdId: string;
  currencyCode: string;
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

const CHART_YEAR_GROUP = 12;

export function LoanPrepaymentCalculator({
  householdId,
  currencyCode,
  scenarios,
  onScenariosChanged,
}: LoanPrepaymentCalculatorProps) {
  const [outstandingPrincipal, setOutstandingPrincipal] = useState("1800000");
  const [annualRatePercent, setAnnualRatePercent] = useState("9");
  const [emi, setEmi] = useState("18000");
  const [prepayment, setPrepayment] = useState("200000");
  const [prepaymentAfterPeriods, setPrepaymentAfterPeriods] = useState("12");
  const [saveOpen, setSaveOpen] = useState(false);

  const outstandingPrincipalMinorUnits = tryParseAmount(
    outstandingPrincipal,
    currencyCode,
  );
  const annualRate = tryParsePercent(annualRatePercent);
  const emiMinorUnits = tryParseAmount(emi, currencyCode);
  const prepaymentMinorUnits = tryParseAmount(prepayment, currencyCode) ?? 0;
  const prepaymentAfterPeriodsCount =
    tryParseInteger(prepaymentAfterPeriods) ?? 0;

  const rateValidation =
    annualRate !== null ? validateAnnualRate(annualRate) : null;

  const canCompute =
    outstandingPrincipalMinorUnits !== null &&
    outstandingPrincipalMinorUnits > 0 &&
    annualRate !== null &&
    rateValidation?.valid &&
    emiMinorUnits !== null &&
    emiMinorUnits > 0;

  const result = useMemo(() => {
    if (!canCompute || annualRate === null) {
      return null;
    }
    return computeLoanPrepayment({
      outstandingPrincipalMinorUnits: outstandingPrincipalMinorUnits ?? 0,
      annualInterestRate: annualRate,
      emiMinorUnits: emiMinorUnits ?? 0,
      prepaymentMinorUnits,
      prepaymentAfterPeriods: prepaymentAfterPeriodsCount,
    });
  }, [
    canCompute,
    outstandingPrincipalMinorUnits,
    annualRate,
    emiMinorUnits,
    prepaymentMinorUnits,
    prepaymentAfterPeriodsCount,
  ]);

  const chartData = useMemo(() => {
    if (!result || !result.ok || result.schedule.length === 0) return [];
    const groups = Math.ceil(result.schedule.length / CHART_YEAR_GROUP);
    return Array.from({ length: groups }, (_, groupIndex) => {
      const rows = result.schedule.slice(
        groupIndex * CHART_YEAR_GROUP,
        (groupIndex + 1) * CHART_YEAR_GROUP,
      );
      return {
        label: `Yr ${groupIndex + 1}`,
        principalMinorUnits: rows.reduce(
          (sum, row) =>
            sum + row.principalComponentMinorUnits + row.prepaymentMinorUnits,
          0,
        ),
        interestMinorUnits: rows.reduce(
          (sum, row) => sum + row.interestComponentMinorUnits,
          0,
        ),
      };
    });
  }, [result]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Loan prepayment</CardTitle>
          <CardDescription>
            Compares the original amortization schedule against one with a
            one-time lump-sum prepayment applied, at the same EMI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prepay-principal">Outstanding principal</Label>
              <Input
                id="prepay-principal"
                inputMode="decimal"
                value={outstandingPrincipal}
                onChange={(event) =>
                  setOutstandingPrincipal(event.target.value)
                }
              />
              {outstandingPrincipalMinorUnits === null &&
                outstandingPrincipal.trim() !== "" && (
                  <FormErrorMessage message="Enter a valid amount." />
                )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prepay-rate">Interest (% per year)</Label>
              <Input
                id="prepay-rate"
                inputMode="decimal"
                value={annualRatePercent}
                onChange={(event) => setAnnualRatePercent(event.target.value)}
              />
              {rateValidation && !rateValidation.valid && (
                <FormErrorMessage message={rateValidation.reason} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prepay-emi">Current EMI (monthly)</Label>
              <Input
                id="prepay-emi"
                inputMode="decimal"
                value={emi}
                onChange={(event) => setEmi(event.target.value)}
              />
              {emiMinorUnits === null && emi.trim() !== "" && (
                <FormErrorMessage message="Enter a valid amount." />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prepay-amount">Prepayment amount</Label>
              <Input
                id="prepay-amount"
                inputMode="decimal"
                value={prepayment}
                onChange={(event) => setPrepayment(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="prepay-after">
                Regular EMIs paid before the prepayment lands
              </Label>
              <Input
                id="prepay-after"
                inputMode="numeric"
                value={prepaymentAfterPeriods}
                onChange={(event) =>
                  setPrepaymentAfterPeriods(event.target.value)
                }
              />
            </div>
          </div>

          <MethodologyNote>
            <p>
              The remaining tenure is derived from the outstanding principal,
              rate, and EMI (rather than asked for directly), then two
              amortization schedules are run at the same EMI — one untouched,
              one with the prepayment applied at the chosen month — and compared
              for interest saved and months saved.
            </p>
          </MethodologyNote>

          {result && !result.ok && (
            <Alert variant="destructive">
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          {result && result.ok && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryFigure
                label="Interest saved"
                value={formatMoney({
                  amountMinorUnits: result.interestSavedMinorUnits,
                  currencyCode,
                })}
                emphasize
              />
              <SummaryFigure
                label="Months saved"
                value={`${result.monthsSaved} of ${result.originalTenureMonths}`}
              />
              <SummaryFigure
                label="Original total interest"
                value={formatMoney({
                  amountMinorUnits: result.originalTotalInterestMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="New total interest"
                value={formatMoney({
                  amountMinorUnits: result.newTotalInterestMinorUnits,
                  currencyCode,
                })}
              />
            </div>
          )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a positive outstanding principal, rate, and EMI to see a
                comparison.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button
              variant="outline"
              disabled={!result || !result.ok}
              onClick={() => setSaveOpen(true)}
            >
              Save scenario
            </Button>
          </div>
        </CardContent>
      </Card>

      <AmortizationChart
        title="Principal (incl. prepayment) vs. interest by year"
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
              `Interest saved ${formatMoney({ amountMinorUnits: Number(outputs.interestSavedMinorUnits ?? 0), currencyCode })}`
            }
          />
        </CardContent>
      </Card>

      {result && result.ok && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="loan_prepayment"
          inputs={{
            outstandingPrincipal,
            annualRatePercent,
            emi,
            prepayment,
            prepaymentAfterPeriods,
          }}
          outputs={{
            originalTenureMonths: result.originalTenureMonths,
            originalTotalInterestMinorUnits:
              result.originalTotalInterestMinorUnits,
            newTenureMonths: result.newTenureMonths,
            newTotalInterestMinorUnits: result.newTotalInterestMinorUnits,
            interestSavedMinorUnits: result.interestSavedMinorUnits,
            monthsSaved: result.monthsSaved,
          }}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
