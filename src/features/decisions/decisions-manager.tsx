"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PlusIcon, ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import {
  DECISION_ENTITY_TYPE_LABELS,
  DECISION_STATUS_LABELS,
  type DecisionEntityType,
  type DecisionStatus,
} from "@/lib/validation/decisions";
import type { Page } from "@/lib/queries/pagination";
import { DecisionDialog, type SelectOption } from "./decision-dialog";
import type { DecisionRecord } from "./queries";

type DecisionsManagerProps = {
  householdId: string;
  decisions: Page<DecisionRecord>;
  filters: {
    search: string;
    status: DecisionStatus | "";
    entityType: DecisionEntityType | "";
  };
  entityOptions: Record<DecisionEntityType, SelectOption[]>;
};

const STATUS_OPTIONS = Object.entries(DECISION_STATUS_LABELS) as [
  DecisionStatus,
  string,
][];
const ENTITY_TYPE_OPTIONS = Object.entries(DECISION_ENTITY_TYPE_LABELS) as [
  DecisionEntityType,
  string,
][];

function statusBadgeVariant(
  status: DecisionStatus,
): "secondary" | "outline" | "destructive" | "default" {
  if (status === "reversed") return "destructive";
  if (status === "decided") return "default";
  if (status === "superseded") return "secondary";
  return "outline";
}

function formatDate(dateString: string): string {
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function DecisionsManager({
  householdId,
  decisions,
  filters,
  entityOptions,
}: DecisionsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    // Any filter change resets to page 1 — but a call that's explicitly
    // setting the page itself (the Previous/Next buttons below) must not
    // have that same value immediately deleted again.
    if (!("page" in patch)) {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 gap-2 sm:max-w-sm"
        >
          <Input
            placeholder="Search by title…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search decisions"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by status"
            className="w-auto"
            value={filters.status}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by related record type"
            className="w-auto"
            value={filters.entityType}
            onChange={(event) => updateParams({ entityType: event.target.value })}
          >
            <option value="">All record types</option>
            {ENTITY_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Record decision
          </Button>
        </div>
      </div>

      {decisions.rows.length === 0 ? (
        <EmptyState
          icon={ScrollTextIcon}
          title="No decisions recorded yet"
          description="Starting a SIP, lending money, taking a loan, buying insurance, purchasing an asset, pausing an investment, a loan prepayment — capture the reasoning while it's fresh."
          action={
            <Button onClick={() => setCreateOpen(true)}>Record decision</Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Decision date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {decisions.rows.map((decision) => (
                <tr key={decision.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/app/decisions/${decision.id}`}
                      className="hover:underline"
                    >
                      {decision.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatDate(decision.decision_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusBadgeVariant(decision.status as DecisionStatus)}>
                      {DECISION_STATUS_LABELS[decision.status as DecisionStatus]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(decisions.page > 1 || decisions.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={decisions.page <= 1}
            onClick={() => updateParams({ page: String(decisions.page - 1) })}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {decisions.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!decisions.hasMore}
            onClick={() => updateParams({ page: String(decisions.page + 1) })}
          >
            Next
          </Button>
        </div>
      )}

      <DecisionDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        entityOptions={entityOptions}
        onSaved={(decisionId) => router.push(`/app/decisions/${decisionId}`)}
      />
    </div>
  );
}
