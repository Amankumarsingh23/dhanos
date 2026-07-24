"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
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
  isDocumentExpired,
  isDocumentExpiringSoon,
} from "@/lib/calculations/documents";
import {
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
} from "@/lib/validation/documents";
import type { Page } from "@/lib/queries/pagination";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  getDocumentDownloadUrlAction,
  restoreDocumentAction,
} from "./actions";
import { DocumentDialog } from "./document-dialog";
import type { DocumentRecord } from "./queries";

type DocumentsManagerProps = {
  householdId: string;
  documents: Page<DocumentRecord>;
  filters: {
    search: string;
    category: DocumentCategory | "";
    includeArchived: boolean;
  };
};

const CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS) as [
  DocumentCategory,
  string,
][];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "—";
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (isDocumentExpired(expiryDate)) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatDate(expiryDate)}
        <Badge variant="destructive">Expired</Badge>
      </span>
    );
  }
  if (isDocumentExpiringSoon(expiryDate)) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatDate(expiryDate)}
        <Badge variant="outline">Expiring soon</Badge>
      </span>
    );
  }
  return <span>{formatDate(expiryDate)}</span>;
}

export function DocumentsManager({
  householdId,
  documents,
  filters,
}: DocumentsManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(filters.search);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(
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
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ search: searchValue });
  }

  async function handleView(document: DocumentRecord) {
    const result = await getDocumentDownloadUrlAction(
      householdId,
      document.id,
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.open(result.data, "_blank", "noopener,noreferrer");
  }

  async function handleArchiveToggle(document: DocumentRecord) {
    const result =
      document.status === "archived"
        ? await restoreDocumentAction(householdId, document.id)
        : await archiveDocumentAction(householdId, document.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      document.status === "archived"
        ? "Document restored"
        : "Document archived",
    );
    router.refresh();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const result = await deleteDocumentAction(householdId, deleteTarget.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Document deleted");
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
            aria-label="Search documents"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect
            aria-label="Filter by category"
            className="w-auto"
            value={filters.category}
            onChange={(event) =>
              updateParams({ category: event.target.value })
            }
          >
            <option value="">All categories</option>
            {CATEGORY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter by status"
            className="w-auto"
            value={filters.includeArchived ? "all" : "active"}
            onChange={(event) =>
              updateParams({
                archived: event.target.value === "all" ? "true" : undefined,
              })
            }
          >
            <option value="active">Active only</option>
            <option value="all">Include archived</option>
          </NativeSelect>
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Upload document
          </Button>
        </div>
      </div>

      {documents.rows.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No documents in the vault yet"
          description="Bank statements, salary slips, policies, tax documents, and other paperwork — stored privately, downloadable only via short-lived signed links."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              Upload document
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Document</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Document date</th>
                <th className="px-4 py-2.5 font-medium">Expiry</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {documents.rows.map((document) => (
                <tr key={document.id}>
                  <td className="px-4 py-2.5 font-medium">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => handleView(document)}
                    >
                      {document.display_name}
                    </button>
                    <span className="text-muted-foreground block text-xs font-normal">
                      {document.original_filename}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline">
                      {
                        DOCUMENT_CATEGORY_LABELS[
                          document.category as DocumentCategory
                        ]
                      }
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {formatDate(document.document_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <ExpiryBadge expiryDate={document.expiry_date} />
                  </td>
                  <td className="px-4 py-2.5">
                    {formatFileSize(document.size_bytes)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant={
                        document.status === "archived"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {document.status === "archived" ? "Archived" : "Active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                          <span className="sr-only">
                            Actions for {document.display_name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleView(document)}>
                          <DownloadIcon data-icon="inline-start" />
                          View / download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setEditTarget(document)}
                        >
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleArchiveToggle(document)}
                        >
                          {document.status === "archived" ? (
                            <>
                              <ArchiveRestoreIcon data-icon="inline-start" />
                              Restore
                            </>
                          ) : (
                            <>
                              <ArchiveIcon data-icon="inline-start" />
                              Archive
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(document)}
                        >
                          Delete permanently
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

      {(documents.page > 1 || documents.hasMore) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={documents.page <= 1 || isPending}
            onClick={() => goToPage(documents.page - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {documents.page}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!documents.hasMore || isPending}
            onClick={() => goToPage(documents.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <DocumentDialog
        householdId={householdId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => router.refresh()}
      />
      <DocumentDialog
        key={editTarget?.id ?? "edit-none"}
        householdId={householdId}
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        document={editTarget}
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this document permanently?"
        description={`${deleteTarget?.display_name} and its file will be permanently removed — this can't be undone. Archive it instead if you might need it later.`}
        confirmLabel="Delete permanently"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
