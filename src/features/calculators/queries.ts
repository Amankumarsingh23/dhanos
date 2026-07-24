import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import type { CalculatorType } from "@/lib/validation/calculators";
import type { Tables } from "@/types/database";

export type CalculatorScenarioRecord = Tables<"calculator_scenarios">;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Lists a household's explicitly-saved calculator scenarios, most recent
 * first — optionally narrowed to one calculator type (each calculator's UI
 * only ever shows its own saved scenarios, never another calculator's).
 */
export async function listCalculatorScenarios(
  supabase: SupabaseServerClient,
  householdId: string,
  calculatorType?: CalculatorType,
): Promise<CalculatorScenarioRecord[]> {
  let query = supabase
    .from("calculator_scenarios")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (calculatorType) {
    query = query.eq("calculator_type", calculatorType);
  }

  return unwrapList(await query) as unknown as CalculatorScenarioRecord[];
}
