import { describe, expect, it } from "vitest";
import { computeDailyGrowth } from "./daily-growth";

describe("computeDailyGrowth", () => {
  it("compounds a starting amount daily with no contributions or withdrawals", () => {
    const result = computeDailyGrowth({
      startingAmountMinorUnits: 100_000,
      dailyRate: 0.001,
      days: 30,
      contributionMinorUnits: 0,
      contributionEveryDays: 0,
      withdrawalMinorUnits: 0,
      withdrawalEveryDays: 0,
    });

    const expected = 100_000 * Math.pow(1.001, 30);
    expect(result.points).toHaveLength(31); // day 0 through day 30
    expect(result.finalValueMinorUnits).toBe(Math.round(expected));
    expect(result.totalContributedMinorUnits).toBe(0);
    expect(result.totalWithdrawnMinorUnits).toBe(0);
  });

  it("adds a contribution on every scheduled day", () => {
    const result = computeDailyGrowth({
      startingAmountMinorUnits: 0,
      dailyRate: 0,
      days: 10,
      contributionMinorUnits: 1_000,
      contributionEveryDays: 5,
      withdrawalMinorUnits: 0,
      withdrawalEveryDays: 0,
    });

    // Contributions land on day 5 and day 10.
    expect(result.totalContributedMinorUnits).toBe(2_000);
    expect(result.finalValueMinorUnits).toBe(2_000);
  });

  it("subtracts a withdrawal on every scheduled day", () => {
    const result = computeDailyGrowth({
      startingAmountMinorUnits: 10_000,
      dailyRate: 0,
      days: 10,
      contributionMinorUnits: 0,
      contributionEveryDays: 0,
      withdrawalMinorUnits: 1_000,
      withdrawalEveryDays: 5,
    });

    expect(result.totalWithdrawnMinorUnits).toBe(2_000);
    expect(result.finalValueMinorUnits).toBe(8_000);
  });

  it("handles zero days by returning only the starting point", () => {
    const result = computeDailyGrowth({
      startingAmountMinorUnits: 5_000,
      dailyRate: 0.01,
      days: 0,
      contributionMinorUnits: 100,
      contributionEveryDays: 1,
      withdrawalMinorUnits: 0,
      withdrawalEveryDays: 0,
    });

    expect(result.points).toHaveLength(1);
    expect(result.finalValueMinorUnits).toBe(5_000);
  });

  it("allows the value to go negative when withdrawals exceed growth and contributions", () => {
    const result = computeDailyGrowth({
      startingAmountMinorUnits: 1_000,
      dailyRate: 0,
      days: 5,
      contributionMinorUnits: 0,
      contributionEveryDays: 0,
      withdrawalMinorUnits: 500,
      withdrawalEveryDays: 1,
    });

    expect(result.finalValueMinorUnits).toBeLessThan(0);
  });
});
