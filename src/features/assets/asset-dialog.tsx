"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { DownloadIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { toIsoDateString } from "@/lib/dates";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  ACQUISITION_TYPE_LABELS,
  AREA_UNIT_LABELS,
  ASSET_CATEGORIES_BY_GROUP,
  ASSET_CATEGORY_LABELS,
  ASSET_GROUP_LABELS,
  DISPUTE_STATUS_LABELS,
  ENCUMBRANCE_STATUS_LABELS,
  LIQUIDITY_CLASSIFICATION_LABELS,
  MUTATION_STATUS_LABELS,
  OCCUPANCY_STATUS_LABELS,
  OWNERSHIP_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  RENTAL_STATUS_LABELS,
  TITLE_STATUS_LABELS,
  VALUATION_CONFIDENCE_LABELS,
  assetFieldsSchema,
  assetGroupSchema,
  createAssetSchema,
  type AcquisitionType,
  type AreaUnit,
  type AssetCategory,
  type AssetGroup,
  type CreateAssetInput,
  type DisputeStatus,
  type EncumbranceStatus,
  type LiquidityClassification,
  type MutationStatus,
  type OccupancyStatus,
  type OwnershipStatus,
  type PropertyType,
  type RentalStatus,
  type TitleStatus,
  type ValuationConfidence,
} from "@/lib/validation/assets";
import {
  attachAssetDocumentAction,
  createAssetAction,
  getAssetDocumentsAction,
  getAssetDocumentUrlAction,
  getAssetLocationPreciseAction,
  removeAssetDocumentAction,
  updateAssetAction,
} from "./actions";
import type { AssetDocumentRecord, AssetRow } from "./queries";

export type SelectOption = { id: string; label: string };

type AssetDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accepts either a list-page row or a detail-page record — locationPrecise is fetched fresh via getAssetLocationPreciseAction regardless of which one this was opened with, so it's never accidentally blanked out. */
  asset?: (AssetRow & { locationPrecise?: string | null }) | null;
  people: SelectOption[];
  loans: SelectOption[];
  onSaved?: () => void;
};

const ASSET_GROUP_OPTIONS = Object.entries(ASSET_GROUP_LABELS) as [
  AssetGroup,
  string,
][];
const ACQUISITION_TYPE_OPTIONS = Object.entries(ACQUISITION_TYPE_LABELS) as [
  AcquisitionType,
  string,
][];
const OWNERSHIP_STATUS_OPTIONS = Object.entries(OWNERSHIP_STATUS_LABELS) as [
  OwnershipStatus,
  string,
][];
const LIQUIDITY_OPTIONS = Object.entries(LIQUIDITY_CLASSIFICATION_LABELS) as [
  LiquidityClassification,
  string,
][];
const PROPERTY_TYPE_OPTIONS = Object.entries(PROPERTY_TYPE_LABELS) as [
  PropertyType,
  string,
][];
const AREA_UNIT_OPTIONS = Object.entries(AREA_UNIT_LABELS) as [
  AreaUnit,
  string,
][];
const TITLE_STATUS_OPTIONS = Object.entries(TITLE_STATUS_LABELS) as [
  TitleStatus,
  string,
][];
const MUTATION_STATUS_OPTIONS = Object.entries(MUTATION_STATUS_LABELS) as [
  MutationStatus,
  string,
][];
const RENTAL_STATUS_OPTIONS = Object.entries(RENTAL_STATUS_LABELS) as [
  RentalStatus,
  string,
][];
const OCCUPANCY_STATUS_OPTIONS = Object.entries(OCCUPANCY_STATUS_LABELS) as [
  OccupancyStatus,
  string,
][];
const ENCUMBRANCE_STATUS_OPTIONS = Object.entries(
  ENCUMBRANCE_STATUS_LABELS,
) as [EncumbranceStatus, string][];
const DISPUTE_STATUS_OPTIONS = Object.entries(DISPUTE_STATUS_LABELS) as [
  DisputeStatus,
  string,
][];
const VALUATION_CONFIDENCE_OPTIONS = Object.entries(
  VALUATION_CONFIDENCE_LABELS,
) as [ValuationConfidence, string][];

function toDefaultValues(
  source?: (AssetRow & { locationPrecise?: string | null }) | null,
): CreateAssetInput {
  return {
    name: source?.name ?? "",
    assetGroup: (source?.asset_group as AssetGroup) ?? "movable",
    category: (source?.category as AssetCategory) ?? "vehicle",
    ownerPersonId: source?.owner_person_id ?? "",
    ownershipPercentage: source ? String(source.ownership_percentage) : "100",
    ownershipStatus:
      (source?.ownership_status as OwnershipStatus) ?? "confirmed",
    acquisitionType:
      (source?.acquisition_type as AcquisitionType) ?? "purchased",
    acquisitionDate: source?.acquisition_date ?? toIsoDateString(new Date()),
    acquisitionValue:
      source && source.acquisition_value_minor_units !== null
        ? String(source.acquisition_value_minor_units / 100)
        : "",
    currencyCode: source?.currency_code ?? "INR",
    location: source?.location ?? null,
    condition: source?.condition ?? null,
    generatesIncome: source?.generates_income ?? false,
    incomeNotes: source?.income_notes ?? null,
    relatedLoanId: source?.related_loan_id ?? null,
    includeInNetWorth: source?.include_in_net_worth ?? true,
    liquidityClassification:
      (source?.liquidity_classification as LiquidityClassification) ??
      "semi_liquid",
    notes: source?.notes ?? null,
    estimatedValue:
      source && source.latestValueMinorUnits !== null
        ? String(source.latestValueMinorUnits / 100)
        : "",
    valuationDate: source?.latestValuationDate ?? toIsoDateString(new Date()),
    valuationConfidence: "unverified",
    valuationAppraiser: null,
    // Property-specific (PROMPT 28)
    propertyType: (source?.property_type as PropertyType) ?? null,
    locationPrecise: source?.locationPrecise ?? null,
    landArea:
      source && source.land_area !== null ? String(source.land_area) : "",
    areaUnit: (source?.area_unit as AreaUnit) ?? null,
    ownershipShareNotes: source?.ownership_share_notes ?? null,
    titleStatus: (source?.title_status as TitleStatus) ?? null,
    mutationStatus: (source?.mutation_status as MutationStatus) ?? null,
    originalOwner: source?.original_owner ?? null,
    legalHeirNotes: source?.legal_heir_notes ?? null,
    rentalStatus: (source?.rental_status as RentalStatus) ?? null,
    occupancy: (source?.occupancy as OccupancyStatus) ?? null,
    encumbranceStatus:
      (source?.encumbrance_status as EncumbranceStatus) ?? null,
    encumbranceNotes: source?.encumbrance_notes ?? null,
    disputeStatus: (source?.dispute_status as DisputeStatus) ?? null,
    registrationDetails: source?.registration_details ?? null,
  };
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create/edit dialog for an asset (PROMPT 27). Only the create path
 * collects an initial value/valuation date (written atomically with the
 * asset via create_asset) — editing never touches valuation history; use
 * "Record valuation" on the detail page for a later re-valuation instead.
 * Category options are filtered to the selected asset group, mirroring
 * assets_category_matches_group in the migration.
 */
export function AssetDialog({
  householdId,
  open,
  onOpenChange,
  asset,
  people,
  loans,
  onSaved,
}: AssetDialogProps) {
  const isEditing = Boolean(asset);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<AssetDocumentRecord[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateAssetInput>({
    resolver: (isEditing
      ? zodResolver(assetFieldsSchema)
      : zodResolver(createAssetSchema)) as Resolver<CreateAssetInput>,
    defaultValues: toDefaultValues(asset),
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    reset(toDefaultValues(asset));
    if (!asset) {
      setDocuments([]);
      return;
    }
    let cancelled = false;
    void getAssetDocumentsAction(householdId, asset.id).then((result) => {
      if (!cancelled && result.ok) {
        setDocuments(result.data);
      }
    });
    // The precise location is never part of a list-page AssetRow (see
    // ASSET_LIST_SELECT) — fetch it fresh on every edit-open, regardless
    // of whether this dialog was opened from the list or the detail page,
    // so the field is never silently blanked out and overwritten with
    // null on save.
    void getAssetLocationPreciseAction(householdId, asset.id).then((result) => {
      if (!cancelled && result.ok) {
        setValue("locationPrecise", result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, asset, householdId, reset, setValue]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  const assetGroup = watch("assetGroup");
  const categoryOptions = ASSET_CATEGORIES_BY_GROUP[assetGroup] ?? [];

  function handleGroupChange(group: string) {
    const parsedGroup = assetGroupSchema.parse(group);
    setValue("assetGroup", parsedGroup);
    const validCategories = ASSET_CATEGORIES_BY_GROUP[parsedGroup];
    const currentCategory = watch("category");
    if (!validCategories.includes(currentCategory)) {
      setValue("category", validCategories[0] as AssetCategory);
    }
  }

  function onSubmit(values: CreateAssetInput) {
    setFormError(null);
    startTransition(async () => {
      const result =
        isEditing && asset
          ? await updateAssetAction(householdId, asset.id, values)
          : await createAssetAction(householdId, values);

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      toast.success(isEditing ? "Asset updated" : "Asset added");
      handleOpenChange(false);
      onSaved?.();
    });
  }

  async function handleDocumentUpload(file: File) {
    if (!asset) {
      return;
    }
    setIsUploading(true);
    try {
      const browserSupabase = createBrowserClient();
      const path = `${householdId}/assets/${asset.id}/${crypto.randomUUID()}-${file.name}`;
      const uploadResult = await browserSupabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadResult.error) {
        toast.error("Could not upload the document. Please try again.");
        return;
      }

      const result = await attachAssetDocumentAction(householdId, {
        assetId: asset.id,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || null,
        sizeBytes: file.size,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDocuments((prev) => [result.data, ...prev]);
      toast.success("Document attached");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDocumentView(attachmentId: string) {
    const result = await getAssetDocumentUrlAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  async function handleDocumentRemove(attachmentId: string) {
    const result = await removeAssetDocumentAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== attachmentId));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit asset" : "Add asset"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Editing never changes valuation history — use “Record valuation” on the detail page to log a new value."
              : "Movable, immovable, or business property this household owns or expects to own."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FormErrorMessage message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assetGroup">Group</Label>
              <NativeSelect
                id="assetGroup"
                value={assetGroup}
                onChange={(event) => handleGroupChange(event.target.value)}
              >
                {ASSET_GROUP_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <NativeSelect id="category" {...register("category")}>
                {categoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {ASSET_CATEGORY_LABELS[value as AssetCategory]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownerPersonId">Owner</Label>
              <NativeSelect
                id="ownerPersonId"
                aria-invalid={!!errors.ownerPersonId}
                {...register("ownerPersonId")}
              >
                <option value="">Select an owner</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </NativeSelect>
              <FormErrorMessage message={errors.ownerPersonId?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ownershipPercentage">Ownership %</Label>
              <Input
                id="ownershipPercentage"
                inputMode="decimal"
                aria-invalid={!!errors.ownershipPercentage}
                {...register("ownershipPercentage")}
              />
              <FormErrorMessage message={errors.ownershipPercentage?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ownershipStatus">Ownership status</Label>
              <NativeSelect
                id="ownershipStatus"
                {...register("ownershipStatus")}
              >
                {OWNERSHIP_STATUS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="liquidityClassification">Liquidity</Label>
              <NativeSelect
                id="liquidityClassification"
                {...register("liquidityClassification")}
              >
                {LIQUIDITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="acquisitionType">Acquisition type</Label>
              <NativeSelect
                id="acquisitionType"
                {...register("acquisitionType")}
              >
                {ACQUISITION_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisitionDate">Acquisition date</Label>
              <Input
                id="acquisitionDate"
                type="date"
                aria-invalid={!!errors.acquisitionDate}
                {...register("acquisitionDate")}
              />
              <FormErrorMessage message={errors.acquisitionDate?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisitionValue">
                Acquisition value (optional)
              </Label>
              <Input
                id="acquisitionValue"
                inputMode="decimal"
                {...register("acquisitionValue")}
              />
            </div>
          </div>

          {!isEditing && (
            <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label htmlFor="currencyCode">Currency</Label>
                <Input
                  id="currencyCode"
                  maxLength={3}
                  aria-invalid={!!errors.currencyCode}
                  {...register("currencyCode")}
                />
                <FormErrorMessage message={errors.currencyCode?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedValue">Estimated current value</Label>
                <Input
                  id="estimatedValue"
                  inputMode="decimal"
                  aria-invalid={!!errors.estimatedValue}
                  {...register("estimatedValue")}
                />
                <FormErrorMessage message={errors.estimatedValue?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valuationDate">Valuation date</Label>
                <Input
                  id="valuationDate"
                  type="date"
                  aria-invalid={!!errors.valuationDate}
                  {...register("valuationDate")}
                />
                <FormErrorMessage message={errors.valuationDate?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valuationConfidence">
                  Valuation confidence
                </Label>
                <NativeSelect
                  id="valuationConfidence"
                  {...register("valuationConfidence")}
                >
                  {VALUATION_CONFIDENCE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="valuationAppraiser">Appraiser (optional)</Label>
                <Input
                  id="valuationAppraiser"
                  placeholder="Named appraiser or agency"
                  {...register("valuationAppraiser")}
                />
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="location">
                General location (optional){" "}
                <span className="text-muted-foreground font-normal">
                  — safe to show in lists
                </span>
              </Label>
              <Input
                id="location"
                placeholder="e.g. Pune, Maharashtra"
                {...register("location")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="condition">Condition (optional)</Label>
              <Input id="condition" {...register("condition")} />
            </div>
          </div>

          {assetGroup === "immovable" && (
            <div className="space-y-4 rounded-lg border border-dashed p-3">
              <div>
                <p className="text-sm font-medium">Property details</p>
                <p className="text-muted-foreground text-xs">
                  Never shown in the assets list or search results — visible
                  only here and on this property&rsquo;s own detail page.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="propertyType">Property type (optional)</Label>
                  <NativeSelect id="propertyType" {...register("propertyType")}>
                    <option value="">Not set</option>
                    {PROPERTY_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="locationPrecise">
                    Precise location (optional, private)
                  </Label>
                  <Input
                    id="locationPrecise"
                    placeholder="Full address"
                    {...register("locationPrecise")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="landArea">Land area (optional)</Label>
                  <Input
                    id="landArea"
                    inputMode="decimal"
                    {...register("landArea")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="areaUnit">Area unit (optional)</Label>
                  <NativeSelect id="areaUnit" {...register("areaUnit")}>
                    <option value="">Not set</option>
                    {AREA_UNIT_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="titleStatus">Title status (optional)</Label>
                  <NativeSelect id="titleStatus" {...register("titleStatus")}>
                    <option value="">Not set</option>
                    {TITLE_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mutationStatus">
                    Mutation status (optional)
                  </Label>
                  <NativeSelect
                    id="mutationStatus"
                    {...register("mutationStatus")}
                  >
                    <option value="">Not set</option>
                    {MUTATION_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rentalStatus">Rental status (optional)</Label>
                  <NativeSelect id="rentalStatus" {...register("rentalStatus")}>
                    <option value="">Not set</option>
                    {RENTAL_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="occupancy">Occupancy (optional)</Label>
                  <NativeSelect id="occupancy" {...register("occupancy")}>
                    <option value="">Not set</option>
                    {OCCUPANCY_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="encumbranceStatus">
                    Encumbrance (optional)
                  </Label>
                  <NativeSelect
                    id="encumbranceStatus"
                    {...register("encumbranceStatus")}
                  >
                    <option value="">Not set</option>
                    {ENCUMBRANCE_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disputeStatus">
                    Dispute status (optional)
                  </Label>
                  <NativeSelect
                    id="disputeStatus"
                    {...register("disputeStatus")}
                  >
                    <option value="">Not set</option>
                    {DISPUTE_STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="originalOwner">
                    Original owner (optional)
                  </Label>
                  <Input id="originalOwner" {...register("originalOwner")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ownershipShareNotes">
                    Ownership share notes (optional)
                  </Label>
                  <Input
                    id="ownershipShareNotes"
                    placeholder="e.g. 1/3rd share per family settlement"
                    {...register("ownershipShareNotes")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="legalHeirNotes">
                    Legal-heir notes (optional)
                  </Label>
                  <Input id="legalHeirNotes" {...register("legalHeirNotes")} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="encumbranceNotes">
                    Encumbrance notes (optional)
                  </Label>
                  <Input
                    id="encumbranceNotes"
                    {...register("encumbranceNotes")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="registrationDetails">
                    Registration details (optional)
                  </Label>
                  <Input
                    id="registrationDetails"
                    {...register("registrationDetails")}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="relatedLoanId">Related loan (optional)</Label>
              <NativeSelect id="relatedLoanId" {...register("relatedLoanId")}>
                <option value="">None</option>
                {loans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="incomeNotes">Income generated (optional)</Label>
              <Input
                id="incomeNotes"
                placeholder="e.g. ₹15,000/month rental"
                {...register("incomeNotes")}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input size-4 rounded"
                {...register("generatesIncome")}
              />
              Generates income
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-input size-4 rounded"
                {...register("includeInNetWorth")}
              />
              Include in net worth
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          <div className="space-y-2">
            <Label>Documents</Label>
            {!asset ? (
              <p className="text-muted-foreground text-xs">
                Save the asset first, then come back here to attach supporting
                documents (deeds, receipts, valuation reports).
              </p>
            ) : (
              <div className="space-y-2">
                {documents.length > 0 && (
                  <ul className="space-y-1.5">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                      >
                        <span className="truncate">
                          {document.file_name}
                          {document.size_bytes ? (
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {formatFileSize(document.size_bytes)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDocumentView(document.id)}
                            aria-label={`View ${document.file_name}`}
                          >
                            <DownloadIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDocumentRemove(document.id)}
                            aria-label={`Remove ${document.file_name}`}
                          >
                            <XIcon />
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="border-input hover:bg-accent/50 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                  <UploadIcon className="size-4" />
                  {isUploading ? "Uploading…" : "Upload a document"}
                  <input
                    type="file"
                    className="sr-only"
                    disabled={isUploading}
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void handleDocumentUpload(file);
                      }
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Add asset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
