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
            {/*
              Deliberately not aria-hidden: Recharts' Cartesian/Polar charts
              default accessibilityLayer to true, which makes the chart's
              root SVG keyboard-focusable (tabIndex 0, role="application")
              so arrow keys can step through data points — "keyboard-
              accessible data where possible" (PROMPT 44). A focusable
              element inside an aria-hidden container is both an
              automatically-detectable violation and would silently defeat
              that built-in navigation. Each chart also passes its own
              accessibleSummary as the SVG's `desc` (see chart files) so the
              focused region has real accessible content, in addition to
              the sr-only text summary immediately above for anyone who
              can't perceive the chart visually at all.
            */}
            {/*
              data-sensitive="revealed" mirrors SensitiveAmount's own
              convention: it's what lets a privacy-mode test (or anything
              else) count "how many sensitive-figure surfaces does this
              page have" consistently across every card and chart, in both
              states — this branch was previously missing it, real when
              revealed but silently absent from that count, only ever
              showing up once concealed flipped it into the sibling
              data-sensitive="concealed" branch above.
            */}
            <div
              data-sensitive="revealed"
              style={{ height }}
              className={cn("w-full")}
            >
              {children}
            </div>
            {legend}
          </>
        )}
      </CardContent>
    </Card>
  );
}
