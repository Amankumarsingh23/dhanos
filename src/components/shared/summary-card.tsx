import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";

type SummaryCardProps = {
  title: string;
  /** Preformatted display amount — concealed automatically in privacy mode. */
  amount: string;
  /** Non-sensitive context line, e.g. "As of 21 Jul 2026" or "No data yet". */
  caption?: ReactNode;
};

/**
 * A dashboard summary card whose amount participates in privacy mode.
 * The amount only ever renders in the card body — never in metadata,
 * titles, or logs (see docs/security-model.md).
 */
export function SummaryCard({ title, amount, caption }: SummaryCardProps) {
  return (
    <Card>
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
}
