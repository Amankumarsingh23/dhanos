import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import { toIsoDateString } from "@/lib/dates";
import {
  annualizePremiumMinorUnits,
  computeWaitingPeriodMilestoneDate,
  isRenewalDueSoon,
  type PremiumFrequency,
} from "@/lib/calculations/insurance";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  toPage,
  type Page,
} from "@/lib/queries/pagination";
import { MAX_PAGE_SIZE } from "@/lib/validation/primitives";
import type { InsurancePolicyFilters } from "@/lib/validation/insurance";
import type { Tables } from "@/types/database";

export type InsurancePolicyRecord = Tables<"insurance_policies">;
export type InsurancePremiumTransaction = Tables<"transactions">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawPolicyRow = InsurancePolicyRecord & {
  insurer: { name: string } | null;
  policyholder: { display_name: string } | null;
  nominee: { display_name: string } | null;
  payment_account: { name: string } | null;
};

// previous_policy_id is deliberately NOT embedded here — PostgREST cannot
// resolve a self-referential embed of a table onto itself via an FK hint
// (confirmed against the running local stack: the constraint exists and is
// correctly named, but `insurance_policies!insurance_policies_previous_policy_id_fkey(...)`
// still returns PGRST200 "no matches found," even after a schema-cache
// reload). transaction_categories' own self-referential parent_category_id
// (PROMPT 10) never attempted this either — it fetches flat and builds the
// tree client-side. Fetched separately below, batched, same no-N+1 pattern
// as every other "names for a set of ids" lookup in this codebase.
const POLICY_SELECT = `
  *,
  insurer:institutions!insurance_policies_insurer_institution_id_fkey(name),
  policyholder:people!insurance_policies_policyholder_person_id_fkey(display_name),
  nominee:people!insurance_policies_nominee_person_id_fkey(display_name),
  payment_account:financial_accounts!insurance_policies_payment_account_id_fkey(name)
`;

export type InsurancePolicyRow = InsurancePolicyRecord & {
  insurerName: string;
  policyholderName: string;
  nomineeName: string | null;
  paymentAccountName: string;
  previousPolicyName: string | null;
  insuredPeople: { id: string; displayName: string }[];
  annualPremiumMinorUnits: number;
};

async function fetchInsuredPeopleByPolicy(
  supabase: SupabaseServerClient,
  householdId: string,
  policyIds: string[],
): Promise<Map<string, { id: string; displayName: string }[]>> {
  if (policyIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("insurance_policy_insured_people")
      .select(
        "policy_id, person:people!insurance_policy_insured_people_person_id_fkey(id, display_name)",
      )
      .eq("household_id", householdId)
      .in("policy_id", policyIds),
  ) as unknown as {
    policy_id: string;
    person: { id: string; display_name: string } | null;
  }[];

  const byPolicy = new Map<string, { id: string; displayName: string }[]>();
  for (const row of rows) {
    if (!row.person) continue;
    const list = byPolicy.get(row.policy_id) ?? [];
    list.push({ id: row.person.id, displayName: row.person.display_name });
    byPolicy.set(row.policy_id, list);
  }
  return byPolicy;
}

async function fetchPolicyNamesByIds(
  supabase: SupabaseServerClient,
  householdId: string,
  policyIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(policyIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("insurance_policies")
      .select("id, name")
      .eq("household_id", householdId)
      .in("id", ids),
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}

function mapPolicyRow(
  row: RawPolicyRow,
  insuredPeople: { id: string; displayName: string }[],
  previousPolicyNamesById: Map<string, string>,
): InsurancePolicyRow {
  const { insurer, policyholder, nominee, payment_account, ...rest } = row;

  return {
    ...rest,
    insurerName: insurer?.name ?? "Unknown insurer",
    policyholderName: policyholder?.display_name ?? "Unknown policyholder",
    nomineeName: nominee?.display_name ?? null,
    paymentAccountName: payment_account?.name ?? "Unknown account",
    previousPolicyName: rest.previous_policy_id
      ? (previousPolicyNamesById.get(rest.previous_policy_id) ?? null)
      : null,
    insuredPeople,
    annualPremiumMinorUnits: annualizePremiumMinorUnits(
      rest.premium_amount_minor_units,
      rest.premium_frequency as PremiumFrequency,
    ),
  };
}

/**
 * Lists a household's insurance policies, following the standard query
 * contract: household-scoped, paginated, deterministically ordered,
 * searchable by name. Insured people are fetched for the whole page in one
 * query — never one per policy.
 */
export async function listPolicies(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: InsurancePolicyFilters = {},
  paginationInput: unknown = {},
): Promise<Page<InsurancePolicyRow>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("insurance_policies").select(POLICY_SELECT);
  query = scopeToHousehold(query, householdId);

  if (filters.policyType) {
    query = query.eq("policy_type", filters.policyType);
  }
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
  ) as unknown as RawPolicyRow[];
  const page = toPage(rawRows, pagination);

  const [insuredByPolicy, previousPolicyNamesById] = await Promise.all([
    fetchInsuredPeopleByPolicy(
      supabase,
      householdId,
      page.rows.map((row) => row.id),
    ),
    fetchPolicyNamesByIds(
      supabase,
      householdId,
      page.rows.map((row) => row.previous_policy_id),
    ),
  ]);

  return {
    ...page,
    rows: page.rows.map((row) =>
      mapPolicyRow(
        row,
        insuredByPolicy.get(row.id) ?? [],
        previousPolicyNamesById,
      ),
    ),
  };
}

export type InsurancePolicyDetail = InsurancePolicyRow & {
  premiumPayments: InsurancePremiumTransaction[];
  /** The policy that superseded this one via renewal, if any — null if this is the current period. */
  renewedIntoPolicyId: string | null;
};

export async function getPolicyDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  policyId: string,
): Promise<InsurancePolicyDetail> {
  const raw = unwrapSingle(
    await supabase
      .from("insurance_policies")
      .select(POLICY_SELECT)
      .eq("household_id", householdId)
      .eq("id", policyId)
      .maybeSingle(),
  ) as unknown as RawPolicyRow;

  const insuredByPolicy = await fetchInsuredPeopleByPolicy(
    supabase,
    householdId,
    [policyId],
  );
  const previousPolicyNamesById = await fetchPolicyNamesByIds(
    supabase,
    householdId,
    [raw.previous_policy_id],
  );

  const premiumPayments = unwrapList(
    await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .eq("insurance_policy_id", policyId)
      .order("transaction_date", { ascending: false }),
  );

  const renewedInto = unwrapList(
    await supabase
      .from("insurance_policies")
      .select("id")
      .eq("household_id", householdId)
      .eq("previous_policy_id", policyId)
      .limit(1),
  );

  return {
    ...mapPolicyRow(
      raw,
      insuredByPolicy.get(policyId) ?? [],
      previousPolicyNamesById,
    ),
    premiumPayments,
    renewedIntoPolicyId: renewedInto[0]?.id ?? null,
  };
}

export type WaitingPeriodRecord = Tables<"insurance_policy_waiting_periods">;

export type WaitingPeriodRow = WaitingPeriodRecord & {
  milestoneDate: string;
};

/** A policy's structured waiting periods, each with its milestone date (starts_from + duration_months) computed fresh — never stored. See src/lib/calculations/insurance.ts. */
export async function listWaitingPeriodsForPolicy(
  supabase: SupabaseServerClient,
  householdId: string,
  policyId: string,
): Promise<WaitingPeriodRow[]> {
  const rows = unwrapList(
    await supabase
      .from("insurance_policy_waiting_periods")
      .select("*")
      .eq("household_id", householdId)
      .eq("policy_id", policyId)
      .order("starts_from", { ascending: true })
      .order("id", { ascending: true }),
  );

  return rows.map((row) => ({
    ...row,
    milestoneDate: computeWaitingPeriodMilestoneDate(
      row.starts_from,
      row.duration_months,
    ),
  }));
}

/** Every household's structured waiting periods, across every policy — for the dashboard's "waiting-period milestones" view. */
export async function listAllWaitingPeriods(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<(WaitingPeriodRow & { policyId: string; policyName: string })[]> {
  const rows = unwrapList(
    await supabase
      .from("insurance_policy_waiting_periods")
      .select(
        "*, policy:insurance_policies!insurance_policy_waiting_periods_policy_id_fkey(name)",
      )
      .eq("household_id", householdId)
      .order("starts_from", { ascending: true }),
  ) as unknown as (WaitingPeriodRecord & { policy: { name: string } | null })[];

  return rows.map((row) => {
    const { policy, ...rest } = row;
    return {
      ...rest,
      policyId: rest.policy_id,
      policyName: policy?.name ?? "Unknown policy",
      milestoneDate: computeWaitingPeriodMilestoneDate(
        rest.starts_from,
        rest.duration_months,
      ),
    };
  });
}

export type InsuranceOverview = {
  currencyCode: string;
  totalAnnualPremiumMinorUnits: number;
  activePolicyCount: number;
  dueSoon: InsurancePolicyRow[];
};

/**
 * The combined fetch behind the insurance overview: every active policy's
 * annualized premium summed for a "total yearly premium commitment"
 * figure, plus which policies are due for renewal soon — purely advisory,
 * computed fresh from the stored renewal/expiry date (see
 * src/lib/calculations/insurance.ts's isRenewalDueSoon), never a stored
 * flag or a claim about the policy's actual legal status.
 */
export async function getInsuranceOverview(
  supabase: SupabaseServerClient,
  householdId: string,
  currencyCode: string,
  asOfDate: string = toIsoDateString(new Date()),
): Promise<InsuranceOverview> {
  const policiesPage = await listPolicies(
    supabase,
    householdId,
    { status: "active" },
    { pageSize: MAX_PAGE_SIZE },
  );
  const inCurrency = policiesPage.rows.filter(
    (policy) => policy.currency_code === currencyCode,
  );

  const totalAnnualPremiumMinorUnits = inCurrency.reduce(
    (sum, policy) => sum + policy.annualPremiumMinorUnits,
    0,
  );

  const dueSoon = inCurrency
    .filter((policy) =>
      isRenewalDueSoon(
        { renewalOrExpiryDate: policy.renewal_date ?? policy.expiry_date },
        asOfDate,
      ),
    )
    .sort((a, b) => {
      const aDate = a.renewal_date ?? a.expiry_date ?? "";
      const bDate = b.renewal_date ?? b.expiry_date ?? "";
      return aDate.localeCompare(bDate);
    });

  return {
    currencyCode,
    totalAnnualPremiumMinorUnits,
    activePolicyCount: inCurrency.length,
    dueSoon,
  };
}
