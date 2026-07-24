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
import { resolveAmountForDate } from "@/lib/calculations/recurring-schedule";
import {
  annualizeDrainCostMinorUnits,
  computeDrainTotals,
  computeMonthlyEquivalentDrainCostMinorUnits,
  isHighCostLowUse,
  isMaintenanceHeavyType,
  isRenewalUpcoming,
  isUnusedDrain,
  type DrainTotals,
} from "@/lib/calculations/money-drains";
import { toIsoDateString } from "@/lib/dates";
import type {
  DrainCostFrequency,
  DrainType,
  DrainUsageFrequency,
  MoneyDrainFilters,
} from "@/lib/validation/money-drains";
import type { Tables } from "@/types/database";

/**
 * Data access for the money drains register (PROMPT 29). This module never
 * writes its own transactions — "recurring expenses remain connected to
 * transactions" (acceptance criterion) means a drain linked to a real
 * `recurring_rules` row (`linked_recurring_rule_id`) has its *actual*
 * current amount resolved here (same resolveAmountForDate pipeline the
 * Recurring feature itself uses) and returned alongside — never blended
 * into — the household's own entered `cost_amount_minor_units` estimate,
 * so a drift between "what you told us" and "what the ledger actually
 * shows" stays visible rather than silently reconciled.
 */

export type MoneyDrainRecord = Tables<"money_drains">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawMoneyDrainRow = MoneyDrainRecord & {
  linked_account: { name: string } | null;
  linked_asset: { name: string } | null;
  linked_recurring_rule: {
    id: string;
    name: string;
    amount_minor_units: number;
    next_due_date: string | null;
  } | null;
};

const MONEY_DRAIN_SELECT = `
  *,
  linked_account:financial_accounts!money_drains_linked_account_id_fkey(name),
  linked_asset:assets!money_drains_linked_asset_id_fkey(name),
  linked_recurring_rule:recurring_rules!money_drains_linked_recurring_rule_id_fkey(id, name, amount_minor_units, next_due_date)
`;

export type MoneyDrainRow = MoneyDrainRecord & {
  linkedAccountName: string | null;
  linkedAssetName: string | null;
  linkedRecurringRuleName: string | null;
  /** The linked recurring rule's real, schedule-resolved current amount — present only when linked_recurring_rule_id is set. This is what's actually reflected in generated transactions, kept visibly separate from cost_amount_minor_units. */
  linkedRecurringRuleCurrentAmountMinorUnits: number | null;
  monthlyEquivalentMinorUnits: number | null;
  annualizedCostMinorUnits: number | null;
  isUnused: boolean;
  isRenewalUpcoming: boolean;
  isMaintenanceHeavy: boolean;
};

/** Batched, no-N+1 amount-schedule lookup for every linked recurring rule on a page — mirrors src/features/recurring/queries.ts's fetchAmountSchedules. */
async function fetchLinkedRuleAmountSchedules(
  supabase: SupabaseServerClient,
  householdId: string,
  recurringRuleIds: string[],
): Promise<Map<string, { effectiveDate: string; amountMinorUnits: number }[]>> {
  if (recurringRuleIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("recurring_rule_amount_schedules")
      .select("recurring_rule_id, effective_date, amount_minor_units")
      .eq("household_id", householdId)
      .in("recurring_rule_id", recurringRuleIds),
  );
  const bySchedule = new Map<
    string,
    { effectiveDate: string; amountMinorUnits: number }[]
  >();
  for (const row of rows) {
    const list = bySchedule.get(row.recurring_rule_id) ?? [];
    list.push({
      effectiveDate: row.effective_date,
      amountMinorUnits: row.amount_minor_units,
    });
    bySchedule.set(row.recurring_rule_id, list);
  }
  return bySchedule;
}

function mapMoneyDrainRow(
  row: RawMoneyDrainRow,
  amountSchedule: { effectiveDate: string; amountMinorUnits: number }[],
  asOfDate: string,
  upcomingRenewalDays: number,
): MoneyDrainRow {
  const { linked_account, linked_asset, linked_recurring_rule, ...rest } = row;

  const linkedRecurringRuleCurrentAmountMinorUnits = linked_recurring_rule
    ? resolveAmountForDate(
        linked_recurring_rule.amount_minor_units,
        amountSchedule,
        linked_recurring_rule.next_due_date ?? asOfDate,
      )
    : null;

  return {
    ...rest,
    linkedAccountName: linked_account?.name ?? null,
    linkedAssetName: linked_asset?.name ?? null,
    linkedRecurringRuleName: linked_recurring_rule?.name ?? null,
    linkedRecurringRuleCurrentAmountMinorUnits,
    monthlyEquivalentMinorUnits: computeMonthlyEquivalentDrainCostMinorUnits(
      rest.cost_amount_minor_units,
      rest.cost_frequency as DrainCostFrequency,
    ),
    annualizedCostMinorUnits: annualizeDrainCostMinorUnits(
      rest.cost_amount_minor_units,
      rest.cost_frequency as DrainCostFrequency,
    ),
    isUnused: isUnusedDrain(rest.usage_frequency as DrainUsageFrequency),
    isRenewalUpcoming: isRenewalUpcoming(
      rest.next_renewal_date,
      asOfDate,
      upcomingRenewalDays,
    ),
    isMaintenanceHeavy: isMaintenanceHeavyType(rest.drain_type as DrainType),
  };
}

/**
 * Lists a household's money drains, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * item name. Linked account/asset/recurring-rule names and the recurring
 * rule's resolved current amount are all fetched for the whole page in a
 * fixed number of queries — never one per row.
 */
export async function listMoneyDrains(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: MoneyDrainFilters = {},
  paginationInput: unknown = {},
  asOfDate: string = toIsoDateString(new Date()),
  upcomingRenewalDays = 30,
): Promise<Page<MoneyDrainRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("money_drains").select(MONEY_DRAIN_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.drainType) {
    query = query.eq("drain_type", filters.drainType);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.usageFrequency) {
    query = query.eq("usage_frequency", filters.usageFrequency);
  }
  if (filters.isEssential !== undefined) {
    query = query.eq("is_essential", filters.isEssential);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("item", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "item", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawMoneyDrainRow[];
  const page = toPage(rawRows, pagination);

  const ruleIds = page.rows
    .map((row) => row.linked_recurring_rule?.id)
    .filter((id): id is string => Boolean(id));
  const amountSchedules = await fetchLinkedRuleAmountSchedules(
    supabase,
    householdId,
    ruleIds,
  );

  const rows = page.rows.map((row) =>
    mapMoneyDrainRow(
      row,
      row.linked_recurring_rule
        ? (amountSchedules.get(row.linked_recurring_rule.id) ?? [])
        : [],
      asOfDate,
      upcomingRenewalDays,
    ),
  );

  return { ...page, rows };
}

export type MoneyDrainDetail = MoneyDrainRow & {
  linkedAssetLatestValueMinorUnits: number | null;
  linkedAssetLatestValuationDate: string | null;
};

export async function getMoneyDrainDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  moneyDrainId: string,
  asOfDate: string = toIsoDateString(new Date()),
  upcomingRenewalDays = 30,
): Promise<MoneyDrainDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("money_drains")
      .select(MONEY_DRAIN_SELECT)
      .eq("household_id", householdId)
      .eq("id", moneyDrainId)
      .maybeSingle(),
  ) as unknown as RawMoneyDrainRow;

  const amountSchedule = raw.linked_recurring_rule
    ? unwrapList(
        await supabase
          .from("recurring_rule_amount_schedules")
          .select("effective_date, amount_minor_units")
          .eq("household_id", householdId)
          .eq("recurring_rule_id", raw.linked_recurring_rule.id),
      ).map((s) => ({
        effectiveDate: s.effective_date,
        amountMinorUnits: s.amount_minor_units,
      }))
    : [];

  let linkedAssetLatestValueMinorUnits: number | null = null;
  let linkedAssetLatestValuationDate: string | null = null;
  if (raw.linked_asset_id) {
    const snapshot = unwrapList(
      await supabase
        .from("asset_valuation_snapshots")
        .select("value_minor_units, as_of_date")
        .eq("household_id", householdId)
        .eq("asset_id", raw.linked_asset_id)
        .order("as_of_date", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
    )[0];
    if (snapshot) {
      linkedAssetLatestValueMinorUnits = snapshot.value_minor_units;
      linkedAssetLatestValuationDate = snapshot.as_of_date;
    }
  }

  return {
    ...mapMoneyDrainRow(raw, amountSchedule, asOfDate, upcomingRenewalDays),
    linkedAssetLatestValueMinorUnits,
    linkedAssetLatestValuationDate,
  };
}

export type MoneyDrainsOverview = {
  currencyCode: string;
  drainCount: number;
  totals: DrainTotals;
  /** Never/rarely used items, in a currency-scoped, active-only view — never a directive to cancel, just a fact. */
  unused: MoneyDrainRow[];
  /** High-cost items (at or above the household's own average monthly drain cost) that are also low-use. */
  highCostLowUse: MoneyDrainRow[];
  upcomingRenewals: MoneyDrainRow[];
  maintenanceHeavy: MoneyDrainRow[];
  /** Items linked to a depreciating asset, alongside that asset's own latest tracked value — never a fabricated depreciation rate, just the two real figures side by side. */
  depreciatingAssetLinked: MoneyDrainRow[];
};

/**
 * The combined fetch behind the money-drains overview page. Every figure
 * here is either a real entered cost normalized onto one cadence
 * (see src/lib/calculations/money-drains.ts) or a plain filter over real
 * rows — nothing is projected or inferred beyond what's explicitly stored,
 * satisfying PROMPT 29's "analysis is factual and explainable." Scoped to
 * one currency and to active drains only (a paused/cancelled item's
 * historical cost stays visible on its own detail page, but never inflates
 * a "what am I currently spending" total).
 */
export async function getMoneyDrainsOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
  upcomingRenewalDays = 30,
): Promise<MoneyDrainsOverview> {
  const page = await listMoneyDrains(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: MAX_PAGE_SIZE },
    asOfDate,
    upcomingRenewalDays,
  );
  const inCurrency = page.rows.filter(
    (row) => row.currency_code === currencyCode,
  );

  const totals = computeDrainTotals(
    inCurrency.map((row) => ({
      drainType: row.drain_type as DrainType,
      costFrequency: row.cost_frequency as DrainCostFrequency,
      costAmountMinorUnits: row.cost_amount_minor_units,
      isEssential: row.is_essential,
    })),
  );

  const annualizableCount = inCurrency.length - totals.irregularCostCount;
  const averageMonthlyMinorUnits =
    annualizableCount > 0
      ? Math.round(totals.totalMonthlyMinorUnits / annualizableCount)
      : 0;

  const unused = inCurrency.filter((row) => row.isUnused);
  const highCostLowUse = inCurrency.filter((row) =>
    isHighCostLowUse(
      row.monthlyEquivalentMinorUnits,
      row.usage_frequency as DrainUsageFrequency,
      averageMonthlyMinorUnits,
    ),
  );
  const upcomingRenewals = inCurrency.filter((row) => row.isRenewalUpcoming);
  const maintenanceHeavy = inCurrency.filter((row) => row.isMaintenanceHeavy);
  const depreciatingAssetLinked = inCurrency.filter(
    (row) => row.linked_asset_id !== null,
  );

  return {
    currencyCode,
    drainCount: inCurrency.length,
    totals,
    unused,
    highCostLowUse,
    upcomingRenewals,
    maintenanceHeavy,
    depreciatingAssetLinked,
  };
}
