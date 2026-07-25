"use server";

import { z } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { reportActionError } from "@/lib/observability/report-action-error";
import { parseDecimalToMinorUnits } from "@/lib/money";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { createClient } from "@/lib/supabase/server";
import { createSignedDownloadUrl } from "@/lib/storage";
import {
  attachClaimDocumentSchema,
  deleteClaimSchema,
  insuranceClaimFieldsSchema,
  recordClaimSettlementSchema,
  setClaimStatusSchema,
  type AttachClaimDocumentInput,
  type DeleteClaimInput,
  type InsuranceClaimFieldsInput,
  type RecordClaimSettlementInput,
  type SetClaimStatusInput,
} from "@/lib/validation/insurance";
import { uuidSchema } from "@/lib/validation/primitives";
import { listClaimDocuments } from "./claims-queries";
import type {
  ClaimDocumentRecord,
  InsuranceClaimRecord,
} from "./claims-queries";

/**
 * Server Actions for insurance claims (PROMPT 26) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one of
 * these implements via runHouseholdMutation. Create/update/status-change/
 * delete are single-table writes (no RPC needed); recording a settlement
 * spans insurance_claims + transactions, so it goes through the
 * record_insurance_claim_settlement SECURITY INVOKER RPC for real
 * atomicity — same shape as record_loan_payment/record_lending_repayment.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const INSURANCE_REVALIDATE_PATHS = [
  "/app/insurance",
  "/app/insurance/dashboard",
];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchPolicyForClaim(
  supabase: SupabaseServerClient,
  householdId: string,
  policyId: string,
): Promise<{ id: string; currency_code: string; name: string }> {
  const response = await supabase
    .from("insurance_policies")
    .select("id, currency_code, name")
    .eq("id", policyId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  if (!response.data) {
    throw new NotFoundError("Policy not found.");
  }
  return response.data;
}

async function fetchClaim(
  supabase: SupabaseServerClient,
  householdId: string,
  claimId: string,
): Promise<InsuranceClaimRecord> {
  const response = await supabase
    .from("insurance_claims")
    .select("*")
    .eq("id", claimId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (response.error) {
    throw mapSupabaseError(response.error);
  }
  if (!response.data) {
    throw new NotFoundError();
  }
  return response.data;
}

function claimRevalidatePaths(policyId: string): string[] {
  return [...INSURANCE_REVALIDATE_PATHS, `/app/insurance/${policyId}`];
}

export async function createClaimAction(
  householdId: string,
  input: InsuranceClaimFieldsInput,
): Promise<ActionResult<InsuranceClaimRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: insuranceClaimFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const policy = await fetchPolicyForClaim(
        supabase,
        householdId,
        values.policyId,
      );
      const claimedAmountMinorUnits = parseDecimalToMinorUnits(
        values.claimedAmount,
        policy.currency_code,
      );
      const approvedAmountMinorUnits =
        values.approvedAmount && values.approvedAmount.trim() !== ""
          ? parseDecimalToMinorUnits(
              values.approvedAmount,
              policy.currency_code,
            )
          : null;

      const response = await supabase
        .from("insurance_claims")
        .insert({
          household_id: householdId,
          policy_id: values.policyId,
          insured_person_id: values.insuredPersonId,
          incident_date: values.incidentDate,
          claim_date: values.claimDate,
          claimed_amount_minor_units: claimedAmountMinorUnits,
          approved_amount_minor_units: approvedAmountMinorUnits,
          currency_code: policy.currency_code,
          hospital_provider: values.hospitalProvider ?? null,
          reference_number: values.referenceNumber ?? null,
          notes: values.notes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "insurance_claim.created",
      entityType: "insurance_claim",
      entityId: output.id,
      metadata: { policyId: output.policy_id },
    }),
    revalidatePaths: claimRevalidatePaths(input.policyId),
  });
}

export async function updateClaimAction(
  householdId: string,
  claimId: string,
  input: InsuranceClaimFieldsInput,
): Promise<ActionResult<InsuranceClaimRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: insuranceClaimFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const policy = await fetchPolicyForClaim(
        supabase,
        householdId,
        values.policyId,
      );
      const claimedAmountMinorUnits = parseDecimalToMinorUnits(
        values.claimedAmount,
        policy.currency_code,
      );
      const approvedAmountMinorUnits =
        values.approvedAmount && values.approvedAmount.trim() !== ""
          ? parseDecimalToMinorUnits(
              values.approvedAmount,
              policy.currency_code,
            )
          : null;

      const response = await supabase
        .from("insurance_claims")
        .update({
          insured_person_id: values.insuredPersonId,
          incident_date: values.incidentDate,
          claim_date: values.claimDate,
          claimed_amount_minor_units: claimedAmountMinorUnits,
          approved_amount_minor_units: approvedAmountMinorUnits,
          hospital_provider: values.hospitalProvider ?? null,
          reference_number: values.referenceNumber ?? null,
          notes: values.notes ?? null,
        })
        .eq("id", claimId)
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
      eventType: "insurance_claim.updated",
      entityType: "insurance_claim",
      entityId: output.id,
    }),
    revalidatePaths: claimRevalidatePaths(input.policyId),
  });
}

export async function setClaimStatusAction(
  householdId: string,
  input: SetClaimStatusInput,
): Promise<ActionResult<InsuranceClaimRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: setClaimStatusSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("insurance_claims")
        .update({ status: values.status })
        .eq("id", values.claimId)
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
      eventType: `insurance_claim.${values.status}`,
      entityType: "insurance_claim",
      entityId: output.id,
    }),
    revalidatePaths: claimRevalidatePaths(input.policyId),
  });
}

export async function deleteClaimAction(
  householdId: string,
  input: DeleteClaimInput,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: deleteClaimSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const claim = await fetchClaim(supabase, householdId, values.claimId);
      if (claim.status === "paid") {
        throw new ValidationError(
          "A paid claim cannot be deleted — its settlement transaction stays linked to it. Close it instead.",
        );
      }
      const response = await supabase
        .from("insurance_claims")
        .delete()
        .eq("id", values.claimId)
        .eq("household_id", householdId)
        .select("id")
        .maybeSingle();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      if (!response.data) {
        throw new NotFoundError();
      }
      return response.data;
    },
    activityEvent: ({ input: values }) => ({
      householdId,
      eventType: "insurance_claim.deleted",
      entityType: "insurance_claim",
      entityId: values.claimId,
    }),
    revalidatePaths: claimRevalidatePaths(input.policyId),
  });
}

/**
 * Records a claim settlement via the record_insurance_claim_settlement RPC
 * — atomically writes the kind = insurance_claim_settlement transaction
 * (PROMPT 26: "claim payment is not treated as normal income") and marks
 * the claim paid.
 */
export async function recordClaimSettlementAction(
  householdId: string,
  input: RecordClaimSettlementInput,
): Promise<ActionResult<InsuranceClaimRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordClaimSettlementSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const claim = await fetchClaim(supabase, householdId, values.claimId);
      const settledAmountMinorUnits = parseDecimalToMinorUnits(
        values.settledAmount,
        claim.currency_code,
      );

      const response = await supabase.rpc("record_insurance_claim_settlement", {
        p_household_id: householdId,
        p_claim_id: values.claimId,
        p_settled_account_id: values.settledAccountId,
        p_settled_amount_minor_units: settledAmountMinorUnits,
        p_settled_date: values.settledDate,
        p_description: values.description ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "insurance_claim.paid",
      entityType: "insurance_claim",
      entityId: output.id,
      metadata: {
        settlementTransactionId: output.settlement_transaction_id,
        settledAmountMinorUnits: output.settled_amount_minor_units,
      },
    }),
    revalidatePaths: [
      ...claimRevalidatePaths(input.policyId),
      "/app/cash-flow",
      "/app/accounts",
    ],
  });
}

/**
 * Attaches an already-uploaded Storage object to a claim as supporting
 * documentation. The browser uploads the file bytes directly (see
 * src/features/insurance/claim-dialog.tsx); this only records the
 * resulting path — same split as attachExpenseReceiptAction
 * (src/features/expenses/actions.ts).
 */
export async function attachClaimDocumentAction(
  householdId: string,
  input: AttachClaimDocumentInput,
): Promise<ActionResult<ClaimDocumentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: attachClaimDocumentSchema,
    input,
    run: async ({ supabase, input: values }) => {
      await fetchClaim(supabase, householdId, values.claimId);

      const response = await supabase
        .from("attachments")
        .insert({
          household_id: householdId,
          attachable_type: "insurance_claim",
          attachable_id: values.claimId,
          storage_bucket: "documents",
          storage_path: values.storagePath,
          file_name: values.fileName,
          mime_type: values.mimeType ?? null,
          size_bytes: values.sizeBytes ?? null,
        })
        .select()
        .single();
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ input: values, output }) => ({
      householdId,
      eventType: "insurance_claim.document_attached",
      entityType: "insurance_claim",
      entityId: values.claimId,
      metadata: { attachmentId: output.id },
    }),
    revalidatePaths: [...INSURANCE_REVALIDATE_PATHS],
  });
}

const claimDocumentIdSchema = z.object({ attachmentId: uuidSchema });

export async function removeClaimDocumentAction(
  householdId: string,
  attachmentId: string,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: claimDocumentIdSchema,
    input: { attachmentId },
    run: async ({ supabase, input: values }) => {
      const attachmentResponse = await supabase
        .from("attachments")
        .select("storage_bucket, storage_path")
        .eq("id", values.attachmentId)
        .eq("household_id", householdId)
        .eq("attachable_type", "insurance_claim")
        .maybeSingle();
      if (attachmentResponse.error) {
        throw mapSupabaseError(attachmentResponse.error);
      }
      if (!attachmentResponse.data) {
        throw new NotFoundError();
      }

      const deleteResponse = await supabase
        .from("attachments")
        .delete()
        .eq("id", values.attachmentId)
        .eq("household_id", householdId);
      if (deleteResponse.error) {
        throw mapSupabaseError(deleteResponse.error);
      }

      await supabase.storage
        .from(attachmentResponse.data.storage_bucket)
        .remove([attachmentResponse.data.storage_path]);

      return undefined;
    },
    activityEvent: () => ({
      householdId,
      eventType: "insurance_claim.document_removed",
      entityType: "attachment",
      entityId: attachmentId,
    }),
    revalidatePaths: [...INSURANCE_REVALIDATE_PATHS],
  });
}

const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;

/**
 * A claim's currently-attached documents — fetched lazily by ClaimDialog
 * only when opened in edit mode for one specific claim, never as part of
 * the claims-list read (which only carries a batched count — see
 * fetchDocumentCountsByClaim in claims-queries.ts — to avoid a document
 * read per row on every list render).
 */
export async function getClaimDocumentsAction(
  householdId: string,
  claimId: string,
): Promise<ActionResult<ClaimDocumentRecord[]>> {
  const parsed = uuidSchema.safeParse(claimId);
  if (!parsed.success) {
    return actionError("Invalid claim id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const documents = await listClaimDocuments(
      supabase,
      householdId,
      parsed.data,
    );
    return actionOk(documents);
  } catch (error) {
    return actionError(
      reportActionError(error, "insurance.get_claim_documents", {
        householdId,
        claimId: parsed.data,
      }),
    );
  }
}

/** A short-lived signed URL to view/download one claim document — never a permanent public link (see docs/security-model.md §5). */
export async function getClaimDocumentUrlAction(
  householdId: string,
  attachmentId: string,
): Promise<ActionResult<string>> {
  const parsed = uuidSchema.safeParse(attachmentId);
  if (!parsed.success) {
    return actionError("Invalid attachment id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const attachmentResponse = await supabase
      .from("attachments")
      .select("storage_bucket, storage_path")
      .eq("id", parsed.data)
      .eq("household_id", householdId)
      .eq("attachable_type", "insurance_claim")
      .maybeSingle();
    if (attachmentResponse.error) {
      throw mapSupabaseError(attachmentResponse.error);
    }
    if (!attachmentResponse.data) {
      throw new NotFoundError();
    }
    const url = await createSignedDownloadUrl(
      attachmentResponse.data.storage_bucket,
      attachmentResponse.data.storage_path,
      300,
    );
    return actionOk(url);
  } catch (error) {
    // Never log `url` itself here — it's a short-lived signed download
    // link (see docs/security-model.md §5 / docs/observability.md).
    return actionError(
      reportActionError(error, "insurance.get_claim_document_url", {
        householdId,
        attachmentId: parsed.data,
      }),
    );
  }
}
