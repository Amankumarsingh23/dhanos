import { CheckCircle2Icon, PencilIcon, UploadIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ComponentType } from "react";

export type DataSource = "verified" | "manual" | "imported";

const SOURCE_CONFIG: Record<
  DataSource,
  {
    label: string;
    icon: ComponentType<{ className?: string }>;
    variant: "default" | "outline" | "secondary";
  }
> = {
  verified: { label: "Verified", icon: CheckCircle2Icon, variant: "default" },
  manual: { label: "Manual entry", icon: PencilIcon, variant: "outline" },
  imported: { label: "Imported", icon: UploadIcon, variant: "secondary" },
};

type DataSourceBadgeProps = {
  source: DataSource;
  className?: string;
};

/**
 * Indicates how a data point entered the system: reconciled/verified
 * against an institution, typed in by hand, or bulk-imported (e.g. CSV).
 * Helps the user judge how much to trust a figure.
 */
export function DataSourceBadge({ source, className }: DataSourceBadgeProps) {
  const { label, icon: Icon, variant } = SOURCE_CONFIG[source];
  return (
    <Badge variant={variant} className={className}>
      <Icon />
      {label}
    </Badge>
  );
}
