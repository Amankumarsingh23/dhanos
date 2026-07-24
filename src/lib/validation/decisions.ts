import { z } from "zod";
import { isoDateStringSchema, uuidSchema } from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the financial decision journal (PROMPT 37,
 * src/features/decisions) — see
 * supabase/migrations/20260725100000_decision_journal.sql for the matching
 * column definitions/check constraints, including the immutability trigger
 * that backs "original rationale remains preserved": every field validated
 * by `decisionFieldsSchema` below is write-once at the database layer —
 * only `recordOutcomeSchema`/status-change actions may touch a row again
 * after creation.
 */

export const DECISION_ENTITY_TYPES = [
  "financial_account",
  "investment_sip",
  "loan",
  "lending",
  "asset",
  "goal",
  "insurance_policy",
] as const;
export const decisionEntityTypeSchema = z.enum(DECISION_ENTITY_TYPES);
export type DecisionEntityType = z.infer<typeof decisionEntityTypeSchema>;

export const DECISION_ENTITY_TYPE_LABELS: Record<DecisionEntityType, string> = {
  financial_account: "Financial account",
  investment_sip: "SIP",
  loan: "Loan",
  lending: "Lending",
  asset: "Asset",
  goal: "Goal",
  insurance_policy: "Insurance policy",
};

export const DECISION_STATUSES = [
  "open",
  "decided",
  "under_review",
  "reversed",
  "superseded",
] as const;
export const decisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof decisionStatusSchema>;

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  open: "Open",
  decided: "Decided",
  under_review: "Under review",
  reversed: "Reversed",
  superseded: "Superseded",
};

/** Which initial status a new entry may start at — reversed/superseded are only ever reached via a later action, never chosen at creation. */
export const INITIAL_DECISION_STATUSES = ["open", "decided"] as const;
export const initialDecisionStatusSchema = z.enum(INITIAL_DECISION_STATUSES);

const optionalTextSchema = z.string().trim().max(4000).nullable().optional();

/**
 * Every write-once field (PROMPT 37: "original rationale remains
 * preserved") — used for both the create schema and, unchanged, for
 * supersedeDecisionSchema (superseding is "create a new entry", not "edit
 * an old one").
 */
export const decisionFieldsSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(200, "Title is too long"),
    decisionDate: isoDateStringSchema,
    amount: z.string().trim().max(30).nullable().optional(),
    entityType: decisionEntityTypeSchema.nullable().optional(),
    entityId: uuidSchema.nullable().optional(),
    context: optionalTextSchema,
    choice: z.string().trim().min(1, "Enter what was chosen").max(2000),
    alternatives: optionalTextSchema,
    rationale: z.string().trim().min(1, "Enter the rationale").max(4000),
    expectedResult: optionalTextSchema,
    risks: optionalTextSchema,
    reviewDate: isoDateStringSchema.nullable().optional(),
    status: initialDecisionStatusSchema.default("decided"),
  })
  .refine((values) => Boolean(values.entityType) === Boolean(values.entityId), {
    message: "Select an entity type and its record, or leave both blank",
    path: ["entityId"],
  });
export type DecisionFieldsInput = z.input<typeof decisionFieldsSchema>;

export const createDecisionSchema = decisionFieldsSchema;
export type CreateDecisionInput = z.input<typeof createDecisionSchema>;

export const supersedeDecisionSchema = decisionFieldsSchema.and(
  z.object({ supersedesEntryId: uuidSchema }),
);
export type SupersedeDecisionInput = z.input<typeof supersedeDecisionSchema>;

export const decisionIdSchema = z.object({ decisionId: uuidSchema });
export type DecisionIdInput = z.input<typeof decisionIdSchema>;

export const recordOutcomeSchema = z
  .object({
    decisionId: uuidSchema,
    actualOutcome: optionalTextSchema,
    lessonsLearned: optionalTextSchema,
  })
  .refine(
    (values) => Boolean(values.actualOutcome) || Boolean(values.lessonsLearned),
    {
      message: "Enter the actual outcome or a lesson learned",
      path: ["actualOutcome"],
    },
  );
export type RecordOutcomeInput = z.input<typeof recordOutcomeSchema>;

export const markReversedSchema = z.object({
  decisionId: uuidSchema,
  actualOutcome: z.string().trim().min(1, "Explain what happened").max(4000),
});
export type MarkReversedInput = z.input<typeof markReversedSchema>;

export const setReviewDateSchema = z.object({
  decisionId: uuidSchema,
  reviewDate: isoDateStringSchema.nullable(),
});
export type SetReviewDateInput = z.input<typeof setReviewDateSchema>;

export type DecisionFilters = {
  status?: DecisionStatus;
  entityType?: DecisionEntityType;
  search?: string;
};
