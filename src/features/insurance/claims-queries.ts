import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import type { InsuranceClaimFilters } from "@/lib/validation/insurance";
import type { Tables } from "@/types/database";

/**
 * Data access for insurance claims (PROMPT 26). Deliberately kept unpaged —
 * a policy's own claim history and a household's total claim count are both
 * small, bounded lists (unlike transactions), same "fetch the whole set"
 * convention loan_payments/lending_repayments already use per-loan/lending.
 */

export type InsuranceClaimRecord = Tables<"insurance_claims">;
export type ClaimDocumentRecord = Tables<"attachments">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawClaimRow = InsuranceClaimRecord & {
  insured_person: { display_name: string } | null;
  policy: { name: string; policy_type: string } | null;
};

const CLAIM_SELECT = `
  *,
  insured_person:people!insurance_claims_insured_person_id_fkey(display_name),
  policy:insurance_policies!insurance_claims_policy_id_fkey(name, policy_type)
`;

export type InsuranceClaimRow = InsuranceClaimRecord & {
  insuredPersonName: string;
  policyName: string;
  policyType: string;
  documentCount: number;
};

/** Batched, no-N+1 document count per claim — same pattern as fetchInsuredPeopleByPolicy in queries.ts. */
export async function fetchDocumentCountsByClaim(
  supabase: SupabaseServerClient,
  householdId: string,
  claimIds: string[],
): Promise<Map<string, number>> {
  if (claimIds.length === 0) {
    return new Map();
  }
  const rows = unwrapList(
    await supabase
      .from("attachments")
      .select("attachable_id")
      .eq("household_id", householdId)
      .eq("attachable_type", "insurance_claim")
      .in("attachable_id", claimIds),
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.attachable_id, (counts.get(row.attachable_id) ?? 0) + 1);
  }
  return counts;
}

function mapClaimRow(
  row: RawClaimRow,
  documentCount: number,
): InsuranceClaimRow {
  const { insured_person, policy, ...rest } = row;
  return {
    ...rest,
    insuredPersonName: insured_person?.display_name ?? "Unknown person",
    policyName: policy?.name ?? "Unknown policy",
    policyType: policy?.policy_type ?? "other",
    documentCount,
  };
}

export async function listClaimsForPolicy(
  supabase: SupabaseServerClient,
  householdId: string,
  policyId: string,
): Promise<InsuranceClaimRow[]> {
  const rawRows = unwrapList(
    await supabase
      .from("insurance_claims")
      .select(CLAIM_SELECT)
      .eq("household_id", householdId)
      .eq("policy_id", policyId)
      .order("claim_date", { ascending: false })
      .order("id", { ascending: true }),
  ) as unknown as RawClaimRow[];

  const documentCounts = await fetchDocumentCountsByClaim(
    supabase,
    householdId,
    rawRows.map((row) => row.id),
  );

  return rawRows.map((row) =>
    mapClaimRow(row, documentCounts.get(row.id) ?? 0),
  );
}

/** Every claim in the household, across every policy — for the dashboard's cross-policy views (e.g. missing documents). */
export async function listAllClaims(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: InsuranceClaimFilters = {},
): Promise<InsuranceClaimRow[]> {
  let query = supabase
    .from("insurance_claims")
    .select(CLAIM_SELECT)
    .eq("household_id", householdId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  query = query
    .order("claim_date", { ascending: false })
    .order("id", { ascending: true });

  const rawRows = unwrapList(await query) as unknown as RawClaimRow[];

  const documentCounts = await fetchDocumentCountsByClaim(
    supabase,
    householdId,
    rawRows.map((row) => row.id),
  );

  return rawRows.map((row) =>
    mapClaimRow(row, documentCounts.get(row.id) ?? 0),
  );
}

export async function listClaimDocuments(
  supabase: SupabaseServerClient,
  householdId: string,
  claimId: string,
): Promise<ClaimDocumentRecord[]> {
  return unwrapList(
    await supabase
      .from("attachments")
      .select("*")
      .eq("household_id", householdId)
      .eq("attachable_type", "insurance_claim")
      .eq("attachable_id", claimId)
      .order("created_at", { ascending: false }),
  );
}
