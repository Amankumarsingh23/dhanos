import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";
import { cn } from "@/lib/utils";

type SummaryCardProps = {
  title: string;
  /** Preformatted display amount — concealed automatically in privacy mode. */
  amount: string;
  /** Non-sensitive context line, e.g. "As of 21 Jul 2026" or "No data yet". */
  caption?: ReactNode;
  /** When set, the whole card links to the underlying records (e.g. a filtered transaction list). */
  href?: string;
};

/**
 * A dashboard summary card whose amount participates in privacy mode.
 * The amount only ever renders in the card body — never in metadata,
 * titles, or logs (see docs/security-model.md). Optionally links the whole
 * card to the underlying records — every dashboard card should be able to,
 * per PROMPT 15's acceptance criteria.
 */
export function SummaryCard({
  title,
  amount,
  caption,
  href,
}: SummaryCardProps) {
  const card = (
    <Card
      className={cn(
        href &&
          "hover:border-ring/50 focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
      )}
    >
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SensitiveAmount
          value={amount}
          className="text-foreground text-2xl font-semibold tracking-tight"
        />
        {caption && (
          <p className="text-muted-foreground mt-1 text-xs">{caption}</p>
        )}
      </CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }

  return (
    <Link
      href={href}
      className="block rounded-xl"
      aria-label={`${title}: view underlying records`}
    >
      {card}
    </Link>
  );
}
