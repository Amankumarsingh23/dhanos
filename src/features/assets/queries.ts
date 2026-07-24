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
import {
  computeNetWorthContributionMinorUnits,
  computeOwnedValueMinorUnits,
  isOwnershipUncertain,
  type OwnershipStatus as CalcOwnershipStatus,
} from "@/lib/calculations/assets";
import {
  computeLoanOutstanding,
  selectEffectivePayments,
} from "@/lib/calculations/loan-outstanding";
import type { AssetFilters, AssetGroup } from "@/lib/validation/assets";
import type { Tables } from "@/types/database";

/**
 * Data access for the asset register (PROMPT 27). "Asset values use
 * snapshots": every read here resolves an asset's current value from its
 * latest asset_valuation_snapshots row — never a column on assets itself.
 * "Attached debt remains separate": a related loan's outstanding is
 * computed independently, via the same loan-outstanding.ts pipeline the
 * debt dashboard uses, and returned as its own field, never netted into
 * any asset-value figure.
 */

export type AssetRecord = Tables<"assets">;
export type AssetValuationSnapshotRecord = Tables<"asset_valuation_snapshots">;
export type AssetDocumentRecord = Tables<"attachments">;
export type AssetIncomeTransaction = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawAssetRow = AssetRecord & {
  owner: { display_name: string } | null;
  related_loan: { name: string } | null;
};

const ASSET_JOINS_SELECT = `
  owner:people!assets_owner_person_id_fkey(display_name),
  related_loan:loans!assets_related_loan_id_fkey(name)
`;

/**
 * Explicit column list, deliberately excluding `location_precise` — the
 * list-page query must never fetch the full/precise address at all
 * (PROMPT 28: "do not store precise location publicly"). This isn't just
 * a display choice: a Server Component's fetched row is serialized into
 * the page's RSC payload regardless of whether the client component
 * actually renders every field, so the only real guarantee is never
 * selecting the column in the first place — same shape as People's
 * birth_date/notes staying out of the list query entirely.
 */
const ASSET_LIST_SELECT = `
  id, household_id, name, asset_group, category, owner_person_id, ownership_percentage,
  ownership_status, acquisition_type, acquisition_date, acquisition_value_minor_units,
  currency_code, location, condition, generates_income, income_notes, related_loan_id,
  include_in_net_worth, liquidity_classification, notes, created_by, created_at, updated_at,
  property_type, land_area, area_unit, ownership_share_notes, title_status, mutation_status,
  original_owner, legal_heir_notes, rental_status, occupancy, encumbrance_status,
  encumbrance_notes, dispute_status, registration_details,
  ${ASSET_JOINS_SELECT}
`;

/** Full row, including location_precise — only ever used by getAssetDetail (one record, its own page, never listed). */
const ASSET_DETAIL_SELECT = `*, ${ASSET_JOINS_SELECT}`;

/** The list-safe asset shape — structurally excludes location_precise, matching what ASSET_LIST_SELECT actually fetches. */
export type AssetRow = Omit<AssetRecord, "location_precise"> & {
  ownerName: string;
  relatedLoanName: string | null;
  latestValueMinorUnits: number | null;
  latestValuationDate: string | null;
  ownedValueMinorUnits: number | null;
  netWorthContributionMinorUnits: number;
  documentCount: number;
};

type LatestValuation = { valueMinorUnits: number; asOfDate: string };

/** Batched, no-N+1 latest valuation per asset — one query for the whole page, same pattern as fetchInsuredPeopleByPolicy. */
async function fetchLatestValuationsByAsset(
  supabase: SupabaseServerClient,
  householdId: string,
  assetIds: string[],
): Promise<Map<string, LatestValuation>> {
  if (assetIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("asset_valuation_snapshots")
      .select("asset_id, as_of_date, value_minor_units")
      .eq("household_id", householdId)
      .in("asset_id", assetIds)
      .order("as_of_date", { ascending: false })
      .order("id", { ascending: false }),
  );

  const byAsset = new Map<string, LatestValuation>();
  for (const row of rows) {
    if (!byAsset.has(row.asset_id)) {
      byAsset.set(row.asset_id, {
        valueMinorUnits: row.value_minor_units,
        asOfDate: row.as_of_date,
      });
    }
  }
  return byAsset;
}

/** Batched, no-N+1 document count per asset — same pattern as fetchDocumentCountsByClaim. */
export async function fetchDocumentCountsByAsset(
  supabase: SupabaseServerClient,
  householdId: string,
  assetIds: string[],
): Promise<Map<string, number>> {
  if (assetIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("attachments")
      .select("attachable_id")
      .eq("household_id", householdId)
      .eq("attachable_type", "asset")
      .in("attachable_id", assetIds),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.attachable_id, (counts.get(row.attachable_id) ?? 0) + 1);
  }
  return counts;
}

function mapAssetRow(
  row: RawAssetRow,
  latestValuation: LatestValuation | undefined,
  documentCount: number,
): AssetRow {
  // location_precise is always stripped here, regardless of which select
  // produced `row` — a list-context row never had it selected in the
  // first place (it'll just be undefined), and a detail-context row has
  // it re-attached explicitly by getAssetDetail as `locationPrecise`,
  // never left on the generic AssetRow shape. See ASSET_LIST_SELECT above.
  const {
    owner,
    related_loan,
    location_precise: _locationPrecise,
    ...rest
  } = row;
  const latestValueMinorUnits = latestValuation?.valueMinorUnits ?? null;

  return {
    ...rest,
    ownerName: owner?.display_name ?? "Unknown owner",
    relatedLoanName: related_loan?.name ?? null,
    latestValueMinorUnits,
    latestValuationDate: latestValuation?.asOfDate ?? null,
    ownedValueMinorUnits:
      latestValueMinorUnits !== null
        ? computeOwnedValueMinorUnits(
            latestValueMinorUnits,
            rest.ownership_percentage,
          )
        : null,
    netWorthContributionMinorUnits:
      latestValueMinorUnits !== null
        ? computeNetWorthContributionMinorUnits({
            valueMinorUnits: latestValueMinorUnits,
            ownershipPercentage: rest.ownership_percentage,
            ownershipStatus: rest.ownership_status as CalcOwnershipStatus,
            includeInNetWorth: rest.include_in_net_worth,
          })
        : 0,
    documentCount,
  };
}

/**
 * Lists a household's assets, following the standard query contract:
 * household-scoped, paginated, deterministically ordered, searchable by
 * name. Latest valuations and document counts are fetched for the whole
 * page in one query each — never one per row.
 */
export async function listAssets(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: AssetFilters = {},
  paginationInput: unknown = {},
): Promise<Page<AssetRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("assets").select(ASSET_LIST_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.assetGroup) {
    query = query.eq("asset_group", filters.assetGroup);
  }
  if (filters.ownershipStatus) {
    query = query.eq("ownership_status", filters.ownershipStatus);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "name", "asc");

  const rawRows = unwrapList(
    await query.range(from, to),
  ) as unknown as RawAssetRow[];
  const page = toPage(rawRows, pagination);

  const [latestValuations, documentCounts] = await Promise.all([
    fetchLatestValuationsByAsset(
      supabase,
      householdId,
      page.rows.map((row) => row.id),
    ),
    fetchDocumentCountsByAsset(
      supabase,
      householdId,
      page.rows.map((row) => row.id),
    ),
  ]);

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapAssetRow(
        row,
        latestValuations.get(row.id),
        documentCounts.get(row.id) ?? 0,
      ),
    ),
  };
}

export type AssetDetail = AssetRow & {
  /** The full/precise address — only ever present on this single-record detail fetch, never on a list row. See ASSET_LIST_SELECT. */
  locationPrecise: string | null;
  valuationHistory: AssetValuationSnapshotRecord[];
  relatedLoanOutstandingMinorUnits: number | null;
  relatedLoanCurrencyCode: string | null;
};

export async function getAssetDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  assetId: string,
): Promise<AssetDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("assets")
      .select(ASSET_DETAIL_SELECT)
      .eq("household_id", householdId)
      .eq("id", assetId)
      .maybeSingle(),
  ) as unknown as RawAssetRow;

  const valuationHistory = unwrapList(
    await supabase
      .from("asset_valuation_snapshots")
      .select("*")
      .eq("household_id", householdId)
      .eq("asset_id", assetId)
      .order("as_of_date", { ascending: false })
      .order("created_at", { ascending: false }),
  );

  const documentCounts = await fetchDocumentCountsByAsset(
    supabase,
    householdId,
    [assetId],
  );

  const latestValuation = valuationHistory[0]
    ? {
        valueMinorUnits: valuationHistory[0].value_minor_units,
        asOfDate: valuationHistory[0].as_of_date,
      }
    : undefined;

  let relatedLoanOutstandingMinorUnits: number | null = null;
  let relatedLoanCurrencyCode: string | null = null;
  if (raw.related_loan_id) {
    const loanResponse = await supabase
      .from("loans")
      .select("disbursed_amount_minor_units, currency_code")
      .eq("id", raw.related_loan_id)
      .eq("household_id", householdId)
      .maybeSingle();
    if (loanResponse.data) {
      relatedLoanCurrencyCode = loanResponse.data.currency_code;
      const payments = unwrapList(
        await supabase
          .from("loan_payments")
          .select(
            "id, reverses_payment_id, principal_component_minor_units, overpayment_amount_minor_units",
          )
          .eq("household_id", householdId)
          .eq("loan_id", raw.related_loan_id),
      );
      const effective = selectEffectivePayments(
        payments.map((p) => ({
          id: p.id,
          reversesPaymentId: p.reverses_payment_id,
          principalComponentMinorUnits: p.principal_component_minor_units,
          overpaymentAmountMinorUnits: p.overpayment_amount_minor_units,
        })),
      );
      relatedLoanOutstandingMinorUnits = computeLoanOutstanding(
        loanResponse.data.disbursed_amount_minor_units,
        effective,
      ).outstandingMinorUnits;
    }
  }

  return {
    ...mapAssetRow(raw, latestValuation, documentCounts.get(assetId) ?? 0),
    locationPrecise: raw.location_precise,
    valuationHistory,
    relatedLoanOutstandingMinorUnits,
    relatedLoanCurrencyCode,
  };
}

/** Every asset-generated income transaction (rentals, etc.) — PROMPT 28: "income generated links to cash flow." Reads kind = 'income' rows tagged with this asset, never a free-text figure. */
export async function listAssetIncomeTransactions(
  supabase: SupabaseServerClient,
  householdId: string,
  assetId: string,
): Promise<AssetIncomeTransaction[]> {
  return unwrapList(
    await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .eq("asset_id", assetId)
      .eq("kind", "income")
      .order("transaction_date", { ascending: false }),
  );
}

export async function listAssetDocuments(
  supabase: SupabaseServerClient,
  householdId: string,
  assetId: string,
): Promise<AssetDocumentRecord[]> {
  return unwrapList(
    await supabase
      .from("attachments")
      .select("*")
      .eq("household_id", householdId)
      .eq("attachable_type", "asset")
      .eq("attachable_id", assetId)
      .order("created_at", { ascending: false }),
  );
}

export type AssetsOverview = {
  currencyCode: string;
  assetCount: number;
  totalNetWorthContributionMinorUnits: number;
  /** Owned value of assets excluded from net worth solely for having disputed/expected ownership — informational only, never blended into the total above. */
  totalUncertainOwnedValueMinorUnits: number;
  byGroupMinorUnits: Record<AssetGroup, number>;
  assetsWithoutValuation: number;
};

/**
 * The combined fetch behind the assets overview: net-worth-eligible total
 * (see computeNetWorthContributionMinorUnits — already excludes disputed/
 * expected and opted-out assets), kept strictly separate from the owned
 * value of assets excluded specifically for uncertain ownership, so the
 * two are never accidentally summed together. Scoped to one currency at a
 * time, never blended, same convention as every other cross-record total
 * in this codebase.
 */
export async function getAssetsOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
): Promise<AssetsOverview> {
  const assetsPage = await listAssets(
    supabase,
    householdId,
    {},
    { pageSize: MAX_PAGE_SIZE },
  );
  const inCurrency = assetsPage.rows.filter(
    (asset) => asset.currency_code === currencyCode,
  );

  const totalNetWorthContributionMinorUnits = inCurrency.reduce(
    (sum, asset) => sum + asset.netWorthContributionMinorUnits,
    0,
  );

  const totalUncertainOwnedValueMinorUnits = inCurrency
    .filter(
      (asset) =>
        asset.include_in_net_worth &&
        isOwnershipUncertain(asset.ownership_status as CalcOwnershipStatus) &&
        asset.ownedValueMinorUnits !== null,
    )
    .reduce((sum, asset) => sum + (asset.ownedValueMinorUnits ?? 0), 0);

  const byGroupMinorUnits: Record<AssetGroup, number> = {
    movable: 0,
    immovable: 0,
    business: 0,
  };
  for (const asset of inCurrency) {
    byGroupMinorUnits[asset.asset_group as AssetGroup] +=
      asset.netWorthContributionMinorUnits;
  }

  const assetsWithoutValuation = inCurrency.filter(
    (asset) => asset.latestValueMinorUnits === null,
  ).length;

  return {
    currencyCode,
    assetCount: inCurrency.length,
    totalNetWorthContributionMinorUnits,
    totalUncertainOwnedValueMinorUnits,
    byGroupMinorUnits,
    assetsWithoutValuation,
  };
}
