import type { createClient } from "@/lib/supabase/server";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  applyDeterministicOrder,
  parsePagination,
  scopeToHousehold,
  toOverfetchRange,
  type Page,
} from "@/lib/queries/pagination";
import type { DecisionFilters } from "@/lib/validation/decisions";
import type { Tables } from "@/types/database";

/**
 * Data access for the financial decision journal (PROMPT 37). Every
 * write-once field on a `decision_journal_entries` row is exactly what was
 * recorded at creation — see the migration's
 * enforce_decision_journal_immutability trigger — so a list/detail read
 * here never needs to reconcile "current" vs "original" values the way,
 * say, an editable asset would.
 */

export type DecisionRecord = Tables<"decision_journal_entries">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function listDecisions(
  supabase: SupabaseServerClient,
  householdId: string,
  filters: DecisionFilters = {},
  paginationInput: unknown = {},
): Promise<Page<DecisionRecord>> {
  const pagination = parsePagination(paginationInput);
  const [from, to] = toOverfetchRange(pagination);

  let query = supabase.from("decision_journal_entries").select("*");
  query = scopeToHousehold(query, householdId);

  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("title", `%${search}%`);
  }

  query = applyDeterministicOrder(query, "decision_date", "desc");

  const rows = unwrapList(await query.range(from, to));
  const hasMore = rows.length > pagination.pageSize;
  return {
    rows: hasMore ? rows.slice(0, pagination.pageSize) : rows,
    page: pagination.page,
    pageSize: pagination.pageSize,
    hasMore,
  };
}

export type DecisionDetail = DecisionRecord & {
  /** The newer entry that superseded this one, if any — resolved the "other direction" from supersedes_entry_id, since a row never stores a forward pointer to what replaced it. */
  supersededByEntryId: string | null;
};

export async function getDecisionDetail(
  supabase: SupabaseServerClient,
  householdId: string,
  decisionId: string,
): Promise<DecisionDetail> {
  const entry = unwrapSingle(
    await supabase
      .from("decision_journal_entries")
      .select("*")
      .eq("household_id", householdId)
      .eq("id", decisionId)
      .maybeSingle(),
  ) as DecisionRecord;

  const supersededByResponse = await supabase
    .from("decision_journal_entries")
    .select("id")
    .eq("household_id", householdId)
    .eq("supersedes_entry_id", decisionId)
    .maybeSingle();

  return {
    ...entry,
    supersededByEntryId: supersededByResponse.data?.id ?? null,
  };
}

export type DecisionEntityLink = { label: string; href: string | null };

const ENTITY_TABLE_BY_TYPE: Record<
  string,
  { table: "financial_accounts" | "investment_sips" | "loans" | "lendings" | "assets" | "goals" | "insurance_policies"; labelColumn: string; hrefPrefix: string | null }
> = {
  financial_account: { table: "financial_accounts", labelColumn: "name", hrefPrefix: "/app/accounts" },
  loan: { table: "loans", labelColumn: "name", hrefPrefix: "/app/debts" },
  lending: { table: "lendings", labelColumn: "name", hrefPrefix: "/app/lending" },
  asset: { table: "assets", labelColumn: "name", hrefPrefix: "/app/assets" },
  goal: { table: "goals", labelColumn: "name", hrefPrefix: "/app/goals" },
  insurance_policy: { table: "insurance_policies", labelColumn: "name", hrefPrefix: "/app/insurance" },
  investment_sip: { table: "investment_sips", labelColumn: "name", hrefPrefix: null },
};

/** Batched, no-N+1 resolution of a decision's related-entity display name and link — same pattern as reminders' resolveReminderEntityLinks. */
export async function resolveDecisionEntityLinks(
  supabase: SupabaseServerClient,
  householdId: string,
  decisions: readonly { entity_type: string | null; entity_id: string | null }[],
): Promise<Map<string, DecisionEntityLink>> {
  const links = new Map<string, DecisionEntityLink>();

  const idsByType = new Map<string, string[]>();
  for (const decision of decisions) {
    if (!decision.entity_type || !decision.entity_id) continue;
    const ids = idsByType.get(decision.entity_type) ?? [];
    ids.push(decision.entity_id);
    idsByType.set(decision.entity_type, ids);
  }

  await Promise.all(
    Array.from(idsByType.entries()).map(async ([entityType, ids]) => {
      const config = ENTITY_TABLE_BY_TYPE[entityType];
      if (!config) return;
      const rows = unwrapList(
        await supabase
          .from(config.table)
          .select(`id, ${config.labelColumn}`)
          .eq("household_id", householdId)
          .in("id", ids),
      );
      for (const row of rows as unknown as Record<string, string>[]) {
        const id = row.id ?? "";
        const label = row[config.labelColumn] ?? "";
        links.set(`${entityType}:${id}`, {
          label,
          href: config.hrefPrefix ? `${config.hrefPrefix}/${id}` : null,
        });
      }
    }),
  );

  return links;
}
