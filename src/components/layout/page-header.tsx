import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
};

/** Consistent title/description/actions row for the top of every workspace page. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 pb-6", className)}>
      {breadcrumbs}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        {/*
          items-start (not the flex default stretch) makes a flex-col/row
          child size to its own fit-content width, so a long description
          (e.g. Liabilities') can grow past the row's actual width instead
          of wrapping within it — real horizontal overflow at narrow
          viewports (PROMPT 44), on every page since this is the one
          shared header every workspace page renders through.
        */}
        <div className="w-full min-w-0 space-y-1 sm:w-auto">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
