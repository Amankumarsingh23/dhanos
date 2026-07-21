import type { ReactNode } from "react";
import { ResponsiveContainer } from "@/components/layout/responsive-container";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  /** Rendered above the container's max-width, e.g. a nav bar or workspace switcher. */
  topBar?: ReactNode;
  size?: "narrow" | "default" | "wide";
  className?: string;
};

/** Top-level page wrapper: consistent width, padding, and vertical rhythm for every workspace route. */
export function PageShell({
  children,
  topBar,
  size = "default",
  className,
}: PageShellProps) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {topBar}
      <ResponsiveContainer
        as="main"
        size={size}
        className={cn("flex-1 py-8", className)}
      >
        {children}
      </ResponsiveContainer>
    </div>
  );
}
