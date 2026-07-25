import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SensitiveAmount } from "@/components/shared/sensitive-amount";

type InsightCardProps = {
  title: string;
  /** Preformatted display value ("42%", "3.2 months", "1 of 4 policies due soon") — concealed in privacy mode like any other figure derived from real amounts. */
  value: string;
  caption?: string;
  sourceHrefs: readonly string[];
};

/**
 * One personalized, deterministic insight on the Money Classroom (PROMPT
 * 38). Always neutral in phrasing (never "you should..."), and always links
 * to the feature page(s) the underlying figure was computed from —
 * "personalized values link to underlying records."
 */
export function InsightCard({
  title,
  value,
  caption,
  sourceHrefs,
}: InsightCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SensitiveAmount
          value={value}
          className="text-foreground text-2xl font-semibold tracking-tight"
        />
        {caption && (
          <p className="text-muted-foreground mt-1 text-xs">{caption}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {sourceHrefs.map((href) => (
            <Link
              key={href}
              href={href}
              className="hover:underline inline-block px-1 py-1.5"
            >
              View underlying records →
            </Link>
          ))}
        </p>
      </CardContent>
    </Card>
  );
}

/** Same shape, for when the insight's underlying data doesn't exist yet — "insufficient data," never a guessed figure. */
export function InsufficientDataCard({
  title,
  reason,
  sourceHrefs,
}: {
  title: string;
  reason: string;
  sourceHrefs: readonly string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-foreground text-lg font-medium">
          Insufficient data
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{reason}</p>
        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {sourceHrefs.map((href) => (
            <Link
              key={href}
              href={href}
              className="hover:underline inline-block px-1 py-1.5"
            >
              Add records →
            </Link>
          ))}
        </p>
      </CardContent>
    </Card>
  );
}
