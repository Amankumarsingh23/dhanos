import { z } from "zod";

/**
 * Shared filter vocabulary for the reporting centre (PROMPT 36). Not every
 * filter applies to every report — each report in
 * src/features/reports/registry.ts declares its own `relevantFilters`
 * subset, and the filter bar only ever renders controls for that subset,
 * so a filter never sits on screen silently doing nothing.
 */

export const REPORT_FILTER_KEYS = [
  "dateRange",
  "person",
  "account",
  "institution",
  "category",
  "assetClass",
  "source",
] as const;
export type ReportFilterKey = (typeof REPORT_FILTER_KEYS)[number];

/**
 * How a figure entered the system — reuses the exact taxonomy
 * DataSourceBadge already renders (src/components/shared/data-source-badge.tsx).
 * Each report maps its own underlying column (account_balance_snapshots.source,
 * investment_valuation_snapshots.source, asset_valuation_snapshots.confidence,
 * ...) onto this shared vocabulary rather than exposing raw per-table enum
 * values in the filter UI.
 */
export const reportSourceSchema = z.enum(["verified", "manual", "imported"]);
export type ReportSource = z.infer<typeof reportSourceSchema>;

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  personId?: string;
  accountId?: string;
  institutionId?: string;
  categoryId?: string;
  assetClass?: string;
  source?: ReportSource;
};
