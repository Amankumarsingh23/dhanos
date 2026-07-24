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
import { computeGoalFunding } from "@/lib/calculations/calculators/goal-funding";
import { MethodologyNote } from "./methodology-note";
import { SaveScenarioDialog } from "./save-scenario-dialog";
import { ScenarioList } from "./scenario-list";
import { AccountLinkField, type LinkableAccount } from "./account-link-field";
import { tryParseAmount, tryParsePercent } from "./parse";
import { SummaryFigure } from "./summary-figure";
import type { CalculatorScenarioRecord } from "./queries";

type GoalFundingCalculatorProps = {
  householdId: string;
  currencyCode: string;
  today: string;
  accounts: LinkableAccount[];
  scenarios: CalculatorScenarioRecord[];
  onScenariosChanged?: () => void;
};

export function GoalFundingCalculator({
  householdId,
  currencyCode,
  today,
  accounts,
  scenarios,
  onScenariosChanged,
}: GoalFundingCalculatorProps) {
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [targetAmount, setTargetAmount] = useState("2000000");
  const [targetDate, setTargetDate] = useState("");
  const [currentAmount, setCurrentAmount] = useState("100000");
  const [expectedReturnPercent, setExpectedReturnPercent] = useState("10");
  const [inflationPercent, setInflationPercent] = useState("6");
  const [saveOpen, setSaveOpen] = useState(false);

  const targetAmountMinorUnits = tryParseAmount(targetAmount, currencyCode);
  const currentAmountMinorUnits =
    tryParseAmount(currentAmount, currencyCode) ?? 0;
  const expectedReturn = tryParsePercent(expectedReturnPercent);
  const inflationRate = tryParsePercent(inflationPercent) ?? 0;

  const returnValidation =
    expectedReturn !== null
      ? validateAnnualRate(expectedReturn, "expected return")
      : null;
  const inflationValidation =
    inflationRate !== null
      ? validateAnnualRate(inflationRate, "inflation rate")
      : null;

  const canCompute =
    targetAmountMinorUnits !== null &&
    targetAmountMinorUnits > 0 &&
    targetDate.trim() !== "" &&
    expectedReturn !== null &&
    returnValidation?.valid &&
    inflationValidation?.valid;

  const result = useMemo(() => {
    if (!canCompute || expectedReturn === null) {
      return null;
    }
    return computeGoalFunding({
      targetAmountMinorUnits: targetAmountMinorUnits ?? 0,
      targetDate,
      asOfDate: today,
      currentAmountMinorUnits,
      annualExpectedReturn: expectedReturn,
      annualInflationRate: inflationRate,
    });
  }, [
    canCompute,
    targetAmountMinorUnits,
    targetDate,
    today,
    currentAmountMinorUnits,
    expectedReturn,
    inflationRate,
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Goal funding</CardTitle>
          <CardDescription>
            The monthly contribution required to reach a target amount by a
            target date, given what&apos;s already saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AccountLinkField
            fieldId="goal-account"
            accounts={accounts}
            value={linkedAccountId}
            label="Fund from an account's current balance (optional)"
            onChange={(accountId, prefillAmount) => {
              setLinkedAccountId(accountId);
              if (prefillAmount !== null) {
                setCurrentAmount(prefillAmount);
              }
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target-amount">
                Target amount (today&apos;s value)
              </Label>
              <Input
                id="goal-target-amount"
                inputMode="decimal"
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
              />
              {targetAmountMinorUnits === null &&
                targetAmount.trim() !== "" && (
                  <FormErrorMessage message="Enter a valid amount." />
                )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-target-date">Target date</Label>
              <Input
                id="goal-target-date"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-current-amount">Current amount</Label>
              <Input
                id="goal-current-amount"
                inputMode="decimal"
                value={currentAmount}
                onChange={(event) => {
                  setLinkedAccountId("");
                  setCurrentAmount(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-return">Expected return (% per year)</Label>
              <Input
                id="goal-return"
                inputMode="decimal"
                value={expectedReturnPercent}
                onChange={(event) =>
                  setExpectedReturnPercent(event.target.value)
                }
              />
              {returnValidation && !returnValidation.valid && (
                <FormErrorMessage message={returnValidation.reason} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-inflation">
                Inflation assumption (% per year)
              </Label>
              <Input
                id="goal-inflation"
                inputMode="decimal"
                value={inflationPercent}
                onChange={(event) => setInflationPercent(event.target.value)}
              />
            </div>
          </div>

          <MethodologyNote>
            <p>
              The target amount is treated as today&apos;s purchasing power and
              inflated forward to the target date (nominalTarget = target × (1 +
              inflation)^years). The required monthly contribution then solves
              nominalTarget = current × (1+r)ⁿ + contribution × ((1+r)ⁿ − 1) / r
              for the current amount&apos;s own growth plus a monthly annuity,
              where r is the monthly-equivalent expected return and n the months
              remaining.
            </p>
          </MethodologyNote>

          {result && (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryFigure
                label="Required monthly contribution"
                value={
                  result.isAlreadyFunded
                    ? "₹0 — already on track"
                    : formatMoney({
                        amountMinorUnits:
                          result.requiredMonthlyContributionMinorUnits,
                        currencyCode,
                      })
                }
                emphasize
              />
              <SummaryFigure
                label="Months remaining"
                value={String(result.monthsRemaining)}
              />
              <SummaryFigure
                label="Target (today's value, real)"
                value={formatMoney({
                  amountMinorUnits: result.realTargetAmountMinorUnits,
                  currencyCode,
                })}
              />
              <SummaryFigure
                label="Target at target date (nominal)"
                value={formatMoney({
                  amountMinorUnits: result.nominalTargetAmountMinorUnits,
                  currencyCode,
                })}
              />
            </div>
          )}

          {result &&
            result.monthsRemaining === 0 &&
            !result.isAlreadyFunded && (
              <Alert variant="destructive">
                <AlertDescription>
                  The target date has already passed (or is today) and the
                  current amount alone doesn&apos;t cover the target — there is
                  no time left for a monthly contribution to help.
                </AlertDescription>
              </Alert>
            )}

          {!canCompute && (
            <Alert>
              <AlertDescription>
                Enter a valid target amount, target date, and expected return to
                see the required contribution.
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
              Number(outputs.requiredMonthlyContributionMinorUnits ?? 0) === 0
                ? "Already on track"
                : `${formatMoney({ amountMinorUnits: Number(outputs.requiredMonthlyContributionMinorUnits ?? 0), currencyCode })}/month required`
            }
          />
        </CardContent>
      </Card>

      {result && (
        <SaveScenarioDialog
          householdId={householdId}
          open={saveOpen}
          onOpenChange={setSaveOpen}
          calculatorType="goal_funding"
          inputs={{
            targetAmount,
            targetDate,
            currentAmount,
            expectedReturnPercent,
            inflationPercent,
          }}
          outputs={{
            monthsRemaining: result.monthsRemaining,
            realTargetAmountMinorUnits: result.realTargetAmountMinorUnits,
            nominalTargetAmountMinorUnits: result.nominalTargetAmountMinorUnits,
            requiredMonthlyContributionMinorUnits:
              result.requiredMonthlyContributionMinorUnits,
            isAlreadyFunded: result.isAlreadyFunded,
          }}
          linkAccounts={accounts.map((a) => ({ id: a.id, label: a.name }))}
          onSaved={onScenariosChanged}
        />
      )}
    </div>
  );
}
