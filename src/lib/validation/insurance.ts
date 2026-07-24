import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the insurance feature (PROMPT 25,
 * src/features/insurance) — see
 * supabase/migrations/20260722180000_insurance.sql for the matching
 * column definitions/check constraints. One shared fields schema backs
 * create, edit, and renew (a renewal is create_insurance_policy called
 * again with previousPolicyId set — see src/features/insurance/actions.ts)
 * since all three collect the same shape of data.
 */

export const POLICY_TYPES = [
  "health",
  "term",
  "life",
  "vehicle",
  "home",
  "personal_accident",
  "travel",
  "business",
  "property",
  "crop",
  "device",
  "other",
] as const;
export const policyTypeSchema = z.enum(POLICY_TYPES);
export type PolicyType = z.infer<typeof policyTypeSchema>;

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  health: "Health",
  term: "Term",
  life: "Life",
  vehicle: "Vehicle",
  home: "Home",
  personal_accident: "Personal accident",
  travel: "Travel",
  business: "Business",
  property: "Property",
  crop: "Crop",
  device: "Device",
  other: "Other",
};

export const premiumFrequencySchema = z.enum([
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "one_time",
]);
export type PremiumFrequency = z.infer<typeof premiumFrequencySchema>;

export const PREMIUM_FREQUENCY_LABELS: Record<PremiumFrequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Half-yearly",
  yearly: "Yearly",
  one_time: "One-time (single premium)",
};

export const policyStatusSchema = z.enum([
  "active",
  "expired",
  "lapsed",
  "cancelled",
  "renewed",
]);
export type PolicyStatus = z.infer<typeof policyStatusSchema>;

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  active: "Active",
  expired: "Expired",
  lapsed: "Lapsed",
  cancelled: "Cancelled",
  renewed: "Renewed (superseded)",
};

/** The subset of statuses a household can switch to manually — 'renewed' is only ever set automatically, on the *old* row, by create_insurance_policy. */
export const manualPolicyStatusSchema = z.enum([
  "active",
  "expired",
  "lapsed",
  "cancelled",
]);
export type ManualPolicyStatus = z.infer<typeof manualPolicyStatusSchema>;

const notesSchema = z.string().trim().max(2000).nullable().optional();
const optionalTextSchema = z.string().trim().max(500).nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();
const optionalBooleanSchema = z.boolean().nullable().optional();

/**
 * The full field set collected by create, edit, and renew. Deliberately
 * excludes `previousPolicyId` (an action parameter passed explicitly by
 * renewInsurancePolicyAction, never user-editable form state — see
 * loans/lending's own lendingId/loanId-passed-separately convention) and
 * `insuredPersonIds` is handled as its own field below, always required
 * non-empty (a policy must cover at least the policyholder, even if that's
 * its only insured person).
 */
export const insurancePolicyFieldsSchema = z
  .object({
    policyType: policyTypeSchema,
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(200, "Name is too long"),
    insurerInstitutionId: z.string().min(1, "Select an insurer"),
    policyholderPersonId: z.string().min(1, "Select a policyholder"),
    insuredPersonIds: z
      .array(z.string())
      .min(1, "Select at least one insured person"),
    nomineePersonId: z.string().nullable().optional(),
    maskedPolicyNumber: optionalTextSchema,
    coverageAmount: z.string().trim().min(1, "Enter the coverage amount"),
    currencyCode: currencyCodeSchema,
    premiumAmount: z.string().trim().min(1, "Enter the premium amount"),
    premiumFrequency: premiumFrequencySchema,
    startDate: isoDateStringSchema,
    renewalDate: optionalDateSchema,
    expiryDate: optionalDateSchema,
    agentName: optionalTextSchema,
    agentContact: optionalTextSchema,
    supportContact: optionalTextSchema,
    claimContact: optionalTextSchema,
    notes: notesSchema,
    paymentAccountId: z.string().min(1, "Select a payment account"),
    // Health-specific — collected only when policyType === 'health', but
    // validated the same regardless (schema layer stays permissive,
    // UI-gated — same convention as loans' education-loan fields).
    deductible: z.string().trim().max(30).nullable().optional(),
    coPayPercent: z.string().trim().max(10).nullable().optional(),
    roomRentRestriction: optionalTextSchema,
    preExistingConditionsDeclared: notesSchema,
    waitingPeriods: notesSchema,
    networkHospitalNotes: notesSchema,
    cashlessAvailability: optionalBooleanSchema,
    restorationBenefit: optionalBooleanSchema,
    noClaimBonus: optionalTextSchema,
    opdCover: optionalBooleanSchema,
    consumablesCover: optionalBooleanSchema,
    preHospitalizationDays: z.string().trim().max(10).nullable().optional(),
    postHospitalizationDays: z.string().trim().max(10).nullable().optional(),
    dayCareTreatment: optionalBooleanSchema,
    exclusionsSummary: notesSchema,
  })
  .refine(
    (values) => !values.renewalDate || values.renewalDate >= values.startDate,
    {
      message: "Renewal date cannot be before the start date",
      path: ["renewalDate"],
    },
  )
  .refine(
    (values) => !values.expiryDate || values.expiryDate >= values.startDate,
    {
      message: "Expiry date cannot be before the start date",
      path: ["expiryDate"],
    },
  );
export type InsurancePolicyFieldsInput = z.input<
  typeof insurancePolicyFieldsSchema
>;

export type InsurancePolicyFilters = {
  search?: string;
  policyType?: PolicyType;
  status?: PolicyStatus;
};

export const recordPremiumPaymentSchema = z.object({
  policyId: uuidSchema,
  categoryId: z.string().min(1, "Select a category"),
  paymentDate: isoDateStringSchema,
  amount: z.string().trim().min(1, "Enter the premium amount"),
  notes: notesSchema,
});
export type RecordPremiumPaymentInput = z.input<
  typeof recordPremiumPaymentSchema
>;

export const setPolicyStatusSchema = z.object({
  policyId: uuidSchema,
  status: manualPolicyStatusSchema,
});
export type SetPolicyStatusInput = z.input<typeof setPolicyStatusSchema>;

/**
 * Structured (dated) waiting periods (PROMPT 26) — supplements
 * insurance_policies.waiting_periods (kept as freeform narrative notes,
 * unchanged) with entries a "waiting-period milestones" dashboard view can
 * actually compute a date from. See src/lib/calculations/insurance.ts's
 * computeWaitingPeriodMilestoneDate.
 */
export const waitingPeriodFieldsSchema = z.object({
  policyId: uuidSchema,
  label: z.string().trim().min(1, "Enter a label").max(200),
  durationMonths: z
    .string()
    .trim()
    .min(1, "Enter the duration in months")
    .refine(
      (value) => Number.isInteger(Number(value)) && Number(value) > 0,
      "Duration must be a whole number of months greater than zero",
    ),
  startsFrom: isoDateStringSchema,
  notes: notesSchema,
});
export type WaitingPeriodFieldsInput = z.input<
  typeof waitingPeriodFieldsSchema
>;

export const deleteWaitingPeriodSchema = z.object({
  waitingPeriodId: uuidSchema,
});
export type DeleteWaitingPeriodInput = z.input<
  typeof deleteWaitingPeriodSchema
>;

/**
 * Insurance claims (PROMPT 26) — see
 * supabase/migrations/20260723100000_insurance_claims.sql for the matching
 * schema. `status = 'paid'` is deliberately excluded from
 * `manualClaimStatusSchema`: it is only ever set by
 * `recordClaimSettlementAction`, atomically alongside the real settlement
 * transaction — same "this one status is automatic, never manual" idiom as
 * insurance_policies' own `renewed`.
 */
export const CLAIM_STATUSES = [
  "preparing",
  "submitted",
  "information_requested",
  "approved",
  "partially_approved",
  "rejected",
  "paid",
  "closed",
] as const;
export const claimStatusSchema = z.enum(CLAIM_STATUSES);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  preparing: "Preparing",
  submitted: "Submitted",
  information_requested: "Information requested",
  approved: "Approved",
  partially_approved: "Partially approved",
  rejected: "Rejected",
  paid: "Paid",
  closed: "Closed",
};

export const manualClaimStatusSchema = z.enum([
  "preparing",
  "submitted",
  "information_requested",
  "approved",
  "partially_approved",
  "rejected",
  "closed",
]);
export type ManualClaimStatus = z.infer<typeof manualClaimStatusSchema>;

export const insuranceClaimFieldsSchema = z
  .object({
    policyId: uuidSchema,
    insuredPersonId: z.string().min(1, "Select an insured person"),
    incidentDate: isoDateStringSchema,
    claimDate: isoDateStringSchema,
    claimedAmount: z.string().trim().min(1, "Enter the claimed amount"),
    approvedAmount: z.string().trim().max(30).nullable().optional(),
    hospitalProvider: optionalTextSchema,
    referenceNumber: optionalTextSchema,
    notes: notesSchema,
  })
  .refine((values) => values.claimDate >= values.incidentDate, {
    message: "Claim date cannot be before the incident date",
    path: ["claimDate"],
  });
export type InsuranceClaimFieldsInput = z.input<
  typeof insuranceClaimFieldsSchema
>;

export type InsuranceClaimFilters = {
  status?: ClaimStatus;
};

/**
 * `policyId` here isn't validated against the claim server-side — it's a
 * revalidation-path hint only, always known by the caller (opened from
 * PolicyDetailView), the same "pass an already-known parent id explicitly
 * rather than re-fetch it" shape renewInsurancePolicyAction's
 * previousPolicyId parameter uses.
 */
export const setClaimStatusSchema = z.object({
  claimId: uuidSchema,
  policyId: uuidSchema,
  status: manualClaimStatusSchema,
});
export type SetClaimStatusInput = z.input<typeof setClaimStatusSchema>;

export const deleteClaimSchema = z.object({
  claimId: uuidSchema,
  policyId: uuidSchema,
});
export type DeleteClaimInput = z.input<typeof deleteClaimSchema>;

export const recordClaimSettlementSchema = z.object({
  claimId: uuidSchema,
  policyId: uuidSchema,
  settledAccountId: z.string().min(1, "Select an account"),
  settledAmount: z.string().trim().min(1, "Enter the settled amount"),
  settledDate: isoDateStringSchema,
  description: optionalTextSchema,
});
export type RecordClaimSettlementInput = z.input<
  typeof recordClaimSettlementSchema
>;

/**
 * Attaches an already-uploaded Storage object to a claim as supporting
 * documentation — same "browser uploads bytes directly, this only records
 * the resulting path" split as attachExpenseReceiptSchema
 * (src/lib/validation/expenses.ts).
 */
export const attachClaimDocumentSchema = z.object({
  claimId: uuidSchema,
  storagePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(200).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
});
export type AttachClaimDocumentInput = z.input<
  typeof attachClaimDocumentSchema
>;
