import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  /** Heading level for `title` — pick whatever is correct in the surrounding document outline. */
  headingLevel?: "h2" | "h3" | "h4";
};

/** Shown when a section fails to load. Distinct from EmptyState — this means something went wrong, not "nothing here yet". */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Please try again.",
  onRetry,
  retryLabel = "Try again",
  className,
  headingLevel: Heading = "h2",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-12 text-center",
        className,
      )}
    >
      <TriangleAlertIcon
        className="text-destructive size-8"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <Heading className="text-foreground text-sm font-medium">
          {title}
        </Heading>
        <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
