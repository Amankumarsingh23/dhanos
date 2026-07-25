import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportDataButton } from "./export-data-button";
import { ExportCsvPanel } from "./export-csv-panel";
import type { ArchivedRecordSummaryRow } from "./queries";

type DataSectionProps = {
  householdId: string;
  archivedRecords: ArchivedRecordSummaryRow[];
  /** Owner/admin only (PROMPT 42's own security requirement — "owner/admin only for complete household export"). Hides the export controls entirely for editor/viewer rather than showing a disabled button; the Server Actions behind them re-check the same role independently. */
  canExport: boolean;
};

/** Settings > Data (PROMPT 40, export expanded by PROMPT 42): archived-record counts (each linking to its own list page), export, and honest deletion/retention explanations — no working permanent-deletion control, per the prompt's own "do not implement unsafe permanent deletion merely to complete the UI." */
export function DataSection({
  householdId,
  archivedRecords,
  canExport,
}: DataSectionProps) {
  const totalArchived = archivedRecords.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h2 className="mb-2 text-sm font-medium">Archived records</h2>
          {totalArchived === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing archived yet — nothing is ever hard-deleted in this
              app, so this list will grow as you archive/close records
              elsewhere.
            </p>
          ) : (
            <dl className="divide-border divide-y text-sm">
              {archivedRecords
                .filter((row) => row.count > 0)
                .map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-1.5"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd>
                      <Link href={row.href} className="hover:underline">
                        {row.count}
                      </Link>
                    </dd>
                  </div>
                ))}
            </dl>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">Export</h2>
          <p className="text-muted-foreground mb-3 text-sm">
            A full copy of your household&rsquo;s own data — people,
            accounts, transactions, investments, loans, insurance, goals,
            monthly reports, decisions, and everything else this app
            tracks (document/attachment file contents are not included,
            only their metadata — never an expiring signed URL). Every
            amount is an exact integer with its own currency code, every
            date is unambiguous ISO 8601, and the file states its own
            schema version — see the JSON download for the full notes.
            Owner/admin only, and rate-limited.
          </p>
          {canExport ? (
            <div className="space-y-6">
              <ExportDataButton householdId={householdId} />
              <ExportCsvPanel householdId={householdId} />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              Only the household&rsquo;s owner or an admin can export its
              data.
            </p>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-medium">
            Deletion and data retention
          </h2>
          <p className="text-muted-foreground text-sm">
            This app never permanently deletes financial history — every
            entity here uses &ldquo;archive&rdquo;/&ldquo;close&rdquo;/&ldquo;cancel&rdquo;
            instead of a hard delete, so past balances, payments, and
            valuations always
            remain reconstructable (see the Net Worth and Reports
            sections). Permanent account or household deletion isn&rsquo;t
            available from this page. If you need your data permanently
            removed, contact support — this is a deliberate limitation, not
            a missing button.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
