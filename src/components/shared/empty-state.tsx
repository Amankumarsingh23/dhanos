import type { ComponentType, ReactNode } from "react";
import { InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Heading level for `title` — pick whatever is correct in the surrounding document outline. */
  headingLevel?: "h2" | "h3" | "h4";
};

/** Shown wherever a list/table/section has no data yet — never render a bare blank area. */
export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  description,
  action,
  className,
  headingLevel: Heading = "h2",
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="text-muted-foreground size-8" aria-hidden="true" />
      <div className="space-y-1">
        <Heading className="text-foreground text-sm font-medium">
          {title}
        </Heading>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
