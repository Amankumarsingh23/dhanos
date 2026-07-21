import { TrendingUpIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type EstimatedValueBadgeProps = {
  label?: string;
  className?: string;
};

/**
 * Marks a figure as a projection/assumption rather than an actual recorded
 * value. Must accompany every projected number shown next to real data —
 * see docs/money-calculation-rules.md §4 ("distinguish actual from
 * projected performance").
 */
export function EstimatedValueBadge({
  label = "Estimated",
  className,
}: EstimatedValueBadgeProps) {
  return (
    <Badge variant="secondary" className={className}>
      <TrendingUpIcon />
      {label}
    </Badge>
  );
}
