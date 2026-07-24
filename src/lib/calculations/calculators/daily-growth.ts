/**
 * Daily-growth calculator — PROMPT 20. Generalizes the daily-compounding
 * approach src/lib/calculations/staking-snapshot.ts uses for an *actual*
 * staking position's expected projection into a standalone "what if" tool
 * that also supports a recurring contribution and/or withdrawal schedule
 * (a real staking position tracks those as recorded snapshots, not a
 * projected schedule — this module never reads or writes one).
 *
 * Each day compounds first, then that day's scheduled contribution/
 * withdrawal (if any) is applied — same order as a real daily-yield
 * position where the rate applies to the balance already on deposit
 * before today's movement lands.
 */

export type DailyGrowthInput = {
  startingAmountMinorUnits: number;
  /** Decimal, e.g. 0.001 for 0.1%/day — never an annual rate divided by 365. */
  dailyRate: number;
  days: number;
  /** Amount added every `contributionEveryDays` days; ignored if contributionEveryDays is 0. */
  contributionMinorUnits: number;
  /** 0 disables contributions entirely. */
  contributionEveryDays: number;
  /** Amount removed every `withdrawalEveryDays` days; ignored if withdrawalEveryDays is 0. */
  withdrawalMinorUnits: number;
  /** 0 disables withdrawals entirely. */
  withdrawalEveryDays: number;
};

export type DailyGrowthPoint = {
  dayIndex: number;
  cumulativeContributedMinorUnits: number;
  cumulativeWithdrawnMinorUnits: number;
  /** Always a projection — never shown as guaranteed (docs/money-calculation-rules.md §4). */
  valueMinorUnits: number;
};

export type DailyGrowthResult = {
  points: DailyGrowthPoint[];
  finalValueMinorUnits: number;
  totalContributedMinorUnits: number;
  totalWithdrawnMinorUnits: number;
  totalGrowthMinorUnits: number;
};

export function computeDailyGrowth(input: DailyGrowthInput): DailyGrowthResult {
  const days = Math.max(0, Math.round(input.days));
  const points: DailyGrowthPoint[] = [
    {
      dayIndex: 0,
      cumulativeContributedMinorUnits: 0,
      cumulativeWithdrawnMinorUnits: 0,
      valueMinorUnits: Math.round(input.startingAmountMinorUnits),
    },
  ];

  let value = input.startingAmountMinorUnits;
  let cumulativeContributed = 0;
  let cumulativeWithdrawn = 0;

  for (let day = 1; day <= days; day++) {
    value = value * (1 + input.dailyRate);

    if (
      input.contributionEveryDays > 0 &&
      day % input.contributionEveryDays === 0
    ) {
      value += input.contributionMinorUnits;
      cumulativeContributed += input.contributionMinorUnits;
    }
    if (
      input.withdrawalEveryDays > 0 &&
      day % input.withdrawalEveryDays === 0
    ) {
      value -= input.withdrawalMinorUnits;
      cumulativeWithdrawn += input.withdrawalMinorUnits;
    }

    points.push({
      dayIndex: day,
      cumulativeContributedMinorUnits: Math.round(cumulativeContributed),
      cumulativeWithdrawnMinorUnits: Math.round(cumulativeWithdrawn),
      valueMinorUnits: Math.round(value),
    });
  }

  const finalValueMinorUnits = Math.round(value);
  const totalContributedMinorUnits = Math.round(cumulativeContributed);
  const totalWithdrawnMinorUnits = Math.round(cumulativeWithdrawn);

  return {
    points,
    finalValueMinorUnits,
    totalContributedMinorUnits,
    totalWithdrawnMinorUnits,
    totalGrowthMinorUnits:
      finalValueMinorUnits -
      Math.round(input.startingAmountMinorUnits) -
      totalContributedMinorUnits +
      totalWithdrawnMinorUnits,
  };
}
