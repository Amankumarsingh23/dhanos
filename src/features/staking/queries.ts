import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import { isStale } from "@/components/shared/stale-data-indicator";
import {
  computeExpectedProjection,
  validateExpectedDailyRate,
} from "@/lib/calculations/staking-snapshot";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { StakingPositionFilters } from "@/lib/validation/staking";
import type { InvestmentAssetClass } from "@/lib/validation/investments";
import type { Tables } from "@/types/database";

export type StakingPositionRecord = Tables<"staking_positions">;
export type StakingSnapshotRecord = Tables<"staking_daily_snapshots">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** A staking position's snapshot is expected daily — stale after this much shorter window than a periodic investment valuation (PROMPT 18 used 45 days; a daily-tracked position is stale after just 2). */
const SNAPSHOT_STALE_AFTER_HOURS = 48;

type RawPositionRow = StakingPositionRecord & {
  investment_holdings: {
    investment_assets: { name: string; asset_class: string } | null;
    investment_accounts: { name: string } | null;
  } | null;
};

const POSITION_SELECT =
  "*, investment_holdings(investment_assets(name, asset_class), investment_accounts(name))";

export type StakingPositionRow = StakingPositionRecord & {
  assetName: string;
  assetClass: InvestmentAssetClass;
  platformName: string;
  latestSnapshot: StakingSnapshotRecord | null;
  isLocked: boolean;
  isSnapshotStale: boolean;
  hasNoSnapshotYet: boolean;
  highReturnWarning: string | null;
};

function mapPositionRow(
  row: RawPositionRow,
  latestSnapshot: StakingSnapshotRecord | null,
  asOfDate: string,
): StakingPositionRow {
  const { investment_holdings, ...rest } = row;
  const rateValidation =
    rest.expected_daily_rate !== null
      ? validateExpectedDailyRate(rest.expected_daily_rate)
      : null;

  return {
    ...rest,
    assetName: investment_holdings?.investment_assets?.name ?? "Unknown asset",
    assetClass:
      (investment_holdings?.investment_assets
        ?.asset_class as InvestmentAssetClass) ?? "other",
    platformName:
      investment_holdings?.investment_accounts?.name ?? "Unknown platform",
    latestSnapshot,
    isLocked: Boolean(
      rest.lock_in_end_date && rest.lock_in_end_date > asOfDate,
    ),
    isSnapshotStale: latestSnapshot
      ? isStale(latestSnapshot.snapshot_date, SNAPSHOT_STALE_AFTER_HOURS)
      : false,
    hasNoSnapshotYet: latestSnapshot === null,
    highReturnWarning:
      rateValidation && rateValidation.valid ? rateValidation.warning : null,
  };
}

/** The latest (highest-revision) snapshot per position, one query for the whole page — never one query per position. */
async function fetchLatestSnapshots(
  supabase: SupabaseServerClient,
  householdId: string,
  positionIds: string[],
): Promise<Map<string, StakingSnapshotRecord>> {
  if (positionIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("staking_daily_snapshots_current")
      .select("*")
      .eq("household_id", householdId)
      .in("staking_position_id", positionIds)
      .order("staking_position_id", { ascending: true })
      .order("snapshot_date", { ascending: false }),
  ) as unknown as StakingSnapshotRecord[];

  const latest = new Map<string, StakingSnapshotRecord>();
  for (const row of rows) {
    if (!latest.has(row.staking_position_id)) {
      latest.set(row.staking_position_id, row);
    }
  }
  return latest;
}

/**
 * Lists a household's staking positions, following the standard query
 * contract: household-scoped, paginated, deterministically ordered,
 * searchable by name. Each row's latest snapshot and risk flags (locked,
 * stale, no snapshot yet, high-return warning) are computed for the whole
 * page from a fixed, small number of queries — never one per position.
 */
export async function listStakingPositions(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: StakingPositionFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
): Promise<Page<StakingPositionRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("staking_positions").select(POSITION_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawPositionRow[];
  const page = toPage(rawRows, pagination);

  const latestSnapshots = await fetchLatestSnapshots(
    supabase,
    householdId,
    page.rows.map((row) => row.id),
  );

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapPositionRow(row, latestSnapshots.get(row.id) ?? null, asOfDate),
    ),
  };
}

export type StakingPositionDetail = StakingPositionRow & {
  /** One row per day — the authoritative (latest-revision) figure, oldest first. */
  dailySnapshots: StakingSnapshotRecord[];
  /** Every revision ever recorded, including superseded ones — the full "never overwritten" audit trail. */
  allRevisions: StakingSnapshotRecord[];
};

export async function getStakingPositionDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  stakingPositionId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<StakingPositionDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("staking_positions")
      .select(POSITION_SELECT)
      .eq("household_id", householdId)
      .eq("id", stakingPositionId)
      .maybeSingle(),
  ) as unknown as RawPositionRow;

  const [currentResult, allRevisionsResult] = await Promise.all([
    supabase
      .from("staking_daily_snapshots_current")
      .select("*")
      .eq("household_id", householdId)
      .eq("staking_position_id", stakingPositionId)
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("staking_daily_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .eq("staking_position_id", stakingPositionId)
      .order("snapshot_date", { ascending: false })
      .order("revision", { ascending: false })
      .limit(200),
  ]);

  const dailySnapshots = unwrapList(
    currentResult,
  ) as unknown as StakingSnapshotRecord[];
  const allRevisions = unwrapList(
    allRevisionsResult,
  ) as unknown as StakingSnapshotRecord[];
  const latestSnapshot = dailySnapshots[dailySnapshots.length - 1] ?? null;

  return {
    ...mapPositionRow(raw, latestSnapshot, asOfDate),
    dailySnapshots,
    allRevisions,
  };
}

export type PlatformConcentrationRow = {
  platformName: string;
  currencyCode: string;
  currentValueMinorUnits: number;
  sharePercent: number;
};

/**
 * Current staked value grouped by platform, as a share of the total
 * across active positions in that currency — "platform concentration"
 * risk signal (PROMPT 19). Never blended across currencies.
 */
export async function getPlatformConcentration(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<PlatformConcentrationRow[]> {
  const page = await listStakingPositions(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
  );

  const totalsByPlatform = new Map<string, number>();
  const totalsByCurrency = new Map<string, number>();
  for (const position of page.rows) {
    if (!position.latestSnapshot) continue;
    const key = `${position.platformName}::${position.currency_code}`;
    const value = position.latestSnapshot.closing_value_minor_units;
    totalsByPlatform.set(key, (totalsByPlatform.get(key) ?? 0) + value);
    totalsByCurrency.set(
      position.currency_code,
      (totalsByCurrency.get(position.currency_code) ?? 0) + value,
    );
  }

  return Array.from(totalsByPlatform.entries())
    .map(([key, currentValueMinorUnits]) => {
      const [platformName, currencyCode] = key.split("::") as [string, string];
      const total = totalsByCurrency.get(currencyCode) ?? 0;
      return {
        platformName,
        currencyCode,
        currentValueMinorUnits,
        sharePercent: total === 0 ? 0 : (currentValueMinorUnits / total) * 100,
      };
    })
    .sort((a, b) => b.sharePercent - a.sharePercent);
}

function buildDayRange(asOfDate: string, daysBack: number): string[] {
  const asOf = new Date(`${asOfDate}T00:00:00Z`);
  return Array.from({ length: daysBack }, (_, i) => {
    const day = new Date(asOf);
    day.setUTCDate(day.getUTCDate() - (daysBack - 1 - i));
    return toIsoDateString(day);
  });
}

export type DailyValuePoint = {
  date: string;
  closingValueMinorUnits: number;
  cumulativeContributedMinorUnits: number;
  cumulativeRewardsMinorUnits: number;
  cumulativeWithdrawalsMinorUnits: number;
  /** The projected value at this date, summed across positions that have an expected_daily_rate set — null on a date before every position's opening. */
  expectedValueMinorUnits: number | null;
  hasAnySnapshot: boolean;
};

/**
 * The core daily time series behind every staking chart — actual closing
 * value (carried forward from the latest snapshot at or before each day,
 * same convention as every other "point in time" balance in this app),
 * cumulative contributed/rewards/withdrawals, and the expected projection
 * — for the trailing `daysBack` days across all active, base-currency
 * positions. The expected projection is always computed separately from
 * actual data (never blended into one series) — PROMPT 19: "expected
 * return must never be shown as guaranteed" / "projection and actual data
 * are visually distinct."
 */
export async function getDailyValueSeries(
  supabase: SupabaseServerClient,
  householdId: string,
  baseCurrencyCode: string,
  daysBack = 90,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<DailyValuePoint[]> {
  const positionsPage = await listStakingPositions(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
  );
  const positions = positionsPage.rows.filter(
    (p) => p.currency_code === baseCurrencyCode,
  );
  const positionIds = positions.map((p) => p.id);

  let allSnapshots: StakingSnapshotRecord[] = [];
  if (positionIds.length > 0) {
    const snapshotsResult = await supabase
      .from("staking_daily_snapshots_current")
      .select("*")
      .eq("household_id", householdId)
      .in("staking_position_id", positionIds)
      .order("snapshot_date", { ascending: true });
    allSnapshots = unwrapList(
      snapshotsResult,
    ) as unknown as StakingSnapshotRecord[];
  }

  const snapshotsByPosition = new Map<string, StakingSnapshotRecord[]>();
  for (const row of allSnapshots) {
    const list = snapshotsByPosition.get(row.staking_position_id) ?? [];
    list.push(row);
    snapshotsByPosition.set(row.staking_position_id, list);
  }

  const days = buildDayRange(asOfDate, daysBack);

  // Running per-position "latest known closing value" pointer, advanced
  // as we walk the day range forward — avoids re-scanning each position's
  // full history for every single day.
  const lastKnownClosing = new Map<string, number>();
  const snapshotIndexByPosition = new Map<string, number>();

  return days.map((date) => {
    let closingValue = 0;
    let cumulativeContributed = 0;
    let cumulativeRewards = 0;
    let cumulativeWithdrawals = 0;
    let expectedValue = 0;
    let hasAnyExpected = false;
    let hasAnySnapshot = false;

    for (const position of positions) {
      const snapshots = snapshotsByPosition.get(position.id) ?? [];
      let index = snapshotIndexByPosition.get(position.id) ?? 0;
      while (
        index < snapshots.length &&
        snapshots[index]!.snapshot_date <= date
      ) {
        const snapshot = snapshots[index]!;
        lastKnownClosing.set(position.id, snapshot.closing_value_minor_units);
        hasAnySnapshot = true;
        index += 1;
      }
      snapshotIndexByPosition.set(position.id, index);
      closingValue += lastKnownClosing.get(position.id) ?? 0;

      // Cumulative sums recompute over the snapshots up to `date` — cheap
      // given a personal app's realistic snapshot volume, and simpler/
      // more obviously correct than trying to maintain three more running
      // pointers alongside the closing-value one above.
      for (const snapshot of snapshots) {
        if (snapshot.snapshot_date > date) break;
        cumulativeContributed += snapshot.contribution_minor_units;
        cumulativeRewards += snapshot.reward_minor_units;
        cumulativeWithdrawals += snapshot.withdrawal_minor_units;
      }

      if (
        position.expected_daily_rate !== null &&
        position.opening_date <= date
      ) {
        const daysSinceOpening = Math.round(
          (new Date(`${date}T00:00:00Z`).getTime() -
            new Date(`${position.opening_date}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const projection = computeExpectedProjection(
          position.opening_principal_minor_units,
          position.expected_daily_rate,
          daysSinceOpening,
        );
        expectedValue +=
          projection[projection.length - 1]?.expectedValueMinorUnits ?? 0;
        hasAnyExpected = true;
      }
    }

    return {
      date,
      closingValueMinorUnits: closingValue,
      cumulativeContributedMinorUnits: cumulativeContributed,
      cumulativeRewardsMinorUnits: cumulativeRewards,
      cumulativeWithdrawalsMinorUnits: cumulativeWithdrawals,
      expectedValueMinorUnits: hasAnyExpected ? expectedValue : null,
      hasAnySnapshot,
    };
  });
}

/**
 * Every current-revision snapshot for a set of positions, grouped by
 * position id — one query for the whole page, never one per position.
 * Used to prefill the daily-snapshot dialog's opening value and detect
 * whether the chosen date already has an entry (an adjustment).
 */
export async function listSnapshotsForPositions(
  supabase: SupabaseServerClient,
  householdId: string,
  positionIds: string[],
): Promise<Record<string, StakingSnapshotRecord[]>> {
  if (positionIds.length === 0) {
    return {};
  }
  const rows = unwrapList(
    await supabase
      .from("staking_daily_snapshots_current")
      .select("*")
      .eq("household_id", householdId)
      .in("staking_position_id", positionIds)
      .order("snapshot_date", { ascending: true }),
  ) as unknown as StakingSnapshotRecord[];

  const byPosition: Record<string, StakingSnapshotRecord[]> = {};
  for (const row of rows) {
    (byPosition[row.staking_position_id] ??= []).push(row);
  }
  return byPosition;
}
