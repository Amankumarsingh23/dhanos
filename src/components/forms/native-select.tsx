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
        "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}
