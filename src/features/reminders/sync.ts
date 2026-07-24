import "server-only";
import { addDays, parseISO } from "date-fns";
import type { createClient } from "@/lib/supabase/server";
import { unwrapList } from "@/lib/database/query";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { getTodayInTimeZone, toIsoDateString } from "@/lib/dates";
import {
  generateAssetValuationReviewCandidates,
  generateDecisionReviewCandidates,
  generateDocumentExpiryCandidates,
  generateEmiDueCandidates,
  generateExpectedIncomeCandidates,
  generateFixedDepositMaturityCandidates,
  generateGoalReviewCandidates,
  generateInsurancePremiumCandidates,
  generateLendingRepaymentCandidates,
  generateLoanReviewCandidates,
  generateMonthlyClosingCandidates,
  generatePolicyRenewalCandidates,
  generateSipDueCandidates,
  type ReminderCandidate,
  type ReminderWindow,
} from "@/lib/calculations/reminders";
import type { ReminderType } from "@/lib/validation/reminders";
import { REMINDER_ENTITY_TYPE_BY_REMINDER_TYPE } from "@/lib/validation/reminders";
import type { IncomeFrequency } from "@/lib/validation/income-sources";

/**
 * Generates this household's reminders (PROMPT 35) — reads each source
 * module's own dates, runs them through the matching pure generator in
 * src/lib/calculations/reminders.ts, and upserts the results with
 * `ignoreDuplicates` against the dedup unique constraint
 * (household_id, reminder_type, entity_type, entity_id, due_date). Called
 * from the reminders page on every load (best-effort — see the page) and
 * from syncRemindersAction for a manual "Refresh" button; both call this
 * same function, so there is exactly one place generation logic lives.
 *
 * Bounded window: 30 days back (catch a recently-elapsed due date that
 * hasn't been generated yet) to 90 days ahead (the calendar's lookahead
 * horizon) — never an unbounded historical scan.
 */

const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 90;
const FETCH_LIMIT = 500;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type HouseholdForSync = { id: string; timezone: string };

function toWindow(today: string): ReminderWindow {
  return {
    windowStart: toIsoDateString(addDays(parseISO(today), -LOOKBACK_DAYS)),
    windowEnd: toIsoDateString(addDays(parseISO(today), LOOKAHEAD_DAYS)),
  };
}

type RawReminderRow = {
  reminder_type: ReminderType;
  entity_id: string;
  due_date: string;
};

function toRows(
  householdId: string,
  reminderType: ReminderType,
  candidates: readonly ReminderCandidate[],
): RawReminderRow[] {
  return candidates.map((candidate) => ({
    reminder_type: reminderType,
    entity_id: candidate.entityId,
    due_date: candidate.dueDate,
  }));
}

export async function syncReminders(
  supabase: SupabaseServerClient,
  household: HouseholdForSync,
): Promise<void> {
  const today = getTodayInTimeZone(household.timezone);
  const window = toWindow(today);
  const householdId = household.id;

  const [
    sips,
    loans,
    policies,
    incomeSources,
    lendings,
    documents,
    accounts,
    goals,
    assets,
    closings,
    decisions,
  ] = await Promise.all([
    unwrapList(
      await supabase
        .from("investment_sips")
        .select("id, next_due_date, status")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("loans")
        .select(
          "id, start_date, repayment_start_date, maturity_date, emi_amount_minor_units, status",
        )
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("insurance_policies")
        .select(
          "id, start_date, premium_frequency, renewal_date, expiry_date, status",
        )
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("income_sources")
        .select("id, frequency, expected_day_of_month, start_date, end_date, is_active")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("lendings")
        .select("id, expected_repayment_date, status")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("documents")
        .select("id, expiry_date, status")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("financial_accounts")
        .select("id, maturity_date, is_active")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("goals")
        .select("id, created_at, target_date, status")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("assets")
        .select("id, created_at")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("monthly_closings")
        .select("period, status")
        .eq("household_id", householdId)
        .in("status", ["closed", "reopened"])
        .limit(FETCH_LIMIT),
    ),
    unwrapList(
      await supabase
        .from("decision_journal_entries")
        .select("id, review_date, status")
        .eq("household_id", householdId)
        .limit(FETCH_LIMIT),
    ),
  ]);

  const assetIds = assets.map((asset) => asset.id);
  const latestValuationByAsset = new Map<string, string>();
  if (assetIds.length > 0) {
    const snapshots = unwrapList(
      await supabase
        .from("asset_valuation_snapshots")
        .select("asset_id, as_of_date")
        .eq("household_id", householdId)
        .in("asset_id", assetIds)
        .order("as_of_date", { ascending: false }),
    );
    for (const snapshot of snapshots) {
      if (!latestValuationByAsset.has(snapshot.asset_id)) {
        latestValuationByAsset.set(snapshot.asset_id, snapshot.as_of_date);
      }
    }
  }

  const closedPeriods = new Set(closings.map((c) => c.period));

  const rows: RawReminderRow[] = [
    ...toRows(
      householdId,
      "sip_due",
      generateSipDueCandidates(
        sips.map((s) => ({
          id: s.id,
          nextDueDate: s.next_due_date,
          status: s.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "emi_due",
      generateEmiDueCandidates(
        loans.map((l) => ({
          id: l.id,
          repaymentStartDate: l.repayment_start_date,
          maturityDate: l.maturity_date,
          emiAmountMinorUnits: l.emi_amount_minor_units,
          status: l.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "loan_review",
      generateLoanReviewCandidates(
        loans.map((l) => ({
          id: l.id,
          startDate: l.start_date,
          maturityDate: l.maturity_date,
          status: l.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "insurance_premium",
      generateInsurancePremiumCandidates(
        policies.map((p) => ({
          id: p.id,
          startDate: p.start_date,
          premiumFrequency: p.premium_frequency,
          renewalDate: p.renewal_date,
          expiryDate: p.expiry_date,
          status: p.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "policy_renewal",
      generatePolicyRenewalCandidates(
        policies.map((p) => ({
          id: p.id,
          renewalDate: p.renewal_date,
          expiryDate: p.expiry_date,
          status: p.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "expected_income",
      generateExpectedIncomeCandidates(
        incomeSources.map((s) => ({
          id: s.id,
          frequency: s.frequency as IncomeFrequency,
          expectedDayOfMonth: s.expected_day_of_month,
          startDate: s.start_date,
          endDate: s.end_date,
          isActive: s.is_active,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "lending_repayment",
      generateLendingRepaymentCandidates(
        lendings.map((l) => ({
          id: l.id,
          expectedRepaymentDate: l.expected_repayment_date,
          status: l.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "document_expiry",
      generateDocumentExpiryCandidates(
        documents.map((d) => ({
          id: d.id,
          expiryDate: d.expiry_date,
          status: d.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "fixed_deposit_maturity",
      generateFixedDepositMaturityCandidates(
        accounts.map((a) => ({
          id: a.id,
          maturityDate: a.maturity_date,
          isActive: a.is_active,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "goal_review",
      generateGoalReviewCandidates(
        goals.map((g) => ({
          id: g.id,
          createdAtDate: toIsoDateString(g.created_at),
          targetDate: g.target_date,
          status: g.status,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "monthly_closing",
      generateMonthlyClosingCandidates(householdId, closedPeriods, today, window),
    ),
    ...toRows(
      householdId,
      "asset_valuation_review",
      generateAssetValuationReviewCandidates(
        assets.map((a) => ({
          id: a.id,
          createdAtDate: toIsoDateString(a.created_at),
          latestValuationDate: latestValuationByAsset.get(a.id) ?? null,
        })),
        window,
      ),
    ),
    ...toRows(
      householdId,
      "decision_review",
      generateDecisionReviewCandidates(
        decisions.map((d) => ({
          id: d.id,
          reviewDate: d.review_date,
          status: d.status,
        })),
        window,
      ),
    ),
  ];

  if (rows.length > 0) {
    const insertResponse = await supabase.from("reminders").upsert(
      rows.map((row) => ({
        household_id: householdId,
        reminder_type: row.reminder_type,
        entity_type: REMINDER_ENTITY_TYPE_BY_REMINDER_TYPE[row.reminder_type],
        entity_id: row.entity_id,
        due_date: row.due_date,
      })),
      {
        onConflict: "household_id,reminder_type,entity_type,entity_id,due_date",
        ignoreDuplicates: true,
      },
    );
    if (insertResponse.error) {
      throw mapSupabaseError(insertResponse.error);
    }
  }

  await supersedeStalePointerReminders(supabase, householdId, {
    sipCurrentDueDates: new Map(
      sips
        .filter((s) => s.next_due_date !== null)
        .map((s) => [s.id, s.next_due_date as string]),
    ),
  });
}

/**
 * sip_due is generated from a *single current pointer*
 * (investment_sips.next_due_date), not a full future schedule (see
 * generateSipDueCandidates's own comment) — so once a contribution is
 * recorded and the pointer advances, any still-`pending` sip_due reminder
 * for the *previous* due_date would otherwise sit forever as a permanently
 * overdue reminder for an occurrence the source feature itself has already
 * moved past. Marking it `skipped` (never `completed` — this function has
 * no idea whether the household actually acted in time) keeps the overdue
 * list honest without ever inferring payment from a reminder, or vice
 * versa.
 */
async function supersedeStalePointerReminders(
  supabase: SupabaseServerClient,
  householdId: string,
  params: { sipCurrentDueDates: Map<string, string> },
): Promise<void> {
  if (params.sipCurrentDueDates.size === 0) return;

  const pendingResponse = await supabase
    .from("reminders")
    .select("id, entity_id, due_date")
    .eq("household_id", householdId)
    .eq("reminder_type", "sip_due")
    .eq("status", "pending")
    .in("entity_id", Array.from(params.sipCurrentDueDates.keys()));
  if (pendingResponse.error) {
    throw mapSupabaseError(pendingResponse.error);
  }

  const staleIds = (pendingResponse.data ?? [])
    .filter(
      (row) => row.due_date !== params.sipCurrentDueDates.get(row.entity_id),
    )
    .map((row) => row.id);
  if (staleIds.length === 0) return;

  const updateResponse = await supabase
    .from("reminders")
    .update({
      status: "skipped",
      notes: "Superseded — the SIP's schedule advanced past this date.",
    })
    .in("id", staleIds);
  if (updateResponse.error) {
    throw mapSupabaseError(updateResponse.error);
  }
}
