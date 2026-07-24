import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import type { DecisionEntityType } from "@/lib/validation/decisions";
import type { SelectOption } from "./decision-dialog";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const OPTION_LIMIT = 200;

/** The "related record" option lists for every linkable entity type, one query each — feeds the decision dialog's dynamic entity-id select. */
export async function fetchDecisionEntityOptions(
  supabase: SupabaseServerClient,
  householdId: string,
): Promise<Record<DecisionEntityType, SelectOption[]>> {
  const [accounts, sips, loans, lendings, assets, goals, policies] =
    await Promise.all([
      unwrapList(
        await supabase
          .from("financial_accounts")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("investment_sips")
          .select("id, investment_holdings(investment_assets(name))")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("loans")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("lendings")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("assets")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("goals")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
      unwrapList(
        await supabase
          .from("insurance_policies")
          .select("id, name")
          .eq("household_id", householdId)
          .limit(OPTION_LIMIT),
      ),
    ]);

  return {
    financial_account: accounts.map((a) => ({ id: a.id, label: a.name })),
    investment_sip: (
      sips as unknown as {
        id: string;
        investment_holdings: { investment_assets: { name: string } | null } | null;
      }[]
    ).map((s) => ({
      id: s.id,
      label: s.investment_holdings?.investment_assets?.name ?? "SIP",
    })),
    loan: loans.map((l) => ({ id: l.id, label: l.name })),
    lending: lendings.map((l) => ({ id: l.id, label: l.name })),
    asset: assets.map((a) => ({ id: a.id, label: a.name })),
    goal: goals.map((g) => ({ id: g.id, label: g.name })),
    insurance_policy: policies.map((p) => ({ id: p.id, label: p.name })),
  };
}
