import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import { toIsoDateString } from "@/lib/dates";
import {
  computeFundingSourceAllocationTotals,
  computeGoalCurrentSavedAmount,
  computeGoalFunding,
  computeGoalFundingGapMinorUnits,
  computeGoalOnTrackStatus,
  fundingSourceKey,
  isFundingSourceOverAllocated,
  type GoalFundingResult,
  type GoalOnTrackStatus,
} from "@/lib/calculations/goals";
import { listAccounts } from "@/features/accounts/queries";
import { getPortfolioHoldings } from "@/features/investments/queries";
import type { GoalFilters } from "@/lib/validation/goals";
import type { Tables } from "@/types/database";

/**
 * Data access for the financial goals register (PROMPT 30). A goal's
 * current saved amount is never a single stored figure — it's always
 * recomputed here from the goal's own manual amount plus every linked
 * funding source's *real* current value (an account's calculated balance,
 * reusing src/features/accounts/queries.ts's listAccounts; an investment
 * holding's latest valuation, reusing
 * src/features/investments/queries.ts's getPortfolioHoldings), so a goal
 * never drifts from what those other modules already show as truth.
 *
 * "The same investment allocation cannot be accidentally counted fully
 * toward several goals without showing the overlap": every funding source
 * row returned here carries its *own* single-goal allocation_percentage
 * alongside `totalAllocationAcrossGoals` — the sum of that source's
 * allocation across every goal in the household that links to it, fetched
 * once per request (not per goal) so pagination never hides an overlap.
 */

export type GoalRecord = Tables<"goals">;
export type GoalFundingSourceRecord = Tables<"goal_funding_sources">;
export type GoalResponsiblePersonRecord = Tables<"goal_responsible_people">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type GoalFundingSourceRow = {
  id: string;
  sourceType: "account" | "investment_holding";
  sourceId: string;
  sourceName: string;
  allocationPercentage: number;
  currentValueMinorUnits: number | null;
  currencyCode: string;
  /** This source's allocation summed across every goal in the household that links to it — never just this one goal's share. */
  totalAllocationAcrossGoals: number;
  isOverAllocated: boolean;
};

/** One batched fetch of every real source's name/current value/currency — never one query per source. */
async function fetchSourceLookup(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<{
  accounts: Map<
    string,
    { name: string; currentValueMinorUnits: number; currencyCode: string }
  >;
  holdings: Map<
    string,
    {
      name: string;
      currentValueMinorUnits: number | null;
      currencyCode: string;
    }
  >;
}> {
  const [accountsPage, holdings] = await Promise.all([
    listAccounts(supabase, householdId, {}, { pageSize: MAX_PAGE_SIZE }),
    getPortfolioHoldings(supabase, householdId),
  ]);

  const accounts = new Map(
    accountsPage.rows.map((account) => [
      account.id,
      {
        name: account.name,
        currentValueMinorUnits: account.currentBalance.amountMinorUnits,
        currencyCode: account.currency_code,
      },
    ]),
  );

  const holdingsMap = new Map(
    holdings.map((holding) => [
      holding.investmentHoldingId,
      {
        name: `${holding.assetName} (${holding.platformName})`,
        currentValueMinorUnits: holding.currentValueMinorUnits,
        currencyCode: holding.currencyCode,
      },
    ]),
  );

  return { accounts, holdings: holdingsMap };
}

/** Every goal_funding_sources row for the whole household in one query — needed so overlap totals are correct regardless of which goal/page is being viewed. */
async function fetchAllFundingSources(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<GoalFundingSourceRecord[]> {
  return unwrapList(
    await supabase
      .from("goal_funding_sources")
      .select("*")
      .eq("household_id", householdId),
  );
}

async function fetchResponsiblePeopleByGoal(
  supabase: SupabaseServerClient,
  householdId: string,
  goalIds: string[],
): Promise<Map<string, { id: string; personId: string; name: string }[]>> {
  if (goalIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("goal_responsible_people")
      .select("id, goal_id, person_id, people(display_name)")
      .eq("household_id", householdId)
      .in("goal_id", goalIds),
  ) as unknown as {
    id: string;
    goal_id: string;
    person_id: string;
    people: { display_name: string } | null;
  }[];

  const byGoal = new Map<
    string,
    { id: string; personId: string; name: string }[]
  >();
  for (const row of rows) {
    const list = byGoal.get(row.goal_id) ?? [];
    list.push({
      id: row.id,
      personId: row.person_id,
      name: row.people?.display_name ?? "Unknown person",
    });
    byGoal.set(row.goal_id, list);
  }
  return byGoal;
}

function toFundingSourceRow(
  record: GoalFundingSourceRecord,
  lookup: Awaited<ReturnType<typeof fetchSourceLookup>>,
  allocationTotals: Map<string, number>,
): GoalFundingSourceRow {
  const sourceType = record.source_type as "account" | "investment_holding";
  const sourceId = (record.account_id ??
    record.investment_holding_id) as string;
  const source =
    sourceType === "account"
      ? lookup.accounts.get(sourceId)
      : lookup.holdings.get(sourceId);
  const key = fundingSourceKey(sourceType, sourceId);
  const totalAllocationAcrossGoals = allocationTotals.get(key) ?? 0;

  return {
    id: record.id,
    sourceType,
    sourceId,
    sourceName: source?.name ?? "Unknown source",
    allocationPercentage: record.allocation_percentage,
    currentValueMinorUnits: source?.currentValueMinorUnits ?? null,
    currencyCode: source?.currencyCode ?? "INR",
    totalAllocationAcrossGoals,
    isOverAllocated: isFundingSourceOverAllocated(totalAllocationAcrossGoals),
  };
}

export type GoalRow = GoalRecord & {
  responsiblePeople: { id: string; personId: string; name: string }[];
  fundingSources: GoalFundingSourceRow[];
  currentSavedAmountMinorUnits: number;
  excludedCurrencyMismatchCount: number;
  missingValueCount: number;
  funding: GoalFundingResult;
  fundingGapMinorUnits: number;
  onTrackStatus: GoalOnTrackStatus;
};

function buildGoalRow(
  goal: GoalRecord,
  fundingSources: GoalFundingSourceRow[],
  responsiblePeople: { id: string; personId: string; name: string }[],
  asOfDate: string,
): GoalRow {
  const savedAmount = computeGoalCurrentSavedAmount(
    goal.manual_current_saved_amount_minor_units,
    goal.currency_code,
    fundingSources.map((source) => ({
      currentValueMinorUnits: source.currentValueMinorUnits,
      allocationPercentage: source.allocationPercentage,
      currencyCode: source.currencyCode,
    })),
  );

  const funding = computeGoalFunding({
    targetAmountMinorUnits: goal.target_amount_minor_units,
    targetDate: goal.target_date,
    asOfDate,
    currentAmountMinorUnits: savedAmount.amountMinorUnits,
    annualExpectedReturn: goal.annual_expected_return,
    annualInflationRate: goal.annual_inflation_rate,
  });

  const fundingGapMinorUnits = computeGoalFundingGapMinorUnits(
    savedAmount.amountMinorUnits,
    funding.nominalTargetAmountMinorUnits,
  );

  const onTrackStatus = computeGoalOnTrackStatus({
    currentSavedAmountMinorUnits: savedAmount.amountMinorUnits,
    nominalTargetAmountMinorUnits: funding.nominalTargetAmountMinorUnits,
    projectedCurrentAmountGrowthMinorUnits:
      funding.projectedCurrentAmountGrowthMinorUnits,
    monthsRemaining: funding.monthsRemaining,
  });

  return {
    ...goal,
    responsiblePeople,
    fundingSources,
    currentSavedAmountMinorUnits: savedAmount.amountMinorUnits,
    excludedCurrencyMismatchCount: savedAmount.excludedCurrencyMismatchCount,
    missingValueCount: savedAmount.missingValueCount,
    funding,
    fundingGapMinorUnits,
    onTrackStatus,
  };
}

/**
 * Lists a household's goals, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * name. Funding sources (with household-wide overlap totals) and
 * responsible people are fetched for the whole page in a fixed number of
 * queries — never one per row.
 */
export async function listGoals(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: GoalFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
): Promise<Page<GoalRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("goals").select("*");
  query = scopeToHousehold(query, householdId);

  if (filters.goalType) {
    query = query.eq("goal_type", filters.goalType);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "target_date", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as GoalRecord[];
  const page = toPage(rawRows, pagination);

  const [allFundingSources, lookup, responsiblePeopleByGoal] =
    await Promise.all([
      fetchAllFundingSources(supabase, householdId),
      fetchSourceLookup(supabase, householdId),
      fetchResponsiblePeopleByGoal(
        supabase,
        householdId,
        page.rows.map((row) => row.id),
      ),
    ]);

  const allocationTotals = computeFundingSourceAllocationTotals(
    allFundingSources.map((source) => ({
      sourceKey: fundingSourceKey(
        source.source_type as "account" | "investment_holding",
        (source.account_id ?? source.investment_holding_id) as string,
      ),
      allocationPercentage: source.allocation_percentage,
    })),
  );

  const fundingSourcesByGoal = new Map<string, GoalFundingSourceRow[]>();
  for (const source of allFundingSources) {
    const list = fundingSourcesByGoal.get(source.goal_id) ?? [];
    list.push(toFundingSourceRow(source, lookup, allocationTotals));
    fundingSourcesByGoal.set(source.goal_id, list);
  }

  const rows = page.rows.map((goal) =>
    buildGoalRow(
      goal,
      fundingSourcesByGoal.get(goal.id) ?? [],
      responsiblePeopleByGoal.get(goal.id) ?? [],
      asOfDate,
    ),
  );

  return { ...page, rows };
}

export async function getGoalDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  goalId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<GoalRow> {
  const goal = unwrapSingle(
    await supabase
      .from("goals")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", goalId)
      .maybeSingle(),
  ) as GoalRecord;

  const [allFundingSources, lookup, responsiblePeopleByGoal] =
    await Promise.all([
      fetchAllFundingSources(supabase, householdId),
      fetchSourceLookup(supabase, householdId),
      fetchResponsiblePeopleByGoal(supabase, householdId, [goalId]),
    ]);

  const allocationTotals = computeFundingSourceAllocationTotals(
    allFundingSources.map((source) => ({
      sourceKey: fundingSourceKey(
        source.source_type as "account" | "investment_holding",
        (source.account_id ?? source.investment_holding_id) as string,
      ),
      allocationPercentage: source.allocation_percentage,
    })),
  );

  const fundingSources = allFundingSources
    .filter((source) => source.goal_id === goalId)
    .map((source) => toFundingSourceRow(source, lookup, allocationTotals));

  return buildGoalRow(
    goal,
    fundingSources,
    responsiblePeopleByGoal.get(goalId) ?? [],
    asOfDate,
  );
}

export type GoalsOverview = {
  currencyCode: string;
  goalCount: number;
  totalTargetMinorUnits: number;
  totalCurrentSavedMinorUnits: number;
  totalFundingGapMinorUnits: number;
  byOnTrackStatus: Record<GoalOnTrackStatus, number>;
  byPriority: Record<"high" | "medium" | "low", number>;
  overAllocatedSourceCount: number;
};

/**
 * The combined fetch behind the goals overview — every figure here is a
 * sum of the same per-goal facts listGoals already computes, scoped to
 * one currency and to active goals only (a paused/achieved/abandoned goal
 * stays visible on its own detail page but never inflates "what am I
 * currently working toward").
 */
export async function getGoalsOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<GoalsOverview> {
  const page = await listGoals(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: MAX_PAGE_SIZE },
    asOfDate,
  );
  const inCurrency = page.rows.filter(
    (goal) => goal.currency_code === currencyCode,
  );

  const byOnTrackStatus: Record<GoalOnTrackStatus, number> = {
    funded: 0,
    on_track: 0,
    needs_contribution: 0,
    overdue: 0,
  };
  const byPriority: Record<"high" | "medium" | "low", number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  const overAllocatedSourceKeys = new Set<string>();

  let totalTargetMinorUnits = 0;
  let totalCurrentSavedMinorUnits = 0;
  let totalFundingGapMinorUnits = 0;

  for (const goal of inCurrency) {
    byOnTrackStatus[goal.onTrackStatus] += 1;
    byPriority[goal.priority as "high" | "medium" | "low"] += 1;
    totalTargetMinorUnits += goal.funding.nominalTargetAmountMinorUnits;
    totalCurrentSavedMinorUnits += goal.currentSavedAmountMinorUnits;
    totalFundingGapMinorUnits += goal.fundingGapMinorUnits;
    for (const source of goal.fundingSources) {
      if (source.isOverAllocated) {
        overAllocatedSourceKeys.add(
          fundingSourceKey(source.sourceType, source.sourceId),
        );
      }
    }
  }

  return {
    currencyCode,
    goalCount: inCurrency.length,
    totalTargetMinorUnits,
    totalCurrentSavedMinorUnits,
    totalFundingGapMinorUnits,
    byOnTrackStatus,
    byPriority,
    overAllocatedSourceCount: overAllocatedSourceKeys.size,
  };
}
