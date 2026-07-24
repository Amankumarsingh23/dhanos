"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import {
  isOwnershipUncertain,
  isValuationConfidenceVerified,
  type ValuationConfidence as CalcValuationConfidence,
} from "@/lib/calculations/assets";
import {
  ACQUISITION_TYPE_LABELS,
  AREA_UNIT_LABELS,
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
  VALUATION_SOURCE_LABELS,
  type AcquisitionType,
  type AreaUnit,
  type AssetCategory,
  type AssetGroup,
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
  type ValuationSource,
} from "@/lib/validation/assets";
import { getAssetDocumentUrlAction } from "./actions";
import { AssetDialog, type SelectOption } from "./asset-dialog";
import { RecordAssetIncomeDialog } from "./record-asset-income-dialog";
import { RecordValuationDialog } from "./record-valuation-dialog";
import type {
  AssetDetail,
  AssetDocumentRecord,
  AssetIncomeTransaction,
} from "./queries";

type AssetDetailViewProps = {
  householdId: string;
  asset: AssetDetail;
  documents: AssetDocumentRecord[];
  incomeTransactions: AssetIncomeTransaction[];
  people: SelectOption[];
  loans: SelectOption[];
  accounts: SelectOption[];
};

function statusBadgeVariant(
  status: OwnershipStatus,
): "secondary" | "outline" | "destructive" {
  if (isOwnershipUncertain(status)) return "destructive";
  if (status === "confirmed") return "secondary";
  return "outline";
}

export function AssetDetailView({
  householdId,
  asset,
  documents,
  incomeTransactions,
  people,
  loans,
  accounts,
}: AssetDetailViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);

  const money = (amountMinorUnits: number) =>
    formatMoney({ amountMinorUnits, currencyCode: asset.currency_code });

  const uncertain = isOwnershipUncertain(
    asset.ownership_status as OwnershipStatus,
  );

  const latestValuation = asset.valuationHistory[0];
  const latestValuationIsEstimate =
    latestValuation !== undefined &&
    !isValuationConfidenceVerified(
      latestValuation.confidence as CalcValuationConfidence,
    );
  const isProperty = asset.asset_group === "immovable";

  async function handleDocumentView(attachmentId: string) {
    const result = await getAssetDocumentUrlAction(householdId, attachmentId);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-6">
      {uncertain && (
        <Alert variant="destructive">
          <AlertDescription>
            Ownership is marked{" "}
            <strong>
              {
                OWNERSHIP_STATUS_LABELS[
                  asset.ownership_status as OwnershipStatus
                ]
              }
            </strong>{" "}
            — this asset is never counted toward net worth while its ownership
            is disputed or only expected, regardless of the &ldquo;include in
            net worth&rdquo; setting.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {asset.name}
              <Badge
                variant={statusBadgeVariant(
                  asset.ownership_status as OwnershipStatus,
                )}
              >
                {
                  OWNERSHIP_STATUS_LABELS[
                    asset.ownership_status as OwnershipStatus
                  ]
                }
              </Badge>
              {!asset.include_in_net_worth && (
                <Badge variant="outline">Excluded from net worth</Badge>
              )}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {ASSET_GROUP_LABELS[asset.asset_group as AssetGroup]} ·{" "}
              {ASSET_CATEGORY_LABELS[asset.category as AssetCategory]} · Owner{" "}
              {asset.ownerName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button onClick={() => setValuationOpen(true)}>
              Record valuation
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground text-xs">Latest value</dt>
              <dd className="flex items-center gap-1.5 text-sm font-medium">
                {asset.latestValueMinorUnits !== null
                  ? money(asset.latestValueMinorUnits)
                  : "No valuation yet"}
                {latestValuationIsEstimate && (
                  <Badge variant="outline">Estimate</Badge>
                )}
              </dd>
            </div>
            <Field
              label="Valuation date"
              value={
                asset.latestValuationDate
                  ? formatDisplayDate(asset.latestValuationDate)
                  : "—"
              }
            />
            <Field
              label="Owned value"
              value={
                asset.ownedValueMinorUnits !== null
                  ? money(asset.ownedValueMinorUnits)
                  : "—"
              }
            />
            <Field
              label="Net worth contribution"
              value={money(asset.netWorthContributionMinorUnits)}
            />
            <Field label="Ownership" value={`${asset.ownership_percentage}%`} />
            <Field
              label="Acquisition"
              value={`${ACQUISITION_TYPE_LABELS[asset.acquisition_type as AcquisitionType]} · ${formatDisplayDate(asset.acquisition_date)}`}
            />
            <Field
              label="Acquisition value"
              value={
                asset.acquisition_value_minor_units !== null
                  ? money(asset.acquisition_value_minor_units)
                  : "—"
              }
            />
            <Field
              label="Liquidity"
              value={
                LIQUIDITY_CLASSIFICATION_LABELS[
                  asset.liquidity_classification as LiquidityClassification
                ]
              }
            />
            <Field label="Location" value={asset.location ?? "—"} />
            <Field label="Condition" value={asset.condition ?? "—"} />
            <Field
              label="Generates income"
              value={
                asset.generates_income ? (asset.income_notes ?? "Yes") : "No"
              }
            />
          </dl>
          {asset.notes && (
            <p className="text-muted-foreground mt-4 text-sm">{asset.notes}</p>
          )}
        </CardContent>
      </Card>

      {isProperty && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Property details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Field
                label="Property type"
                value={
                  asset.property_type
                    ? PROPERTY_TYPE_LABELS[asset.property_type as PropertyType]
                    : "—"
                }
              />
              <Field
                label="Land area"
                value={
                  asset.land_area !== null
                    ? `${asset.land_area} ${
                        asset.area_unit
                          ? AREA_UNIT_LABELS[asset.area_unit as AreaUnit]
                          : ""
                      }`
                    : "—"
                }
              />
              <Field
                label="Title status"
                value={
                  asset.title_status
                    ? TITLE_STATUS_LABELS[asset.title_status as TitleStatus]
                    : "—"
                }
              />
              <Field
                label="Mutation status"
                value={
                  asset.mutation_status
                    ? MUTATION_STATUS_LABELS[
                        asset.mutation_status as MutationStatus
                      ]
                    : "—"
                }
              />
              <Field
                label="Rental status"
                value={
                  asset.rental_status
                    ? RENTAL_STATUS_LABELS[asset.rental_status as RentalStatus]
                    : "—"
                }
              />
              <Field
                label="Occupancy"
                value={
                  asset.occupancy
                    ? OCCUPANCY_STATUS_LABELS[
                        asset.occupancy as OccupancyStatus
                      ]
                    : "—"
                }
              />
              <Field
                label="Encumbrance"
                value={
                  asset.encumbrance_status
                    ? ENCUMBRANCE_STATUS_LABELS[
                        asset.encumbrance_status as EncumbranceStatus
                      ]
                    : "—"
                }
              />
              <Field
                label="Dispute status"
                value={
                  asset.dispute_status
                    ? DISPUTE_STATUS_LABELS[
                        asset.dispute_status as DisputeStatus
                      ]
                    : "—"
                }
              />
              <Field
                label="Original owner"
                value={asset.original_owner ?? "—"}
              />
              <Field
                label="Ownership share notes"
                value={asset.ownership_share_notes ?? "—"}
              />
              <Field
                label="Registration details"
                value={asset.registration_details ?? "—"}
              />
              <div>
                <dt className="text-muted-foreground text-xs">
                  Precise location <span className="italic">(private)</span>
                </dt>
                <dd className="text-sm font-medium">
                  {asset.locationPrecise ?? "—"}
                </dd>
              </div>
            </dl>
            {(asset.legal_heir_notes || asset.encumbrance_notes) && (
              <div className="mt-4 space-y-2">
                {asset.legal_heir_notes && (
                  <p className="text-sm">
                    <span className="text-muted-foreground text-xs">
                      Legal-heir notes:{" "}
                    </span>
                    {asset.legal_heir_notes}
                  </p>
                )}
                {asset.encumbrance_notes && (
                  <p className="text-sm">
                    <span className="text-muted-foreground text-xs">
                      Encumbrance notes:{" "}
                    </span>
                    {asset.encumbrance_notes}
                  </p>
                )}
              </div>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              The precise location is never shown in the assets list or search
              results — only here, on this property&rsquo;s own detail page.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Related loan</CardTitle>
        </CardHeader>
        <CardContent>
          {!asset.relatedLoanName ? (
            <p className="text-muted-foreground text-sm">
              No loan linked to this asset.
            </p>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Field label="Loan" value={asset.relatedLoanName} />
              <Field
                label="Outstanding balance"
                value={
                  asset.relatedLoanOutstandingMinorUnits !== null &&
                  asset.relatedLoanCurrencyCode
                    ? formatMoney({
                        amountMinorUnits:
                          asset.relatedLoanOutstandingMinorUnits,
                        currencyCode: asset.relatedLoanCurrencyCode,
                      })
                    : "—"
                }
              />
            </dl>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Shown separately, always — a linked loan&rsquo;s outstanding balance
            is never subtracted from this asset&rsquo;s own value.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-medium">
            Income generated
          </CardTitle>
          <Button size="sm" onClick={() => setIncomeOpen(true)}>
            Record income
          </Button>
        </CardHeader>
        <CardContent>
          {incomeTransactions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No income recorded against this asset yet — recording income here
              writes a real transaction, visible in Cash Flow and Income
              reporting.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {incomeTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-4 py-2.5">
                        {formatDisplayDate(transaction.transaction_date)}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {formatMoney({
                          amountMinorUnits: transaction.amount_minor_units,
                          currencyCode: transaction.currency_code,
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        {transaction.description ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Valuation history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {asset.valuationHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No valuations recorded yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">As of</th>
                    <th className="px-4 py-2.5 font-medium">Value</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium">Confidence</th>
                    <th className="px-4 py-2.5 font-medium">Appraiser</th>
                    <th className="px-4 py-2.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {asset.valuationHistory.map((snapshot) => {
                    const isEstimate = !isValuationConfidenceVerified(
                      snapshot.confidence as CalcValuationConfidence,
                    );
                    return (
                      <tr key={snapshot.id}>
                        <td className="px-4 py-2.5">
                          {formatDisplayDate(snapshot.as_of_date)}
                        </td>
                        <td className="px-4 py-2.5 font-medium">
                          {formatMoney({
                            amountMinorUnits: snapshot.value_minor_units,
                            currencyCode: snapshot.currency_code,
                          })}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline">
                            {
                              VALUATION_SOURCE_LABELS[
                                snapshot.source as ValuationSource
                              ]
                            }
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant={isEstimate ? "outline" : "secondary"}>
                            {
                              VALUATION_CONFIDENCE_LABELS[
                                snapshot.confidence as ValuationConfidence
                              ]
                            }
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          {snapshot.appraiser ?? "—"}
                        </td>
                        <td className="px-4 py-2.5">{snapshot.notes ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No documents attached yet — open Edit to upload one.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <span className="truncate">{document.file_name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDocumentView(document.id)}
                    aria-label={`View ${document.file_name}`}
                  >
                    <DownloadIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AssetDialog
        householdId={householdId}
        open={editOpen}
        onOpenChange={setEditOpen}
        asset={asset}
        people={people}
        loans={loans}
        onSaved={() => router.refresh()}
      />
      <RecordValuationDialog
        householdId={householdId}
        open={valuationOpen}
        onOpenChange={setValuationOpen}
        asset={asset}
        onSaved={() => router.refresh()}
      />
      <RecordAssetIncomeDialog
        householdId={householdId}
        open={incomeOpen}
        onOpenChange={setIncomeOpen}
        assetId={asset.id}
        accounts={accounts}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
