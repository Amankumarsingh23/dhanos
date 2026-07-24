import { z } from "zod";

/**
 * Shared zod schemas for the net-worth engine (PROMPT 32,
 * src/features/net-worth). Recording a snapshot takes no user-entered
 * fields at all — every component is computed server-side from real,
 * already-current data (see src/features/net-worth/queries.ts) — but
 * still goes through the standard runHouseholdMutation pipeline for
 * authorization/activity-logging/revalidation, hence the (empty) schema.
 */
export const recordNetWorthSnapshotSchema = z.object({});
export type RecordNetWorthSnapshotInput = z.input<
  typeof recordNetWorthSnapshotSchema
>;
