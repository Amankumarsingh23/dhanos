import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney } from "@/lib/money";
import type {
  EmiCalendarEntry,
  EmiCalendarStatus,
} from "@/lib/calculations/debt-trend";
import { formatMonthLabel } from "./charts/chart-format";

type EmiCalendarProps = {
  entries: readonly EmiCalendarEntry[];
  currencyCode: string;
};

const STATUS_LABELS: Record<EmiCalendarStatus, string> = {
  paid: "Paid",
  partially_paid: "Partially paid",
  upcoming: "Upcoming",
  overdue: "Overdue",
  not_tracked: "Not tracked",
};

function statusBadgeVariant(
  status: EmiCalendarStatus,
): "secondary" | "outline" | "destructive" {
  if (status === "paid") return "secondary";
  if (status === "overdue") return "destructive";
  return "outline";
}

/**
 * PROMPT 22's "EMI calendar" — one row per (loan, month), always showing
 * the scheduled EMI and the actual amount paid that month as two separate
 * columns, never merged into one figure ("paid and scheduled values are
 * distinct"). Status is exactly what
 * src/lib/calculations/debt-trend.ts's generateEmiCalendar derived from
 * comparing the two — never a stored flag, so "overdue status is based on
 * actual payment records" holds here too.
 */
export function EmiCalendar({ entries, currencyCode }: EmiCalendarProps) {
  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">EMI calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No scheduled EMIs in this window"
            description="Loans with an EMI set and a repayment start date will show up here."
            headingLevel="h3"
            className="border-0 px-0 py-6"
          />
        </CardContent>
      </Card>
    );
  }

  const sorted = [...entries].sort((a, b) =>
    a.monthKey === b.monthKey
      ? a.loanName.localeCompare(b.loanName)
      : a.monthKey.localeCompare(b.monthKey),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">EMI calendar</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Month</th>
                <th className="px-4 py-2.5 font-medium">Loan</th>
                <th className="px-4 py-2.5 font-medium">Scheduled</th>
                <th className="px-4 py-2.5 font-medium">Actual</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {sorted.map((entry) => (
                <tr key={`${entry.loanId}-${entry.monthKey}`}>
                  <td className="px-4 py-2.5">
                    {formatMonthLabel(entry.monthKey)}
                  </td>
                  <td className="px-4 py-2.5">{entry.loanName}</td>
                  <td className="px-4 py-2.5">
                    {entry.scheduledAmountMinorUnits === null
                      ? "—"
                      : formatMoney({
                          amountMinorUnits: entry.scheduledAmountMinorUnits,
                          currencyCode,
                        })}
                  </td>
                  <td className="px-4 py-2.5">
                    {formatMoney({
                      amountMinorUnits: entry.actualAmountMinorUnits,
                      currencyCode,
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusBadgeVariant(entry.status)}>
                      {STATUS_LABELS[entry.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
