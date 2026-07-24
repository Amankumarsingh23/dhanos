import type { ReactNode } from "react";

/**
 * A collapsible "how this is calculated" disclosure — PROMPT 20 rule "show
 * formulas or methodology." Uses a plain `<details>` element so the
 * formula is always in the DOM (readable by assistive tech / search)
 * without needing any client-side state.
 */
export function MethodologyNote({ children }: { children: ReactNode }) {
  return (
    <details className="border-border group rounded-lg border border-dashed px-3 py-2 text-sm">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer font-medium select-none">
        How this is calculated
      </summary>
      <div className="text-muted-foreground mt-2 space-y-1.5">{children}</div>
    </details>
  );
}
