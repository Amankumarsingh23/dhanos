import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  computeDailyEquivalent,
  computeMonthlyEquivalent,
} from "@/lib/calculations/sip-commitment";
import {
  isRecurringMissed,
  isRecurringUpcoming,
} from "@/lib/calculations/recurring-schedule";
import { toIsoDateString } from "@/lib/dates";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import type { InvestmentSipFilters } from "@/lib/validation/investment-sips";
import type { InvestmentAssetClass } from "@/lib/validation/investments";
import type { Tables } from "@/types/database";

export type InvestmentSipRecord = Tables<"investment_sips">;
export type InvestmentSipEventRecord = Tables<"investment_sip_events">;
export type InvestmentContributionRecord = Tables<"investment_transactions">;
export type InvestmentAccountRecord = Tables<"investment_accounts">;
export type InvestmentAssetRecord = Tables<"investment_assets">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type InvestmentSipRow = InvestmentSipRecord & {
  assetName: string;
  assetClass: InvestmentAssetClass;
  platformName: string;
  contributionAccountName: string | null;
  isMissed: boolean;
  isUpcoming: boolean;
};

type RawInvestmentSipRow = InvestmentSipRecord & {
  investment_holdings: {
    investment_assets: { name: string; asset_class: string } | null;
    investment_accounts: { name: string } | null;
  } | null;
  contribution_account: { name: string } | null;
};

const INVESTMENT_SIP_SELECT =
  "*, investment_holdings(investment_assets(name, asset_class), investment_accounts(name)), contribution_account:financial_accounts!investment_sips_contribution_account_id_fkey(name)";

function mapRow(
  row: RawInvestmentSipRow,
  asOfDate: string,
  upcomingDaysAhead: number,
): InvestmentSipRow {
  const { investment_holdings, contribution_account, ...rest } = row;
  const isMissed =
    rest.status === "active" &&
    rest.next_due_date !== null &&
    isRecurringMissed({ nextDueDate: rest.next_due_date, asOfDate });
  const isUpcoming =
    rest.status === "active" &&
    !isMissed &&
    rest.next_due_date !== null &&
    isRecurringUpcoming({
      nextDueDate: rest.next_due_date,
      asOfDate,
      daysAhead: upcomingDaysAhead,
    });

  return {
    ...rest,
    assetName: investment_holdings?.investment_assets?.name ?? "Unknown asset",
    assetClass:
      (investment_holdings?.investment_assets
        ?.asset_class as InvestmentAssetClass) ?? "other",
    platformName:
      investment_holdings?.investment_accounts?.name ?? "Unknown platform",
    contributionAccountName: contribution_account?.name ?? null,
    isMissed,
    isUpcoming,
  };
}

/**
 * Lists a household's SIPs, following the standard query contract (see
 * docs/data-access-patterns.md §2): household-scoped, paginated,
 * deterministically ordered (next_due_date, then id as a tiebreaker),
 * searchable by name. Asset/platform names are resolved through the
 * linked investment_holdings row in one embedded-join query, never one
 * query per row.
 */
export async function listSips(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: InvestmentSipFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
  upcomingDaysAhead = 14,
): Promise<Page<InvestmentSipRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("investment_sips").select(INVESTMENT_SIP_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.investmentAccountId) {
    query = query.eq(
      "investment_holdings.investment_account_id",
      filters.investmentAccountId,
    );
  }

  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "next_due_date", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawInvestmentSipRow[];
  const page = toPage(rawRows, pagination);

  return {
    ...page,
    rows: page.rows.map((row) => mapRow(row, asOfDate, upcomingDaysAhead)),
  };
}

export type InvestmentSipDetail = InvestmentSipRow & {
  events: InvestmentSipEventRecord[];
  recentContributions: InvestmentContributionRecord[];
};

/** One SIP's full detail: history log and recently recorded contributions. */
export async function getSipDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  investmentSipId: string,
  asOfDate: string = toIsoDateString(new Date()),
  upcomingDaysAhead = 14,
): Promise<InvestmentSipDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("investment_sips")
      .select(INVESTMENT_SIP_SELECT)
      .eq("household_id", householdId)
      .eq("id", investmentSipId)
      .maybeSingle(),
  ) as unknown as RawInvestmentSipRow;

  const [eventsResult, contributionsResult] = await Promise.all([
    supabase
      .from("investment_sip_events")
      .select("*")
      .eq("household_id", householdId)
      .eq("investment_sip_id", investmentSipId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("investment_transactions")
      .select("*")
      .eq("household_id", householdId)
      .eq("investment_sip_id", investmentSipId)
      .order("transaction_date", { ascending: false })
      .limit(20),
  ]);

  const events = unwrapList(eventsResult);
  const recentContributions = unwrapList(contributionsResult);
  const row = mapRow(raw, asOfDate, upcomingDaysAhead);

  return { ...row, events, recentContributions };
}

/** Active SIPs due within `daysAhead` days — "upcoming" view. */
export async function getUpcomingSips(
  supabase: SupabaseServerClient,
  householdId: string,
  daysAhead = 14,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<InvestmentSipRow[]> {
  const page = await listSips(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
    daysAhead,
  );
  return page.rows.filter((row) => row.isUpcoming);
}

/**
 * Active SIPs whose next_due_date is overdue past its grace period —
 * "missed" view. A missed SIP is never counted as a completed
 * contribution (PROMPT 17 acceptance criterion): this reads only
 * next_due_date/status, never investment_transactions, so a missed
 * occurrence can't accidentally be conflated with a recorded one.
 */
export async function getMissedSips(
  supabase: SupabaseServerClient,
  householdId: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<InvestmentSipRow[]> {
  const page = await listSips(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: 100 },
    asOfDate,
  );
  return page.rows.filter((row) => row.isMissed);
}

export type SipContributionRow = {
  investmentTransactionId: string;
  investmentSipId: string;
  sipName: string;
  transactionDate: string;
  amountMinorUnits: number;
  currencyCode: string;
};

/**
 * SIP contributions actually recorded within [dateFrom, dateTo] — "completed
 * this month" view. Reads investment_transactions directly (kind =
 * 'contribution', investment_sip_id set, not cancelled) — a due-but-unpaid
 * occurrence never appears here, only ones a
 * record_investment_sip_contribution call actually wrote.
 */
export async function getCompletedSipContributions(
  supabase: SupabaseServerClient,
  householdId: string,
  dateFrom: string,
  dateTo: string,
): Promise<SipContributionRow[]> {
  const rows = unwrapList(
    await supabase
      .from("investment_transactions")
      .select(
        "id, investment_sip_id, transaction_date, amount_minor_units, currency_code, investment_sips(name)",
      )
      .eq("household_id", householdId)
      .eq("transaction_type", "contribution")
      .not("investment_sip_id", "is", null)
      .neq("status", "cancelled")
      .gte("transaction_date", dateFrom)
      .lte("transaction_date", dateTo)
      .order("transaction_date", { ascending: false }),
  ) as unknown as {
    id: string;
    investment_sip_id: string | null;
    transaction_date: string;
    amount_minor_units: number;
    currency_code: string;
    investment_sips: { name: string } | null;
  }[];

  return rows
    .filter(
      (row): row is typeof row & { investment_sip_id: string } =>
        row.investment_sip_id !== null,
    )
    .map((row) => ({
      investmentTransactionId: row.id,
      investmentSipId: row.investment_sip_id,
      sipName: row.investment_sips?.name ?? "Unknown SIP",
      transactionDate: row.transaction_date,
      amountMinorUnits: row.amount_minor_units,
      currencyCode: row.currency_code,
    }));
}

export type CurrencyAmount = { currencyCode: string; amountMinorUnits: number };

/**
 * Active SIPs' contribution amounts, normalized to monthly/daily
 * equivalents (src/lib/calculations/sip-commitment.ts) and summed per
 * currency — "total monthly commitment" / "daily commitment" views. Never
 * blended across currencies (PROMPT 17 acceptance criterion): a household
 * with both INR and USD SIPs gets one row per currency.
 */
export async function getTotalCommitment(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<{ monthly: CurrencyAmount[]; daily: CurrencyAmount[] }> {
  const rows = unwrapList(
    await supabase
      .from("investment_sips")
      .select(
        "contribution_amount_minor_units, currency_code, frequency, interval_count",
      )
      .eq("household_id", householdId)
      .eq("status", "active"),
  );

  const monthlyTotals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();

  for (const row of rows) {
    const monthly = computeMonthlyEquivalent(
      row.contribution_amount_minor_units,
      row.frequency,
      row.interval_count,
    );
    const daily = computeDailyEquivalent(
      row.contribution_amount_minor_units,
      row.frequency,
      row.interval_count,
    );
    monthlyTotals.set(
      row.currency_code,
      (monthlyTotals.get(row.currency_code) ?? 0) + monthly,
    );
    dailyTotals.set(
      row.currency_code,
      (dailyTotals.get(row.currency_code) ?? 0) + daily,
    );
  }

  const toRows = (totals: Map<string, number>): CurrencyAmount[] =>
    Array.from(totals.entries()).map(([currencyCode, amountMinorUnits]) => ({
      currencyCode,
      amountMinorUnits,
    }));

  return { monthly: toRows(monthlyTotals), daily: toRows(dailyTotals) };
}

export type DistributionRow = {
  label: string;
  currencyCode: string;
  monthlyEquivalentMinorUnits: number;
};

/** Active SIPs' monthly-equivalent commitment grouped by platform (investment_accounts.name) — "platform distribution" view. */
export async function getPlatformDistribution(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<DistributionRow[]> {
  const rows = unwrapList(
    await supabase
      .from("investment_sips")
      .select(
        "contribution_amount_minor_units, currency_code, frequency, interval_count, investment_holdings(investment_accounts(name))",
      )
      .eq("household_id", householdId)
      .eq("status", "active"),
  ) as unknown as {
    contribution_amount_minor_units: number;
    currency_code: string;
    frequency: string;
    interval_count: number;
    investment_holdings: {
      investment_accounts: { name: string } | null;
    } | null;
  }[];

  const totals = new Map<string, number>();
  for (const row of rows) {
    const platformName =
      row.investment_holdings?.investment_accounts?.name ?? "Unknown platform";
    const key = `${platformName}::${row.currency_code}`;
    const monthly = computeMonthlyEquivalent(
      row.contribution_amount_minor_units,
      row.frequency,
      row.interval_count,
    );
    totals.set(key, (totals.get(key) ?? 0) + monthly);
  }

  return Array.from(totals.entries())
    .map(([key, monthlyEquivalentMinorUnits]) => {
      const [label, currencyCode] = key.split("::") as [string, string];
      return { label, currencyCode, monthlyEquivalentMinorUnits };
    })
    .sort(
      (a, b) => b.monthlyEquivalentMinorUnits - a.monthlyEquivalentMinorUnits,
    );
}

/** Active SIPs' monthly-equivalent commitment grouped by asset class — "asset-class distribution" view. */
export async function getAssetClassDistribution(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<DistributionRow[]> {
  const rows = unwrapList(
    await supabase
      .from("investment_sips")
      .select(
        "contribution_amount_minor_units, currency_code, frequency, interval_count, investment_holdings(investment_assets(asset_class))",
      )
      .eq("household_id", householdId)
      .eq("status", "active"),
  ) as unknown as {
    contribution_amount_minor_units: number;
    currency_code: string;
    frequency: string;
    interval_count: number;
    investment_holdings: {
      investment_assets: { asset_class: string } | null;
    } | null;
  }[];

  const totals = new Map<string, number>();
  for (const row of rows) {
    const assetClass =
      row.investment_holdings?.investment_assets?.asset_class ?? "other";
    const key = `${assetClass}::${row.currency_code}`;
    const monthly = computeMonthlyEquivalent(
      row.contribution_amount_minor_units,
      row.frequency,
      row.interval_count,
    );
    totals.set(key, (totals.get(key) ?? 0) + monthly);
  }

  return Array.from(totals.entries())
    .map(([key, monthlyEquivalentMinorUnits]) => {
      const [label, currencyCode] = key.split("::") as [string, string];
      return { label, currencyCode, monthlyEquivalentMinorUnits };
    })
    .sort(
      (a, b) => b.monthlyEquivalentMinorUnits - a.monthlyEquivalentMinorUnits,
    );
}

/**
 * Simple option lists for the SIP dialog's asset/platform pickers — there
 * is no dedicated management UI for either table yet (PROMPT 16 was
 * schema-only), so these are intentionally minimal: active rows only, no
 * pagination (bounded to a generous cap, same convention as
 * listAccounts(..., { pageSize: 100 }) elsewhere).
 */
export async function listInvestmentAssetOptions(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<InvestmentAssetRecord[]> {
  return unwrapList(
    await supabase
      .from("investment_assets")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(200),
  );
}

export async function listInvestmentAccountOptions(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<InvestmentAccountRecord[]> {
  return unwrapList(
    await supabase
      .from("investment_accounts")
      .select("*")
      .eq("household_id", householdId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(200),
  );
}
