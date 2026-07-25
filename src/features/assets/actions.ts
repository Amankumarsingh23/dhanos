"use server";

import { z } from "zod";
import { NotFoundError } from "@/lib/errors/app-error";
import { reportActionError } from "@/lib/observability/report-action-error";
import { mapSupabaseError } from "@/lib/errors/supabase";
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
import { uuidSchema } from "@/lib/validation/primitives";
import {
  assetFieldsSchema,
  attachAssetDocumentSchema,
  createAssetSchema,
  deleteAssetSchema,
  recordAssetIncomeSchema,
  recordAssetValuationSchema,
  type AssetFieldsInput,
  type AttachAssetDocumentInput,
  type CreateAssetInput,
  type DeleteAssetInput,
  type RecordAssetIncomeInput,
  type RecordAssetValuationInput,
} from "@/lib/validation/assets";
import {
  listAssetDocuments,
  type AssetDocumentRecord,
  type AssetIncomeTransaction,
  type AssetRecord,
  type AssetValuationSnapshotRecord,
} from "./queries";

/**
 * Server Actions for the asset register (PROMPT 27) — see
 * docs/data-access-patterns.md for the 8-step mutation process every one
 * of these implements via runHouseholdMutation. Creating an asset spans
 * two tables (assets + its first asset_valuation_snapshots row) so it
 * goes through the create_asset SECURITY INVOKER RPC for real atomicity —
 * see supabase/migrations/20260723110000_assets.sql. Editing an asset
 * never touches valuation history; recording a later valuation
 * (recordAssetValuationAction) never touches the asset row — the two are
 * deliberately separate single-table writes, matching "asset values use
 * snapshots."
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const ASSET_REVALIDATE_PATHS = ["/app/assets"];

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function fetchAsset(
  supabase: SupabaseServerClient,
  householdId: string,
  assetId: string,
): Promise<AssetRecord> {
  const response = await supabase
    .from("assets")
    .select("*")
    .eq("id", assetId)
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

function assetRevalidatePaths(assetId?: string): string[] {
  return assetId
    ? [...ASSET_REVALIDATE_PATHS, `/app/assets/${assetId}`]
    : [...ASSET_REVALIDATE_PATHS];
}

function toAssetFieldsArgs(values: AssetFieldsInput) {
  const acquisitionValueMinorUnits =
    values.acquisitionValue && values.acquisitionValue.trim() !== ""
      ? parseDecimalToMinorUnits(values.acquisitionValue, values.currencyCode)
      : null;

  return {
    name: values.name,
    asset_group: values.assetGroup,
    category: values.category,
    owner_person_id: values.ownerPersonId,
    ownership_percentage: Number(values.ownershipPercentage),
    ownership_status: values.ownershipStatus,
    acquisition_type: values.acquisitionType,
    acquisition_date: values.acquisitionDate,
    acquisition_value_minor_units: acquisitionValueMinorUnits,
    currency_code: values.currencyCode,
    location: values.location ?? null,
    condition: values.condition ?? null,
    generates_income: values.generatesIncome,
    income_notes: values.incomeNotes ?? null,
    related_loan_id: values.relatedLoanId || null,
    include_in_net_worth: values.includeInNetWorth,
    liquidity_classification: values.liquidityClassification,
    notes: values.notes ?? null,
    // Property-specific (PROMPT 28) — nullable regardless of assetGroup,
    // UI-gated to immovable. land_area is stored as numeric; an empty
    // string means "not entered," not zero.
    property_type: values.propertyType ?? null,
    location_precise: values.locationPrecise ?? null,
    land_area:
      values.landArea && values.landArea.trim() !== ""
        ? Number(values.landArea)
        : null,
    area_unit: values.areaUnit ?? null,
    ownership_share_notes: values.ownershipShareNotes ?? null,
    title_status: values.titleStatus ?? null,
    mutation_status: values.mutationStatus ?? null,
    original_owner: values.originalOwner ?? null,
    legal_heir_notes: values.legalHeirNotes ?? null,
    rental_status: values.rentalStatus ?? null,
    occupancy: values.occupancy ?? null,
    encumbrance_status: values.encumbranceStatus ?? null,
    encumbrance_notes: values.encumbranceNotes ?? null,
    dispute_status: values.disputeStatus ?? null,
    registration_details: values.registrationDetails ?? null,
  };
}

export async function createAssetAction(
  householdId: string,
  input: CreateAssetInput,
): Promise<ActionResult<AssetRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createAssetSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toAssetFieldsArgs(values);
      const estimatedValueMinorUnits = parseDecimalToMinorUnits(
        values.estimatedValue,
        values.currencyCode,
      );

      const response = await supabase.rpc("create_asset", {
        p_household_id: householdId,
        p_name: fields.name,
        p_asset_group: fields.asset_group,
        p_category: fields.category,
        p_owner_person_id: fields.owner_person_id,
        p_ownership_percentage: fields.ownership_percentage,
        p_ownership_status: fields.ownership_status,
        p_acquisition_type: fields.acquisition_type,
        p_acquisition_date: fields.acquisition_date,
        p_currency_code: fields.currency_code,
        p_liquidity_classification: fields.liquidity_classification,
        p_estimated_value_minor_units: estimatedValueMinorUnits,
        p_valuation_date: values.valuationDate,
        p_acquisition_value_minor_units:
          fields.acquisition_value_minor_units ?? undefined,
        p_location: fields.location ?? undefined,
        p_condition: fields.condition ?? undefined,
        p_generates_income: fields.generates_income,
        p_income_notes: fields.income_notes ?? undefined,
        p_related_loan_id: fields.related_loan_id ?? undefined,
        p_include_in_net_worth: fields.include_in_net_worth,
        p_notes: fields.notes ?? undefined,
        p_property_type: fields.property_type ?? undefined,
        p_location_precise: fields.location_precise ?? undefined,
        p_land_area: fields.land_area ?? undefined,
        p_area_unit: fields.area_unit ?? undefined,
        p_ownership_share_notes: fields.ownership_share_notes ?? undefined,
        p_title_status: fields.title_status ?? undefined,
        p_mutation_status: fields.mutation_status ?? undefined,
        p_original_owner: fields.original_owner ?? undefined,
        p_legal_heir_notes: fields.legal_heir_notes ?? undefined,
        p_rental_status: fields.rental_status ?? undefined,
        p_occupancy: fields.occupancy ?? undefined,
        p_encumbrance_status: fields.encumbrance_status ?? undefined,
        p_encumbrance_notes: fields.encumbrance_notes ?? undefined,
        p_dispute_status: fields.dispute_status ?? undefined,
        p_registration_details: fields.registration_details ?? undefined,
        p_valuation_confidence: values.valuationConfidence,
        p_valuation_appraiser: values.valuationAppraiser ?? undefined,
      });
      if (response.error) {
        throw mapSupabaseError(response.error);
      }
      return response.data;
    },
    activityEvent: ({ output }) => ({
      householdId,
      eventType: "asset.created",
      entityType: "asset",
      entityId: output.id,
      metadata: { assetGroup: output.asset_group, category: output.category },
    }),
    revalidatePaths: assetRevalidatePaths(),
  });
}

export async function updateAssetAction(
  householdId: string,
  assetId: string,
  input: AssetFieldsInput,
): Promise<ActionResult<AssetRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: assetFieldsSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const fields = toAssetFieldsArgs(values);
      const response = await supabase
        .from("assets")
        .update(fields)
        .eq("id", assetId)
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
      eventType: "asset.updated",
      entityType: "asset",
      entityId: output.id,
    }),
    revalidatePaths: assetRevalidatePaths(assetId),
  });
}

export async function deleteAssetAction(
  householdId: string,
  input: DeleteAssetInput,
): Promise<ActionResult<{ id: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: ["owner", "admin"],
    schema: deleteAssetSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const response = await supabase
        .from("assets")
        .delete()
        .eq("id", values.assetId)
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
      eventType: "asset.deleted",
      entityType: "asset",
      entityId: values.assetId,
    }),
    revalidatePaths: assetRevalidatePaths(),
  });
}

/**
 * Records a new valuation snapshot — never edits the asset row or any
 * existing snapshot (PROMPT 27: "asset values use snapshots"). A
 * single-table insert, no RPC needed.
 */
export async function recordAssetValuationAction(
  householdId: string,
  input: RecordAssetValuationInput,
): Promise<ActionResult<AssetValuationSnapshotRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordAssetValuationSchema,
    input,
    run: async ({ supabase, input: values }) => {
      const asset = await fetchAsset(supabase, householdId, values.assetId);
      const valueMinorUnits = parseDecimalToMinorUnits(
        values.value,
        asset.currency_code,
      );

      const response = await supabase
        .from("asset_valuation_snapshots")
        .insert({
          household_id: householdId,
          asset_id: values.assetId,
          as_of_date: values.asOfDate,
          value_minor_units: valueMinorUnits,
          currency_code: asset.currency_code,
          source: values.source,
          confidence: values.confidence,
          appraiser: values.appraiser ?? null,
          notes: values.notes ?? null,
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
      eventType: "asset.valuation_recorded",
      entityType: "asset",
      entityId: values.assetId,
      metadata: {
        snapshotId: output.id,
        valueMinorUnits: output.value_minor_units,
      },
    }),
    revalidatePaths: assetRevalidatePaths(input.assetId),
  });
}

/**
 * Records asset-generated income (rent, etc.) as a real `kind = 'income'`
 * transaction tagged with `asset_id` — PROMPT 28: "income generated links
 * to cash flow." A single-table insert, no RPC needed (there is no second
 * table to keep in sync, unlike a claim settlement's linked-transaction +
 * status pair).
 */
export async function recordAssetIncomeAction(
  householdId: string,
  input: RecordAssetIncomeInput,
): Promise<ActionResult<AssetIncomeTransaction>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: recordAssetIncomeSchema,
    input,
    run: async ({ supabase, input: values }) => {
      await fetchAsset(supabase, householdId, values.assetId);

      const accountResponse = await supabase
        .from("financial_accounts")
        .select("currency_code")
        .eq("id", values.accountId)
        .eq("household_id", householdId)
        .maybeSingle();
      if (accountResponse.error) {
        throw mapSupabaseError(accountResponse.error);
      }
      if (!accountResponse.data) {
        throw new NotFoundError("Account not found.");
      }

      const amountMinorUnits = parseDecimalToMinorUnits(
        values.amount,
        accountResponse.data.currency_code,
      );

      const response = await supabase
        .from("transactions")
        .insert({
          household_id: householdId,
          kind: "income",
          amount_minor_units: amountMinorUnits,
          currency_code: accountResponse.data.currency_code,
          transaction_date: values.incomeDate,
          account_id: values.accountId,
          category_id: values.categoryId || null,
          asset_id: values.assetId,
          status: "cleared",
          source_type: "manual",
          description: values.notes ?? undefined,
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
      eventType: "asset.income_recorded",
      entityType: "asset",
      entityId: values.assetId,
      metadata: {
        transactionId: output.id,
        amountMinorUnits: output.amount_minor_units,
      },
    }),
    revalidatePaths: [
      ...assetRevalidatePaths(input.assetId),
      "/app/cash-flow",
      "/app/income",
      "/app/accounts",
    ],
  });
}

/**
 * The one field the list query never fetches (PROMPT 28: "do not store
 * precise location publicly" — see ASSET_LIST_SELECT in queries.ts).
 * AssetDialog calls this when opening in edit mode, regardless of whether
 * it was opened from the list page or the detail page, so the edit form
 * is always seeded with the real current value — never silently blanked
 * out and overwritten with null just because the list-sourced AssetRow
 * it was opened with never carried this field in the first place.
 */
export async function getAssetLocationPreciseAction(
  householdId: string,
  assetId: string,
): Promise<ActionResult<string | null>> {
  const parsed = uuidSchema.safeParse(assetId);
  if (!parsed.success) {
    return actionError("Invalid asset id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const response = await supabase
      .from("assets")
      .select("location_precise")
      .eq("id", parsed.data)
      .eq("household_id", householdId)
      .maybeSingle();
    if (response.error) {
      throw mapSupabaseError(response.error);
    }
    if (!response.data) {
      throw new NotFoundError();
    }
    return actionOk(response.data.location_precise);
  } catch (error) {
    // Never log `location_precise` itself — see docs/observability.md.
    return actionError(
      reportActionError(error, "assets.get_location_precise", {
        householdId,
        assetId: parsed.data,
      }),
    );
  }
}

/**
 * Attaches an already-uploaded Storage object to an asset as supporting
 * documentation. The browser uploads the file bytes directly; this only
 * records the resulting path — same split as attachClaimDocumentAction
 * (src/features/insurance/claims-actions.ts).
 */
export async function attachAssetDocumentAction(
  householdId: string,
  input: AttachAssetDocumentInput,
): Promise<ActionResult<AssetDocumentRecord>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: attachAssetDocumentSchema,
    input,
    actionName: "assets.attach_document",
    run: async ({ supabase, input: values }) => {
      await fetchAsset(supabase, householdId, values.assetId);

      const response = await supabase
        .from("attachments")
        .insert({
          household_id: householdId,
          attachable_type: "asset",
          attachable_id: values.assetId,
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
      eventType: "asset.document_attached",
      entityType: "asset",
      entityId: values.assetId,
      metadata: { attachmentId: output.id },
    }),
    revalidatePaths: assetRevalidatePaths(input.assetId),
  });
}

const assetDocumentIdSchema = z.object({ attachmentId: uuidSchema });

export async function removeAssetDocumentAction(
  householdId: string,
  attachmentId: string,
): Promise<ActionResult<undefined>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: assetDocumentIdSchema,
    input: { attachmentId },
    run: async ({ supabase, input: values }) => {
      const attachmentResponse = await supabase
        .from("attachments")
        .select("storage_bucket, storage_path")
        .eq("id", values.attachmentId)
        .eq("household_id", householdId)
        .eq("attachable_type", "asset")
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
      eventType: "asset.document_removed",
      entityType: "attachment",
      entityId: attachmentId,
    }),
    revalidatePaths: assetRevalidatePaths(),
  });
}

/** An asset's currently-attached documents — fetched lazily by AssetDialog only when opened in edit mode, same convention as getClaimDocumentsAction. */
export async function getAssetDocumentsAction(
  householdId: string,
  assetId: string,
): Promise<ActionResult<AssetDocumentRecord[]>> {
  const parsed = uuidSchema.safeParse(assetId);
  if (!parsed.success) {
    return actionError("Invalid asset id.");
  }

  try {
    await requireHouseholdRole(householdId, [...READ_ROLES]);
    const supabase = await createClient();
    const documents = await listAssetDocuments(
      supabase,
      householdId,
      parsed.data,
    );
    return actionOk(documents);
  } catch (error) {
    return actionError(
      reportActionError(error, "assets.get_documents", {
        householdId,
        assetId: parsed.data,
      }),
    );
  }
}

/** A short-lived signed URL to view/download one asset document — never a permanent public link (see docs/security-model.md §5). */
export async function getAssetDocumentUrlAction(
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
      .eq("attachable_type", "asset")
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
    // Never log `url` itself — it's a short-lived signed download link.
    return actionError(
      reportActionError(error, "assets.get_document_url", {
        householdId,
        attachmentId: parsed.data,
      }),
    );
  }
}
