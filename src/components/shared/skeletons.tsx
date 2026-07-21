import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A single line of placeholder text. */
export function TextSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-full", className)} />;
}

/** Placeholder for a card-shaped block (e.g. an account or summary card) while data loads. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("border-border space-y-3 rounded-lg border p-4", className)}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Placeholder for one row of a data table (e.g. a transaction list) while data loads. */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 py-3">
      {Array.from({ length: columns }, (_, index) => (
        <Skeleton key={index} className="h-4 flex-1" />
      ))}
    </div>
  );
}

/** A vertical stack of TableRowSkeletons, for a whole loading list/table body. */
export function TableSkeleton({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-border divide-y">
      {Array.from({ length: rows }, (_, index) => (
        <TableRowSkeleton key={index} columns={columns} />
      ))}
    </div>
  );
}
