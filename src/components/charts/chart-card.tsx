"use client";

import type { ReactNode } from "react";
import { EyeOffIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { usePrivacy } from "@/components/shared/privacy-provider";
import { cn } from "@/lib/utils";

type ChartCardProps = {
  title: string;
  /** e.g. "Jan 2026 – Jul 2026" or "1–22 Jul 2026" — the period the chart covers. */
  dateRangeLabel: string;
  /** e.g. "Data as of 22 Jul 2026" — distinct from the date range, see docs/money-calculation-rules.md §3. */
  dataCutoffLabel: string;
  /**
   * A full-sentence description of what the chart shows, for screen
   * readers. Must not be passed while the caller's underlying data would
   * be sensitive and privacy mode is on — this component itself never
   * renders it while concealed, but callers should still compute it from
   * real figures only when about to show them (see the isConcealedSafe
   * note below).
   */
  accessibleSummary: string;
  isEmpty: boolean;
  emptyDescription: string;
  legend?: ReactNode;
  children: ReactNode;
  className?: string;
  height?: number;
};

/**
 * Shared wrapper for every dashboard chart (PROMPT 15): title, date range +
 * data cutoff captions, an accessible text summary, an empty state, and
 * privacy-mode concealment. Concealment here follows the same rule as
 * SensitiveAmount (src/components/shared/sensitive-amount.tsx): while
 * `concealed`, the real chart and its accessible summary are never placed
 * in the render output at all (not just visually hidden), so no figure
 * reaches the DOM — only a generic "hidden" message does.
 */
export function ChartCard({
  title,
  dateRangeLabel,
  dataCutoffLabel,
  accessibleSummary,
  isEmpty,
  emptyDescription,
  legend,
  children,
  className,
  height = 280,
}: ChartCardProps) {
  const { concealed } = usePrivacy();

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <CardDescription>
          {dateRangeLabel} · {dataCutoffLabel}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {concealed ? (
          <div
            data-sensitive="concealed"
            className="border-border text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed"
            style={{ height }}
          >
            <EyeOffIcon className="size-6" aria-hidden="true" />
            <p className="text-sm">Amounts hidden by privacy mode</p>
            <span className="sr-only">
              This chart&apos;s figures are hidden while privacy mode is on.
            </span>
          </div>
        ) : isEmpty ? (
          <EmptyState
            title="No data yet"
            description={emptyDescription}
            headingLevel="h3"
            className="border-0 px-0 py-8"
          />
        ) : (
          <>
            <p className="sr-only">{accessibleSummary}</p>
            <div style={{ height }} className={cn("w-full")} aria-hidden="true">
              {children}
            </div>
            {legend}
          </>
        )}
      </CardContent>
    </Card>
  );
}
