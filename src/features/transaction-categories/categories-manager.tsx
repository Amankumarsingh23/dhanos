"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  CATEGORY_KIND_LABELS,
  CLASSIFICATION_LABELS,
  type CategoryKind,
  type Classification,
} from "@/lib/validation/transaction-categories";
import {
  archiveCategoryAction,
  reorderCategoriesAction,
  restoreCategoryAction,
} from "./actions";
import { CategoryDialog } from "./category-dialog";
import type { CategoryRow } from "./queries";

type CategoriesManagerProps = {
  householdId: string;
  categories: CategoryRow[];
  includeArchived: boolean;
};

type CategoryGroup = {
  parent: CategoryRow | null;
  children: CategoryRow[];
};

function groupCategories(categories: CategoryRow[]): CategoryGroup[] {
  const topLevel = categories.filter((c) => !c.parent_category_id);
  const groups: CategoryGroup[] = topLevel.map((parent) => ({
    parent,
    children: categories.filter((c) => c.parent_category_id === parent.id),
  }));
  // Custom categories whose declared parent was archived out of the current
  // list still need somewhere to render — bucket them under "Other."
  const orphaned = categories.filter(
    (c) =>
      c.parent_category_id &&
      !topLevel.some((parent) => parent.id === c.parent_category_id),
  );
  if (orphaned.length > 0) {
    groups.push({ parent: null, children: orphaned });
  }
  return groups;
}

export function CategoriesManager({
  householdId,
  categories,
  includeArchived,
}: CategoriesManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<CategoryRow | null>(null);
  const [editTarget, setEditTarget] = useState<CategoryRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CategoryRow | null>(null);

  const groups = groupCategories(categories);

  async function handleArchiveConfirm() {
    if (!archiveTarget) {
      return;
    }
    const action = archiveTarget.is_archived
      ? restoreCategoryAction
      : archiveCategoryAction;
    const result = await action(householdId, archiveTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      archiveTarget.is_archived ? "Category restored" : "Category archived",
    );
    router.refresh();
  }

  async function moveWithinGroup(
    group: CategoryGroup,
    index: number,
    delta: number,
  ) {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= group.children.length) {
      return;
    }
    const reordered = [...group.children];
    const [moved] = reordered.splice(index, 1);
    if (!moved) {
      return;
    }
    reordered.splice(targetIndex, 0, moved);

    const result = await reorderCategoriesAction(householdId, {
      orderedCategoryIds: reordered.map((c) => c.id),
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function moveGroup(index: number, delta: number) {
    const parents = groups
      .map((g) => g.parent)
      .filter((p): p is CategoryRow => p !== null);
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= parents.length) {
      return;
    }
    const reordered = [...parents];
    const [moved] = reordered.splice(index, 1);
    if (!moved) {
      return;
    }
    reordered.splice(targetIndex, 0, moved);

    const result = await reorderCategoriesAction(householdId, {
      orderedCategoryIds: reordered.map((c) => c.id),
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  if (categories.length === 0) {
    return (
      <EmptyState
        icon={TagIcon}
        title="No categories yet"
        description="Categories will be seeded automatically for a new household — add a custom one if you need something the defaults don't cover."
        action={
          <Button
            onClick={() => {
              setCreateParent(null);
              setCreateOpen(true);
            }}
          >
            Add category
          </Button>
        }
      />
    );
  }

  const parentGroupsOnly = groups.filter((g) => g.parent !== null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              const params = new URLSearchParams(searchParams.toString());
              if (event.target.checked) {
                params.set("archived", "true");
              } else {
                params.delete("archived");
              }
              router.push(`${pathname}?${params.toString()}`);
            }}
            className="border-input size-4 rounded"
          />
          Show archived
        </label>
        <Button
          onClick={() => {
            setCreateParent(null);
            setCreateOpen(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Add category
        </Button>
      </div>

      <div className="space-y-4">
        {groups.map((group) => {
          const parentGroupIndex = group.parent
            ? parentGroupsOnly.findIndex(
                (g) => g.parent?.id === group.parent!.id,
              )
            : -1;
          return (
            <div
              key={group.parent?.id ?? "orphaned"}
              className="rounded-xl border"
            >
              <div className="bg-muted/50 flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-foreground text-sm font-medium">
                    {group.parent?.name ?? "Other"}
                  </span>
                  {group.parent && (
                    <>
                      <Badge variant="outline">
                        {
                          CATEGORY_KIND_LABELS[
                            group.parent.category_kind as CategoryKind
                          ]
                        }
                      </Badge>
                      {group.parent.is_system_default && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                      {group.parent.is_archived && (
                        <Badge variant="outline">Archived</Badge>
                      )}
                    </>
                  )}
                </div>
                {group.parent && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={parentGroupIndex <= 0}
                      onClick={() => moveGroup(parentGroupIndex, -1)}
                      aria-label={`Move ${group.parent.name} up`}
                    >
                      <ChevronUpIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={parentGroupIndex >= parentGroupsOnly.length - 1}
                      onClick={() => moveGroup(parentGroupIndex, 1)}
                      aria-label={`Move ${group.parent.name} down`}
                    >
                      <ChevronDownIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreateParent(group.parent);
                        setCreateOpen(true);
                      }}
                    >
                      Add subcategory
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {group.parent.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditTarget(group.parent)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setArchiveTarget(group.parent)}
                        >
                          {group.parent.is_archived ? "Restore" : "Archive"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
              {group.children.length > 0 && (
                <ul className="divide-border divide-y">
                  {group.children.map((child, childIndex) => (
                    <li
                      key={child.id}
                      className="flex items-center justify-between gap-2 px-4 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{child.name}</span>
                        {!group.parent && (
                          <Badge variant="outline">
                            {
                              CATEGORY_KIND_LABELS[
                                child.category_kind as CategoryKind
                              ]
                            }
                          </Badge>
                        )}
                        {child.classification && (
                          <Badge variant="outline">
                            {
                              CLASSIFICATION_LABELS[
                                child.classification as Classification
                              ]
                            }
                          </Badge>
                        )}
                        {child.is_system_default && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                        {child.is_archived && (
                          <Badge variant="outline">Archived</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={childIndex === 0}
                          onClick={() => moveWithinGroup(group, childIndex, -1)}
                          aria-label={`Move ${child.name} up`}
                        >
                          <ChevronUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={childIndex === group.children.length - 1}
                          onClick={() => moveWithinGroup(group, childIndex, 1)}
                          aria-label={`Move ${child.name} down`}
                        >
                          <ChevronDownIcon />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontalIcon />
                              <span className="sr-only">
                                Actions for {child.name}
                              </span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditTarget(child)}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setArchiveTarget(child)}
                            >
                              {child.is_archived ? "Restore" : "Archive"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <CategoryDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultParentCategoryId={createParent?.id ?? null}
        categories={categories}
        onSaved={() => router.refresh()}
      />
      <CategoryDialog
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        category={editTarget}
        categories={categories}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={
          archiveTarget?.is_archived
            ? "Restore this category?"
            : "Archive this category?"
        }
        description={
          archiveTarget?.is_archived
            ? `${archiveTarget?.name} will show up in active pickers again.`
            : `${archiveTarget?.name} will be hidden from active pickers, but transactions already using it keep their history.`
        }
        confirmLabel={archiveTarget?.is_archived ? "Restore" : "Archive"}
        destructive={!archiveTarget?.is_archived}
        onConfirm={handleArchiveConfirm}
      />
    </div>
  );
}
