import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  positiveDecimalAmountSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the asset register feature (PROMPT 27,
 * src/features/assets) — see supabase/migrations/20260723110000_assets.sql
 * for the matching column definitions/check constraints.
 */

export const ASSET_GROUPS = ["movable", "immovable", "business"] as const;
export const assetGroupSchema = z.enum(ASSET_GROUPS);
export type AssetGroup = z.infer<typeof assetGroupSchema>;

export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
  movable: "Movable",
  immovable: "Immovable",
  business: "Business",
};

export const MOVABLE_CATEGORIES = [
  "vehicle",
  "machinery",
  "jewellery",
  "gold",
  "laptop",
  "phone",
  "furniture",
  "equipment",
  "collectible",
] as const;
export const IMMOVABLE_CATEGORIES = [
  "land",
  "house",
  "shop",
  "commercial_property",
  "agricultural_land",
] as const;
export const BUSINESS_CATEGORIES = [
  "machinery",
  "inventory",
  "ownership_interest",
  "intellectual_property",
  "equipment",
] as const;

/** Which category values are valid for a given group — drives the UI's group-filtered category dropdown. Mirrors assets_category_matches_group in the migration exactly. */
export const ASSET_CATEGORIES_BY_GROUP: Record<AssetGroup, readonly string[]> =
  {
    movable: MOVABLE_CATEGORIES,
    immovable: IMMOVABLE_CATEGORIES,
    business: BUSINESS_CATEGORIES,
  };

export const ASSET_CATEGORIES = [
  ...MOVABLE_CATEGORIES,
  ...IMMOVABLE_CATEGORIES,
  ...BUSINESS_CATEGORIES,
] as const;
export const assetCategorySchema = z.enum(ASSET_CATEGORIES);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

/** 'machinery'/'equipment' appear under both movable and business — one label each, disambiguated at the row level by asset_group, not by this map. */
export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  vehicle: "Vehicle",
  machinery: "Machinery",
  jewellery: "Jewellery",
  gold: "Gold",
  laptop: "Laptop",
  phone: "Phone",
  furniture: "Furniture",
  equipment: "Equipment",
  collectible: "Collectible",
  land: "Land",
  house: "House",
  shop: "Shop",
  commercial_property: "Commercial property",
  agricultural_land: "Agricultural land",
  inventory: "Inventory",
  ownership_interest: "Ownership interest",
  intellectual_property: "Intellectual property",
};

export const ACQUISITION_TYPES = [
  "purchased",
  "inherited",
  "gifted",
  "jointly_owned",
  "expected_inheritance",
  "other",
] as const;
export const acquisitionTypeSchema = z.enum(ACQUISITION_TYPES);
export type AcquisitionType = z.infer<typeof acquisitionTypeSchema>;

export const ACQUISITION_TYPE_LABELS: Record<AcquisitionType, string> = {
  purchased: "Purchased",
  inherited: "Inherited",
  gifted: "Gifted",
  jointly_owned: "Jointly owned",
  expected_inheritance: "Expected inheritance",
  other: "Other",
};

/**
 * disputed/expected are the two statuses PROMPT 27 singles out — see
 * src/lib/calculations/assets.ts's isOwnershipUncertain, always applied
 * wherever a net-worth figure is computed, never left to the UI to
 * remember.
 */
export const OWNERSHIP_STATUSES = [
  "confirmed",
  "shared",
  "transfer_pending",
  "documentation_incomplete",
  "disputed",
  "expected",
  "unknown",
] as const;
export const ownershipStatusSchema = z.enum(OWNERSHIP_STATUSES);
export type OwnershipStatus = z.infer<typeof ownershipStatusSchema>;

export const OWNERSHIP_STATUS_LABELS: Record<OwnershipStatus, string> = {
  confirmed: "Confirmed",
  shared: "Shared",
  transfer_pending: "Transfer pending",
  documentation_incomplete: "Documentation incomplete",
  disputed: "Disputed",
  expected: "Expected",
  unknown: "Unknown",
};

export const LIQUIDITY_CLASSIFICATIONS = [
  "liquid",
  "semi_liquid",
  "illiquid",
] as const;
export const liquidityClassificationSchema = z.enum(LIQUIDITY_CLASSIFICATIONS);
export type LiquidityClassification = z.infer<
  typeof liquidityClassificationSchema
>;

export const LIQUIDITY_CLASSIFICATION_LABELS: Record<
  LiquidityClassification,
  string
> = {
  liquid: "Liquid",
  semi_liquid: "Semi-liquid",
  illiquid: "Illiquid",
};

export const VALUATION_SOURCES = [
  "manual",
  "appraisal",
  "market_estimate",
  "purchase_price",
  "other",
] as const;
export const valuationSourceSchema = z.enum(VALUATION_SOURCES);
export type ValuationSource = z.infer<typeof valuationSourceSchema>;

export const VALUATION_SOURCE_LABELS: Record<ValuationSource, string> = {
  manual: "Manual estimate",
  appraisal: "Professional appraisal",
  market_estimate: "Market estimate",
  purchase_price: "Purchase price",
  other: "Other",
};

export const PROPERTY_TYPES = [
  "residential_apartment",
  "independent_house",
  "plot",
  "agricultural",
  "commercial_retail",
  "commercial_office",
  "industrial",
  "other",
] as const;
export const propertyTypeSchema = z.enum(PROPERTY_TYPES);
export type PropertyType = z.infer<typeof propertyTypeSchema>;

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  residential_apartment: "Residential apartment",
  independent_house: "Independent house",
  plot: "Plot",
  agricultural: "Agricultural",
  commercial_retail: "Commercial retail",
  commercial_office: "Commercial office",
  industrial: "Industrial",
  other: "Other",
};

export const AREA_UNITS = [
  "sqft",
  "sqm",
  "sqyd",
  "acre",
  "hectare",
  "bigha",
  "guntha",
  "cent",
] as const;
export const areaUnitSchema = z.enum(AREA_UNITS);
export type AreaUnit = z.infer<typeof areaUnitSchema>;

export const AREA_UNIT_LABELS: Record<AreaUnit, string> = {
  sqft: "sq ft",
  sqm: "sq m",
  sqyd: "sq yd",
  acre: "acre",
  hectare: "hectare",
  bigha: "bigha",
  guntha: "guntha",
  cent: "cent",
};

export const TITLE_STATUSES = [
  "clear",
  "disputed",
  "pending_verification",
  "litigation",
  "not_verified",
  "other",
] as const;
export const titleStatusSchema = z.enum(TITLE_STATUSES);
export type TitleStatus = z.infer<typeof titleStatusSchema>;

export const TITLE_STATUS_LABELS: Record<TitleStatus, string> = {
  clear: "Clear title",
  disputed: "Disputed",
  pending_verification: "Pending verification",
  litigation: "Litigation",
  not_verified: "Not verified",
  other: "Other",
};

export const MUTATION_STATUSES = [
  "mutated",
  "pending",
  "not_mutated",
  "not_applicable",
] as const;
export const mutationStatusSchema = z.enum(MUTATION_STATUSES);
export type MutationStatus = z.infer<typeof mutationStatusSchema>;

export const MUTATION_STATUS_LABELS: Record<MutationStatus, string> = {
  mutated: "Mutated",
  pending: "Pending",
  not_mutated: "Not mutated",
  not_applicable: "Not applicable",
};

export const RENTAL_STATUSES = [
  "vacant",
  "self_occupied",
  "rented",
  "partially_rented",
  "under_renovation",
] as const;
export const rentalStatusSchema = z.enum(RENTAL_STATUSES);
export type RentalStatus = z.infer<typeof rentalStatusSchema>;

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  vacant: "Vacant",
  self_occupied: "Self-occupied",
  rented: "Rented",
  partially_rented: "Partially rented",
  under_renovation: "Under renovation",
};

export const OCCUPANCY_STATUSES = [
  "owner_occupied",
  "family_occupied",
  "tenant_occupied",
  "vacant",
  "caretaker",
  "other",
] as const;
export const occupancyStatusSchema = z.enum(OCCUPANCY_STATUSES);
export type OccupancyStatus = z.infer<typeof occupancyStatusSchema>;

export const OCCUPANCY_STATUS_LABELS: Record<OccupancyStatus, string> = {
  owner_occupied: "Owner-occupied",
  family_occupied: "Family-occupied",
  tenant_occupied: "Tenant-occupied",
  vacant: "Vacant",
  caretaker: "Caretaker",
  other: "Other",
};

export const ENCUMBRANCE_STATUSES = [
  "none",
  "mortgaged",
  "lien",
  "attached",
  "other",
] as const;
export const encumbranceStatusSchema = z.enum(ENCUMBRANCE_STATUSES);
export type EncumbranceStatus = z.infer<typeof encumbranceStatusSchema>;

export const ENCUMBRANCE_STATUS_LABELS: Record<EncumbranceStatus, string> = {
  none: "None",
  mortgaged: "Mortgaged",
  lien: "Lien",
  attached: "Attached",
  other: "Other",
};

export const DISPUTE_STATUSES = [
  "none",
  "boundary_dispute",
  "litigation",
  "family_dispute",
  "other",
] as const;
export const disputeStatusSchema = z.enum(DISPUTE_STATUSES);
export type DisputeStatus = z.infer<typeof disputeStatusSchema>;

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  none: "None",
  boundary_dispute: "Boundary dispute",
  litigation: "Litigation",
  family_dispute: "Family dispute",
  other: "Other",
};

/**
 * How sure a valuation figure is — PROMPT 28's "unverified valuations are
 * labeled estimates." Anything short of `verified` renders an "Estimate"
 * badge everywhere the value is shown — see
 * src/lib/calculations/assets.ts's isValuationConfidenceVerified.
 */
export const VALUATION_CONFIDENCE_LEVELS = [
  "verified",
  "professional",
  "informal_estimate",
  "unverified",
] as const;
export const valuationConfidenceSchema = z.enum(VALUATION_CONFIDENCE_LEVELS);
export type ValuationConfidence = z.infer<typeof valuationConfidenceSchema>;

export const VALUATION_CONFIDENCE_LABELS: Record<ValuationConfidence, string> =
  {
    verified: "Verified",
    professional: "Professional appraisal",
    informal_estimate: "Informal estimate",
    unverified: "Unverified",
  };

const optionalTextSchema = z.string().trim().max(500).nullable().optional();
const notesSchema = z.string().trim().max(2000).nullable().optional();

/**
 * The descriptive/ownership/acquisition field set shared by create and
 * edit. Deliberately excludes value/valuation fields — an asset's current
 * value always comes from asset_valuation_snapshots (see
 * recordAssetValuationSchema below), never edited in place here, even at
 * creation time (createAssetSchema extends this with the one-time initial
 * snapshot inputs instead).
 */
export const assetFieldsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(200, "Name is too long"),
    assetGroup: assetGroupSchema,
    category: assetCategorySchema,
    ownerPersonId: z.string().min(1, "Select an owner"),
    ownershipPercentage: z
      .string()
      .trim()
      .min(1, "Enter the ownership percentage")
      .refine((value) => {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 && n <= 100;
      }, "Ownership percentage must be greater than 0 and at most 100"),
    ownershipStatus: ownershipStatusSchema,
    acquisitionType: acquisitionTypeSchema,
    acquisitionDate: isoDateStringSchema,
    acquisitionValue: z.string().trim().max(30).nullable().optional(),
    currencyCode: currencyCodeSchema,
    location: optionalTextSchema,
    condition: optionalTextSchema,
    generatesIncome: z.boolean().default(false),
    incomeNotes: optionalTextSchema,
    relatedLoanId: z.string().nullable().optional(),
    includeInNetWorth: z.boolean().default(true),
    liquidityClassification: liquidityClassificationSchema,
    notes: notesSchema,
    // Property-specific (PROMPT 28) — nullable/optional regardless of
    // assetGroup at the schema layer, collected in the UI only when
    // assetGroup = 'immovable', same convention as loans' education
    // fields / insurance's health fields.
    propertyType: propertyTypeSchema.nullable().optional(),
    locationPrecise: optionalTextSchema,
    landArea: z.string().trim().max(20).nullable().optional(),
    areaUnit: areaUnitSchema.nullable().optional(),
    ownershipShareNotes: notesSchema,
    titleStatus: titleStatusSchema.nullable().optional(),
    mutationStatus: mutationStatusSchema.nullable().optional(),
    originalOwner: optionalTextSchema,
    legalHeirNotes: notesSchema,
    rentalStatus: rentalStatusSchema.nullable().optional(),
    occupancy: occupancyStatusSchema.nullable().optional(),
    encumbranceStatus: encumbranceStatusSchema.nullable().optional(),
    encumbranceNotes: notesSchema,
    disputeStatus: disputeStatusSchema.nullable().optional(),
    registrationDetails: notesSchema,
  })
  .refine(
    (values) =>
      (
        ASSET_CATEGORIES_BY_GROUP[values.assetGroup] as readonly string[]
      ).includes(values.category),
    {
      message: "Select a category that belongs to this asset group",
      path: ["category"],
    },
  );
export type AssetFieldsInput = z.input<typeof assetFieldsSchema>;

export const createAssetSchema = assetFieldsSchema.and(
  z.object({
    estimatedValue: z
      .string()
      .trim()
      .min(1, "Enter the estimated current value"),
    valuationDate: isoDateStringSchema,
    valuationConfidence: valuationConfidenceSchema.default("unverified"),
    valuationAppraiser: optionalTextSchema,
  }),
);
export type CreateAssetInput = z.input<typeof createAssetSchema>;

export type AssetFilters = {
  search?: string;
  assetGroup?: AssetGroup;
  ownershipStatus?: OwnershipStatus;
};

export const recordAssetValuationSchema = z.object({
  assetId: uuidSchema,
  value: positiveDecimalAmountSchema("Enter the value"),
  asOfDate: isoDateStringSchema,
  source: valuationSourceSchema,
  confidence: valuationConfidenceSchema,
  appraiser: optionalTextSchema,
  notes: notesSchema,
});
export type RecordAssetValuationInput = z.input<
  typeof recordAssetValuationSchema
>;

/**
 * Records asset-generated income (e.g. rent) as a real transaction —
 * PROMPT 28: "income generated links to cash flow." A single-table insert
 * (transactions.asset_id, kind = income), no RPC needed.
 */
export const recordAssetIncomeSchema = z.object({
  assetId: uuidSchema,
  accountId: z.string().min(1, "Select an account"),
  categoryId: z.string().nullable().optional(),
  amount: positiveDecimalAmountSchema("Enter the amount"),
  incomeDate: isoDateStringSchema,
  notes: notesSchema,
});
export type RecordAssetIncomeInput = z.input<typeof recordAssetIncomeSchema>;

export const deleteAssetSchema = z.object({
  assetId: uuidSchema,
});
export type DeleteAssetInput = z.input<typeof deleteAssetSchema>;

/**
 * Attaches an already-uploaded Storage object to an asset as supporting
 * documentation — same "browser uploads bytes directly, this only records
 * the resulting path" split as attachClaimDocumentSchema
 * (src/lib/validation/insurance.ts).
 */
export const attachAssetDocumentSchema = z.object({
  assetId: uuidSchema,
  storagePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(200).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
});
export type AttachAssetDocumentInput = z.input<
  typeof attachAssetDocumentSchema
>;
