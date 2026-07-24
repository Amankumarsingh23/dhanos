"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/forms/native-select";
import { formatMoney, parseDecimalToMinorUnits } from "@/lib/money";
import { formatDisplayDate } from "@/lib/dates";
import {
  comparePrepaymentScenarios,
  type PrepaymentScenarioInput,
} from "@/lib/calculations/debt-prepayment";
import { SummaryFigure } from "./summary-figure";

export type SimulatablLoan = {
  id: string;
  name: string;
  currencyCode: string;
  outstandingMinorUnits: number;
  annualInterestRate: number;
  emiAmountMinorUnits: number;
};

type ScenarioKind =
  "one_time_prepayment" | "increased_emi" | "regular_extra_payment";

const SCENARIO_LABELS: Record<ScenarioKind, string> = {
  one_time_prepayment: "One-time prepayment",
  increased_emi: "Increased EMI",
  regular_extra_payment: "Regular extra payment",
};

type PrepaymentSimulatorProps = {
  loans: readonly SimulatablLoan[];
  asOfDate: string;
};

/** A decimal rupee amount (e.g. "50000" meaning ₹50,000) into integer minor units — never treats the typed number as already being in minor units. */
function tryParseMoneyAmount(
  value: string,
  currencyCode: string,
): number | null {
  try {
    const parsed = parseDecimalToMinorUnits(value, currencyCode);
    return parsed >= 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** A plain period count (not money) — e.g. "how many EMIs paid first." */
function tryParseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

/**
 * PROMPT 22's prepayment simulator — compares "no prepayment" against one
 * of three what-if scenarios for a real, currently-active loan. Runs
 * entirely client-side (pure functions, no server round trip), same
 * pattern as the PROMPT 20 calculators. The "lender calculations may
 * differ" disclaimer is rendered unconditionally, right next to every
 * result, never just once in a terms page.
 */
export function PrepaymentSimulator({
  loans,
  asOfDate,
}: PrepaymentSimulatorProps) {
  const [loanId, setLoanId] = useState(loans[0]?.id ?? "");
  const [scenarioKind, setScenarioKind] = useState<ScenarioKind>(
    "one_time_prepayment",
  );
  const [prepaymentAmount, setPrepaymentAmount] = useState("");
  const [afterPeriods, setAfterPeriods] = useState("0");
  const [newEmi, setNewEmi] = useState("");
  const [extraPerPeriod, setExtraPerPeriod] = useState("");

  const loan = loans.find((candidate) => candidate.id === loanId) ?? loans[0];

  const scenario: PrepaymentScenarioInput | null = useMemo(() => {
    if (!loan) return null;
    if (scenarioKind === "one_time_prepayment") {
      const amount = tryParseMoneyAmount(prepaymentAmount, loan.currencyCode);
      const periods = tryParseInteger(afterPeriods) ?? 0;
      if (amount === null || amount <= 0) return null;
      return {
        kind: "one_time_prepayment",
        prepaymentMinorUnits: amount,
        afterPeriods: periods,
      };
    }
    if (scenarioKind === "increased_emi") {
      const amount = tryParseMoneyAmount(newEmi, loan.currencyCode);
      if (amount === null || amount <= 0) return null;
      return { kind: "increased_emi", newEmiMinorUnits: amount };
    }
    const amount = tryParseMoneyAmount(extraPerPeriod, loan.currencyCode);
    if (amount === null || amount <= 0) return null;
    return { kind: "regular_extra_payment", extraPerPeriodMinorUnits: amount };
  }, [
    loan,
    scenarioKind,
    prepaymentAmount,
    afterPeriods,
    newEmi,
    extraPerPeriod,
  ]);

  const comparison = useMemo(() => {
    if (!loan || !scenario) return null;
    return comparePrepaymentScenarios(
      loan.outstandingMinorUnits,
      loan.annualInterestRate,
      loan.emiAmountMinorUnits,
      asOfDate,
      scenario,
    );
  }, [loan, scenario, asOfDate]);

  if (loans.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Prepayment simulator</CardTitle>
          <CardDescription>
            No active loan has both an outstanding balance and an EMI set yet —
            add an EMI to a loan to simulate prepayment options for it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: loan!.currencyCode });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prepayment simulator</CardTitle>
        <CardDescription>
          Compares no prepayment against one what-if scenario for a real
          loan&apos;s current outstanding balance, rate, and EMI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            These are estimates only. Your lender&apos;s actual figures may
            differ because of fees, day-count conventions, and its own repayment
            rules.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="prepay-loan">Loan</Label>
            <NativeSelect
              id="prepay-loan"
              value={loanId || loan?.id}
              onChange={(event) => setLoanId(event.target.value)}
            >
              {loans.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prepay-scenario">Scenario</Label>
            <NativeSelect
              id="prepay-scenario"
              value={scenarioKind}
              onChange={(event) =>
                setScenarioKind(event.target.value as ScenarioKind)
              }
            >
              {Object.entries(SCENARIO_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {scenarioKind === "one_time_prepayment" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prepay-amount">Prepayment amount</Label>
              <Input
                id="prepay-amount"
                inputMode="decimal"
                value={prepaymentAmount}
                onChange={(event) => setPrepaymentAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prepay-after">
                Regular EMIs paid first (0 = right away)
              </Label>
              <Input
                id="prepay-after"
                inputMode="numeric"
                value={afterPeriods}
                onChange={(event) => setAfterPeriods(event.target.value)}
              />
            </div>
          </div>
        )}
        {scenarioKind === "increased_emi" && loan && (
          <div className="space-y-1.5">
            <Label htmlFor="prepay-new-emi">
              New EMI (current: {money(loan.emiAmountMinorUnits)})
            </Label>
            <Input
              id="prepay-new-emi"
              inputMode="decimal"
              value={newEmi}
              onChange={(event) => setNewEmi(event.target.value)}
            />
          </div>
        )}
        {scenarioKind === "regular_extra_payment" && (
          <div className="space-y-1.5">
            <Label htmlFor="prepay-extra">Extra amount every EMI</Label>
            <Input
              id="prepay-extra"
              inputMode="decimal"
              value={extraPerPeriod}
              onChange={(event) => setExtraPerPeriod(event.target.value)}
            />
          </div>
        )}

        {loan && !comparison && (
          <p className="text-muted-foreground text-sm">
            Enter an amount to see the comparison.
          </p>
        )}

        {loan && comparison && (
          <>
            {!comparison.baseline.ok && (
              <Alert variant="destructive">
                <AlertDescription>
                  {comparison.baseline.message}
                </AlertDescription>
              </Alert>
            )}
            {comparison.baseline.ok && !comparison.scenario.ok && (
              <Alert variant="destructive">
                <AlertDescription>
                  {comparison.scenario.message}
                </AlertDescription>
              </Alert>
            )}
            {comparison.baseline.ok && comparison.scenario.ok && (
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryFigure
                  label="Estimated interest saved"
                  value={money(comparison.interestSavedMinorUnits ?? 0)}
                  emphasize
                />
                <SummaryFigure
                  label="Estimated tenure reduced"
                  value={`${comparison.tenureReducedMonths ?? 0} months`}
                />
                <SummaryFigure
                  label="Revised payoff date"
                  value={formatDisplayDate(comparison.scenario.payoffDate)}
                  caption={`vs. ${formatDisplayDate(comparison.baseline.payoffDate)} with no prepayment`}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
