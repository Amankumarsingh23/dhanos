"use client";

import { useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LandmarkIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/forms/native-select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  INSTITUTION_TYPE_LABELS,
  type InstitutionType,
} from "@/lib/validation/institutions";
import type { Page } from "@/lib/queries/pagination";
import { archiveInstitutionAction, restoreInstitutionAction } from "./actions";
import { InstitutionDialog } from "./institution-dialog";
import type { InstitutionRow } from "./queries";

type InstitutionsManagerProps = {
  householdId: string;
  institutions: Page<InstitutionRow>;
  filters: {
    search: string;
    institutionType: InstitutionType | "";
    includeArchived: boolean;
  };
};

const INSTITUTION_TYPE_OPTIONS = Object.entries(INSTITUTION_TYPE_LABELS) as [
  InstitutionType,
  string,
][];

export function InstitutionsManager({
  householdId,
  institutions,
  filters,
}: InstitutionsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // See src/features/accounts/accounts-manager.tsx's identical comment
  // (PROMPT 55 finding) — this checkbox is bound to a URL-searchParam-
  // driven prop that only updates once the navigation completes, so
  // without useOptimistic it stays visually unchecked for the entire
  // round trip after being clicked under any real network latency.
  const [optimisticIncludeArchived, setOptimisticIncludeArchived] =
    useOptimistic(filters.includeArchived);

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InstitutionRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<InstitutionRow | null>(
    null,
  );

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Any filter change resets to page 1 — but a call that's explicitly
    // setting the page itself (the Previous/Next buttons) must not have
    // that same value immediately deleted again (PROMPT 56 finding —
    // this unconditional delete silently broke every "Next" button in
    // the app: goToPage(n) calls updateParams({ page: String(n) }),
    // which set it, then this line deleted it again immediately after).
    if (!("page" in patch)) {
      params.delete("page");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  async function handleArchiveConfirm() {
    if (!archiveTarget) {
      return;
    }
    const action = archiveTarget.is_archived
      ? restoreInstitutionAction
      : archiveInstitutionAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.is_archived
        ? "Institution restored"
        : "Institution archived",
    );
    router.refresh();
  }

  function goToPage(page: number) {
    startTransition(() => {
      updateParams({ page: String(page) });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-1 gap-2 sm:max-w-sm"
        >
          <Input
            placeholder="Search by name…"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            aria-label="Search institutions"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by institution type"
            className="w-auto"
            value={filters.institutionType}
            onChange={(event) => updateParams({ type: event.target.value })}
          >
            <option value="">All types</option>
            {INSTITUTION_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optimisticIncludeArchived}
              onChange={(event) => {
                const checked = event.target.checked;
                startTransition(() => {
                  setOptimisticIncludeArchived(checked);
                  updateParams({ archived: checked ? "true" : undefined });
                });
              }}
              className="border-input size-4 rounded"
            />
            Show archived
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add institution
          </Button>
        </div>
      </div>

      {institutions.rows.length === 0 ? (
        <EmptyState
          icon={LandmarkIcon}
          title="No institutions yet"
          description="Add the banks, wallets, platforms, insurers, and employers this household deals with — accounts, loans, and policies will link to these."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add institution</Button>
          }
        />
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Website</th>
                <th className="px-4 py-2.5 font-medium">Linked accounts</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {institutions.rows.map((institution) => (
                <tr key={institution.id}>
                  <td className="px-4 py-2.5 font-medium">
                    {institution.name}
                    {institution.platform_name ? (
                      <span className="text-muted-foreground block text-xs font-normal">
                        {institution.platform_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        INSTITUTION_TYPE_LABELS[
                          institution.institution_type as InstitutionType
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {institution.website ? (
                      <a
                        href={
                          /^https?:\/\//i.test(institution.website)
                            ? institution.website
                            : `https://${institution.website}`
                        }
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary underline underline-offset-3"
                      >
                        {institution.website}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {institution.linkedAccountCount}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        institution.is_archived ? "outline" : "secondary"
                      }
                    >
                      {institution.is_archived ? "Archived" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {institution.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditTarget(institution)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(institution)}
                        >
                          {institution.is_archived ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(institutions.page > 1 || institutions.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={institutions.page <= 1 || isPending}
            onClick={() => goToPage(institutions.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {institutions.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!institutions.hasMore || isPending}
            onClick={() => goToPage(institutions.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <InstitutionDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => router.refresh()}
      />
      <InstitutionDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        institution={editTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.is_archived
            ? "Restore this institution?"
            : "Archive this institution?"
        }
        description={
          archiveTarget?.is_archived
            ? `${archiveTarget?.name} will show up in active lists again.`
            : `${archiveTarget?.name} will be hidden from active lists, but any linked accounts keep their history.`
        }
        confirmLabel={archiveTarget?.is_archived ? "Restore" : "Archive"}
        destructive={!archiveTarget?.is_archived}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
