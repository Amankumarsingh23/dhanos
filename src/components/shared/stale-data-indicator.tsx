import { differenceInHours, formatDistanceToNow } from "date-fns";
import { ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_STALE_AFTER_HOURS = 24;

export function isStale(
  asOf: Date | string,
  staleAfterHours = DEFAULT_STALE_AFTER_HOURS,
): boolean {
  const date = typeof asOf === "string" ? new Date(asOf) : asOf;
  return differenceInHours(new Date(), date) >= staleAfterHours;
}

type StaleDataIndicatorProps = {
  /** When this data point was last refreshed/valued. */
  asOf: Date | string;
  staleAfterHours?: number;
  className?: string;
};

/**
 * Flags a displayed figure (a balance, a valuation) as possibly out of
 * date. Distinct from EstimatedValueBadge — this is about *freshness*, not
 * whether the figure is a projection. See docs/money-calculation-rules.md §3.
 */
export function StaleDataIndicator({
  asOf,
  staleAfterHours = DEFAULT_STALE_AFTER_HOURS,
  className,
}: StaleDataIndicatorProps) {
  const date = typeof asOf === "string" ? new Date(asOf) : asOf;
  const stale = isStale(date, staleAfterHours);
  const relative = formatDistanceToNow(date, { addSuffix: true });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={stale ? "destructive" : "outline"}
          className={className}
        >
          <ClockIcon />
          {stale ? "Stale" : "Updated"} {relative}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {stale
          ? "This figure hasn't been refreshed recently and may be out of date."
          : "This figure reflects the most recent update."}
      </TooltipContent>
    </Tooltip>
  );
}
