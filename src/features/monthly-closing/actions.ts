"use server";

import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { runHouseholdMutation, type ActionResult } from "@/lib/mutations";
import {
  computePeriodDateRange,
  computeReconciliationStatus,
} from "@/lib/calculations/monthly-closing";
import { getCashFlowSummary } from "@/features/dashboard/queries";
import { getCurrentNetWorthBreakdown } from "@/features/net-worth/queries";
import {
  completeMonthlyClosingSchema,
  reopenMonthlyClosingSchema,
  startMonthlyClosingSchema,
  updateReviewItemSchema,
  type CompleteMonthlyClosingInput,
  type ReopenMonthlyClosingInput,
  type StartMonthlyClosingInput,
  type UpdateReviewItemInput,
} from "@/lib/validation/monthly-closing";
import type {
  MonthlyClosingRecord,
  MonthlyClosingReviewItemRecord,
} from "./queries";

/**
 * Server Actions for the monthly financial closing workflow (PROMPT 33).
 * Starting a closing spans two tables (the closing row plus its 12
 * review-item rows) so it goes through the start_monthly_closing()
 * SECURITY INVOKER RPC for real atomicity. Completing/reopening are
 * single-table updates, but each is deliberately narrow: completing sets
 * the frozen totals exactly once; reopening only ever touches
 * status/reopened_at/reopened_by/reopen_reason, never the totals a prior
 * completion already wrote.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const MONTHLY_CLOSING_REVALIDATE_PATHS = ["/app/monthly-closing"];

function monthlyClosingRevalidatePaths(closingId?: string): string[] {
  return closingId
    ? [...MONTHLY_CLOSING_REVALIDATE_PATHS, `/app/monthly-closing/${closingId}`]
    : [...MONTHLY_CLOSING_REVALIDATE_PATHS];
}

export async function startMonthlyClosingAction(
  householdId: string,
  input: StartMonthlyClosingInput,
): Promise<ActionResult<MonthlyClosingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: startMonthlyClosingSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase.rpc("start_monthly_closing", {
        p_household_id: householdId,
        p_period: values.period,
        p_currency_code: values.currencyCode,
        p_supersedes_closing_id: values.supersedesClosingId ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "monthly_closing.started",
      entityType: "monthly_closing",
      entityId: output.id,
      metadata: { period: output.period },
    }),
    revalidatePaths: monthlyClosingRevalidatePaths(),
  });
}

export async function updateReviewItemAction(
  householdId: string,
  input: UpdateReviewItemInput,
): Promise<ActionResult<MonthlyClosingReviewItemRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: updateReviewItemSchema,
    input,
    run: async ({ supabase, user, input: values }) => {
      const response = await supabase
        .from("monthly_closing_review_items")
        .update({
          is_reviewed: values.isReviewed,
          notes: values.notes ?? null,
          reviewed_at: values.isReviewed ? new Date().toISOString() : null,
          reviewed_by: values.isReviewed ? user.id : null,
        })
        .eq("id", values.reviewItemId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "monthly_closing.review_item_updated",
      entityType: "monthly_closing_review_item",
      entityId: output.id,
      metadata: { itemType: output.item_type, isReviewed: output.is_reviewed },
    }),
    revalidatePaths: monthlyClosingRevalidatePaths(),
  });
}

/**
 * Freezes the closing's totals — computed fresh from real, current data
 * (reusing the dashboard's cash-flow summary and the net-worth engine
 * directly, never re-derived) and, once written here, never touched
 * again by any other action (see the migration comment).
 */
export async function completeMonthlyClosingAction(
  householdId: string,
  input: CompleteMonthlyClosingInput,
): Promise<ActionResult<MonthlyClosingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: completeMonthlyClosingSchema,
    input,
    run: async ({ supabase, user, input: values }) => {
      const closingResponse = await supabase
        .from("monthly_closings")
        .select("*")
        .eq("id", values.monthlyClosingId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (closingResponse.error) {
        throw mapSupabaseError(closingResponse.error);
      }
      if (!closingResponse.data) {
        throw new NotFoundError();
      }
      const closing = closingResponse.data;
      if (closing.status !== "in_progress") {
        throw new ValidationError("This closing has already been completed.");
      }

      const { dateFrom, dateTo } = computePeriodDateRange(closing.period);
      const cashFlow = await getCashFlowSummary(
        supabase,
        householdId,
        dateFrom,
        dateTo,
        closing.currency_code,
      );

      // Ensure a net-worth snapshot exists "as of now" to link this
      // closing to — reuses the exact same breakdown/insert shape as
      // recordNetWorthSnapshotAction (src/features/net-worth/actions.ts),
      // duplicated here rather than calling that action directly so this
      // stays a single household-scoped mutation.
      const breakdown = await getCurrentNetWorthBreakdown(
        supabase,
        householdId,
        closing.currency_code,
      );
      const existingSnapshot = await supabase
        .from("net_worth_snapshots")
        .select("id")
        .eq("household_id", householdId)
        .eq("as_of_date", breakdown.asOfDate)
        .maybeSingle();
      if (existingSnapshot.error) {
        throw mapSupabaseError(existingSnapshot.error);
      }
      let netWorthSnapshotId = existingSnapshot.data?.id ?? null;
      if (!netWorthSnapshotId) {
        const snapshotInsert = await supabase
          .from("net_worth_snapshots")
          .insert({
            household_id: householdId,
            as_of_date: breakdown.asOfDate,
            currency_code: breakdown.currencyCode,
            cash_and_accounts_minor_units: breakdown.cashAndAccountsMinorUnits,
            investments_minor_units: breakdown.investmentsMinorUnits,
            movable_assets_minor_units: breakdown.movableAssetsMinorUnits,
            property_minor_units: breakdown.propertyMinorUnits,
            receivables_minor_units: breakdown.receivablesMinorUnits,
            loans_minor_units: breakdown.loansMinorUnits,
            other_liabilities_minor_units: breakdown.otherLiabilitiesMinorUnits,
            completeness_percentage: breakdown.completenessPercentage,
            valuation_dependent_item_count:
              breakdown.valuationDependentItemCount,
            missing_valuation_count: breakdown.missingValuationCount,
          })
          .select("id")
          .single();
        if (snapshotInsert.error) {
          throw mapSupabaseError(snapshotInsert.error);
        }
        netWorthSnapshotId = snapshotInsert.data.id;
      }

      const reviewItemsResponse = await supabase
        .from("monthly_closing_review_items")
        .select("is_reviewed")
        .eq("household_id", householdId)
        .eq("monthly_closing_id", closing.id);
      if (reviewItemsResponse.error) {
        throw mapSupabaseError(reviewItemsResponse.error);
      }
      const unresolvedItemsCount = reviewItemsResponse.data.filter(
        (item) => !item.is_reviewed,
      ).length;

      const response = await supabase
        .from("monthly_closings")
        .update({
          status: "closed",
          completed_at: new Date().toISOString(),
          completed_by: user.id,
          income_total_minor_units: cashFlow.income.amountMinorUnits,
          expense_total_minor_units: cashFlow.expense.amountMinorUnits,
          investment_contribution_minor_units:
            cashFlow.investment.amountMinorUnits,
          debt_payment_minor_units: cashFlow.debtPayment.amountMinorUnits,
          net_worth_snapshot_id: netWorthSnapshotId,
          reconciliation_status:
            computeReconciliationStatus(unresolvedItemsCount),
          unresolved_items_count: unresolvedItemsCount,
          notes: values.notes ?? closing.notes,
        })
        .eq("id", closing.id)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "monthly_closing.completed",
      entityType: "monthly_closing",
      entityId: output.id,
      metadata: { period: output.period },
    }),
    revalidatePaths: monthlyClosingRevalidatePaths(input.monthlyClosingId),
  });
}

/**
 * "Reopening requires deliberate confirmation" (PROMPT 33 acceptance
 * criterion): always requires a typed reason, and only ever touches
 * status/reopened_at/reopened_by/reopen_reason — the frozen totals this
 * row already carries from completion are never rewritten.
 */
export async function reopenMonthlyClosingAction(
  householdId: string,
  input: ReopenMonthlyClosingInput,
): Promise<ActionResult<MonthlyClosingRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: reopenMonthlyClosingSchema,
    input,
    run: async ({ supabase, user, input: values }) => {
      const closingResponse = await supabase
        .from("monthly_closings")
        .select("status")
        .eq("id", values.monthlyClosingId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (closingResponse.error) {
        throw mapSupabaseError(closingResponse.error);
      }
      if (!closingResponse.data) {
        throw new NotFoundError();
      }
      if (closingResponse.data.status !== "closed") {
        throw new ValidationError("Only a closed month can be reopened.");
      }

      const response = await supabase
        .from("monthly_closings")
        .update({
          status: "reopened",
          reopened_at: new Date().toISOString(),
          reopened_by: user.id,
          reopen_reason: values.reopenReason,
        })
        .eq("id", values.monthlyClosingId)
        .eq("household_id", householdId)
        .select()
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "monthly_closing.reopened",
      entityType: "monthly_closing",
      entityId: values.monthlyClosingId,
      metadata: { reason: output.reopen_reason },
    }),
    revalidatePaths: monthlyClosingRevalidatePaths(input.monthlyClosingId),
  });
}
