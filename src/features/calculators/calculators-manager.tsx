"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CALCULATOR_TYPE_LABELS,
  type CalculatorType,
} from "@/lib/validation/calculators";
import { SipProjectionCalculator } from "./sip-projection-calculator";
import { LumpSumCalculator } from "./lump-sum-calculator";
import { DailyGrowthCalculator } from "./daily-growth-calculator";
import { EmiCalculator } from "./emi-calculator";
import { LoanPrepaymentCalculator } from "./loan-prepayment-calculator";
import { GoalFundingCalculator } from "./goal-funding-calculator";
import type { LinkableAccount } from "./account-link-field";
import type { CalculatorScenarioRecord } from "./queries";

type CalculatorsManagerProps = {
  householdId: string;
  currencyCode: string;
  today: string;
  accounts: LinkableAccount[];
  scenarios: CalculatorScenarioRecord[];
};

const CALCULATOR_ORDER: CalculatorType[] = [
  "sip_projection",
  "lump_sum",
  "daily_growth",
  "emi",
  "loan_prepayment",
  "goal_funding",
];

/**
 * Tab switcher across the six PROMPT 20 calculators. Every calculator runs
 * entirely client-side (no server round trip to compute a projection —
 * see src/lib/calculations/calculators) except for explicitly saving or
 * deleting a scenario, after which `router.refresh()` re-fetches this
 * page's Server Component data (the standard pattern this app's other
 * managers use — see src/features/staking/staking-manager.tsx).
 */
export function CalculatorsManager({
  householdId,
  currencyCode,
  today,
  accounts,
  scenarios,
}: CalculatorsManagerProps) {
  const [active, setActive] = useState<CalculatorType>("sip_projection");
  const router = useRouter();

  const scenariosForActive = useMemo(
    () => scenarios.filter((scenario) => scenario.calculator_type === active),
    [scenarios, active],
  );

  const onScenariosChanged = () => router.refresh();

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Calculator"
      >
        {CALCULATOR_ORDER.map((type) => (
          <Button
            key={type}
            role="tab"
            aria-selected={active === type}
            variant={active === type ? "default" : "outline"}
            size="sm"
            className={cn(active !== type && "text-muted-foreground")}
            onClick={() => setActive(type)}
          >
            {CALCULATOR_TYPE_LABELS[type]}
          </Button>
        ))}
      </div>

      {active === "sip_projection" && (
        <SipProjectionCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
      {active === "lump_sum" && (
        <LumpSumCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          accounts={accounts}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
      {active === "daily_growth" && (
        <DailyGrowthCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          accounts={accounts}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
      {active === "emi" && (
        <EmiCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
      {active === "loan_prepayment" && (
        <LoanPrepaymentCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
      {active === "goal_funding" && (
        <GoalFundingCalculator
          householdId={householdId}
          currencyCode={currencyCode}
          today={today}
          accounts={accounts}
          scenarios={scenariosForActive}
          onScenariosChanged={onScenariosChanged}
        />
      )}
    </div>
  );
}
