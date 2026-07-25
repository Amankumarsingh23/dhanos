import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A plain `<select>` styled to match src/components/ui/input.tsx — no
 * shadcn Select/combobox primitive exists in this repo yet (see
 * src/features/onboarding/onboarding-form.tsx for the pattern this
 * extracts). Reach for this instead of copy-pasting the class string again;
 * escalate to a richer combobox only once a select genuinely needs
 * search/multi-select the native element can't do.
 */
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        // The closed box picks up bg-transparent (the page's own
        // background shows through) fine, but a native <select>'s open
        // option-list popup does NOT inherit page styling the way normal
        // elements do — most browsers render it with their own default
        // (light) popup background regardless of theme. Styling <option>
        // directly is the one thing browsers reliably respect for this;
        // using the same popover tokens every other dropdown-like surface
        // in the app already uses (see globals.css) keeps it consistent
        // rather than inventing a one-off color here.
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
