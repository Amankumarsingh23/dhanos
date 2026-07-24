"use client";

import { useEffect, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormErrorMessage } from "@/components/forms/form-error-message";
import { NativeSelect } from "@/components/forms/native-select";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { buildDocumentStoragePath } from "@/lib/calculations/documents";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_ENTITY_TYPE_LABELS,
  MAX_DOCUMENT_SIZE_BYTES,
  documentMetadataFieldsSchema,
  isAllowedDocumentMimeType,
  type DocumentCategory,
  type DocumentEntityType,
  type DocumentMetadataFieldsInput,
} from "@/lib/validation/documents";
import { createDocumentAction, updateDocumentMetadataAction } from "./actions";
import type { DocumentRecord } from "./queries";

type DocumentDialogProps = {
  householdId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document?: DocumentRecord | null;
  onSaved?: () => void;
};

const CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS) as [
  DocumentCategory,
  string,
][];
const ENTITY_TYPE_OPTIONS = Object.entries(DOCUMENT_ENTITY_TYPE_LABELS) as [
  DocumentEntityType,
  string,
][];

function toDefaultValues(
  source?: DocumentRecord | null,
): DocumentMetadataFieldsInput {
  return {
    displayName: source?.display_name ?? "",
    category: (source?.category as DocumentCategory) ?? "other",
    entityType: (source?.entity_type as DocumentEntityType) ?? null,
    entityId: source?.entity_id ?? null,
    documentDate: source?.document_date ?? null,
    expiryDate: source?.expiry_date ?? null,
    notes: source?.notes ?? null,
  };
}

/** Best-effort — a browser that lacks SubtleCrypto (very old, or a non-HTTPS context) simply stores no checksum, per the migration's "where practical." */
async function computeChecksum(file: File): Promise<string | null> {
  if (!("crypto" in window) || !window.crypto.subtle) {
    return null;
  }
  try {
    const buffer = await file.arrayBuffer();
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Create/edit dialog for a vault document (PROMPT 34). Only the create path
 * collects a file — editing never re-uploads or replaces the underlying
 * Storage object, only the metadata row (category, dates, notes, entity
 * link); upload a new document instead if the file itself changed.
 */
export function DocumentDialog({
  householdId,
  open,
  onOpenChange,
  document,
  onSaved,
}: DocumentDialogProps) {
  const isEditing = Boolean(document);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DocumentMetadataFieldsInput>({
    resolver: zodResolver(documentMetadataFieldsSchema),
    defaultValues: toDefaultValues(document),
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    reset(toDefaultValues(document));
    setFile(null);
    setFormError(null);
  }, [open, document, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFormError(null);
    }
    onOpenChange(next);
  }

  function handleFileSelect(selected: File) {
    if (!isAllowedDocumentMimeType(selected.type)) {
      setFormError("This file type isn't supported.");
      return;
    }
    if (selected.size > MAX_DOCUMENT_SIZE_BYTES) {
      setFormError(
        "File is too large — the vault accepts files up to 25 MB.",
      );
      return;
    }
    setFormError(null);
    setFile(selected);
    if (!watch("displayName")) {
      setValue("displayName", selected.name.replace(/\.[^.]+$/, ""));
    }
  }

  const entityType = watch("entityType");

  function onSubmit(values: DocumentMetadataFieldsInput) {
    setFormError(null);

    if (isEditing && document) {
      startTransition(async () => {
        const result = await updateDocumentMetadataAction(householdId, {
          ...values,
          documentId: document.id,
        });
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        toast.success("Document updated");
        handleOpenChange(false);
        onSaved?.();
      });
      return;
    }

    if (!file) {
      setFormError("Select a file to upload.");
      return;
    }
    const mimeType = file.type;
    if (!isAllowedDocumentMimeType(mimeType)) {
      setFormError("This file type isn't supported.");
      return;
    }

    startTransition(async () => {
      setIsUploading(true);
      const documentId = crypto.randomUUID();
      const storagePath = buildDocumentStoragePath({
        householdId,
        documentId,
        fileName: file.name,
        entityType: values.entityType ?? null,
        entityId: values.entityId ?? null,
      });
      const browserSupabase = createBrowserClient();

      try {
        const [uploadResult, checksum] = await Promise.all([
          browserSupabase.storage
            .from("documents")
            .upload(storagePath, file, { contentType: mimeType }),
          computeChecksum(file),
        ]);
        if (uploadResult.error) {
          setFormError("Could not upload the document. Please try again.");
          return;
        }

        const result = await createDocumentAction(householdId, {
          ...values,
          documentId,
          storagePath,
          originalFilename: file.name,
          mimeType,
          sizeBytes: file.size,
          checksum,
        });
        if (!result.ok) {
          // The file uploaded but its metadata row didn't — clean up the
          // orphaned Storage object rather than leaving it stranded, since
          // no page in the app will ever list or let a user remove it
          // without a documents row pointing at it.
          await browserSupabase.storage
            .from("documents")
            .remove([storagePath]);
          setFormError(result.error);
          return;
        }

        toast.success("Document uploaded");
        handleOpenChange(false);
        onSaved?.();
      } finally {
        setIsUploading(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit document" : "Upload a document"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Editing metadata never replaces the file — upload a new document instead if it has changed."
              : "Statements, policies, receipts, and other paperwork — stored privately and never shared without a short-lived link."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="max-h-[70vh] space-y-4 overflow-y-auto pr-1"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {!isEditing && (
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <label className="border-input hover:bg-accent/50 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm">
                <UploadIcon className="size-4 shrink-0" />
                <span className="truncate">
                  {file
                    ? `${file.name} (${formatFileSize(file.size)})`
                    : "Choose a file"}
                </span>
                <input
                  id="file"
                  type="file"
                  className="sr-only"
                  accept={ALLOWED_DOCUMENT_MIME_TYPES.join(",")}
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    event.target.value = "";
                    if (selected) {
                      handleFileSelect(selected);
                    }
                  }}
                />
              </label>
              <p className="text-muted-foreground text-xs">
                PDF, image, Word, Excel, CSV, or text — up to 25 MB.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                aria-invalid={!!errors.displayName}
                {...register("displayName")}
              />
              <FormErrorMessage message={errors.displayName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <NativeSelect id="category" {...register("category")}>
                {CATEGORY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="documentDate">Document date (optional)</Label>
              <Input id="documentDate" type="date" {...register("documentDate")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiryDate">Expiry date (optional)</Label>
              <Input id="expiryDate" type="date" {...register("expiryDate")} />
            </div>
          </div>

          <div className="grid gap-4 rounded-lg border border-dashed p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="entityType">Linked record (optional)</Label>
              <NativeSelect
                id="entityType"
                value={entityType ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  setValue(
                    "entityType",
                    next ? (next as DocumentEntityType) : null,
                  );
                  if (!next) {
                    setValue("entityId", null);
                  }
                }}
              >
                <option value="">Not linked</option>
                {ENTITY_TYPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entityId">Record ID</Label>
              <Input
                id="entityId"
                placeholder="Paste the record's ID"
                disabled={!entityType}
                aria-invalid={!!errors.entityId}
                {...register("entityId")}
              />
              <FormErrorMessage message={errors.entityId?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" {...register("notes")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending || isUploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isUploading}>
              {isUploading
                ? "Uploading…"
                : isPending
                  ? "Saving…"
                  : isEditing
                    ? "Save changes"
                    : "Upload"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
