"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontalIcon, PlusIcon, UsersIcon } from "lucide-react";
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
  RELATIONSHIP_TYPE_LABELS,
  type RelationshipType,
} from "@/lib/validation/people";
import type { Page } from "@/lib/queries/pagination";
import { archivePersonAction, restorePersonAction } from "./actions";
import { PersonDialog } from "./person-dialog";
import type { PersonRow } from "./queries";

type PeopleManagerProps = {
  householdId: string;
  people: Page<PersonRow>;
  filters: {
    search: string;
    relationshipType: RelationshipType | "";
    includeArchived: boolean;
  };
};

const RELATIONSHIP_TYPE_OPTIONS = Object.entries(RELATIONSHIP_TYPE_LABELS) as [
  RelationshipType,
  string,
][];

export function PeopleManager({
  householdId,
  people,
  filters,
}: PeopleManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PersonRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<PersonRow | null>(null);

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
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
    const action = archiveTarget.is_active
      ? archivePersonAction
      : restorePersonAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.is_active ? "Person archived" : "Person restored",
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
            aria-label="Search people"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by relationship"
            className="w-auto"
            value={filters.relationshipType}
            onChange={(event) =>
              updateParams({ relationship: event.target.value })
            }
          >
            <option value="">All relationships</option>
            {RELATIONSHIP_TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.includeArchived}
              onChange={(event) =>
                updateParams({
                  archived: event.target.checked ? "true" : undefined,
                })
              }
              className="border-input size-4 rounded"
            />
            Show archived
          </label>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Add person
          </Button>
        </div>
      </div>

      {people.rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No people yet"
          description="Add yourself and anyone else relevant to this household's finances — a spouse, a dependant, a lender, or a nominee."
          action={
            <Button onClick={() => setCreateOpen(true)}>Add person</Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Relationship</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {people.rows.map((person) => (
                <tr key={person.id}>
                  <td className="px-4 py-2.5 font-medium">
                    {person.display_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        RELATIONSHIP_TYPE_LABELS[
                          person.relationship_type as RelationshipType
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={person.is_active ? "secondary" : "outline"}>
                      {person.is_active ? "Active" : "Archived"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {person.display_name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditTarget(person)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(person)}
                        >
                          {person.is_active ? "Archive" : "Restore"}
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

      {(people.page > 1 || people.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={people.page <= 1 || isPending}
            onClick={() => goToPage(people.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {people.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!people.hasMore || isPending}
            onClick={() => goToPage(people.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <PersonDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => router.refresh()}
      />
      <PersonDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        person={editTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.is_active
            ? "Archive this person?"
            : "Restore this person?"
        }
        description={
          archiveTarget?.is_active
            ? `${archiveTarget?.display_name} will be hidden from active lists but their history is kept.`
            : `${archiveTarget?.display_name} will show up in active lists again.`
        }
        confirmLabel={archiveTarget?.is_active ? "Archive" : "Restore"}
        destructive={archiveTarget?.is_active}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
