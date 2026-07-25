"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/forms/native-select";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { parseCsv, splitHeaderAndRows, MAX_IMPORT_ROWS } from "@/lib/csv/parse";
import type { ImportType } from "@/lib/validation/imports";
import { getImportFieldDefinitions, IMPORT_TYPE_LABELS } from "./types";
import { createImportBatchAction, prepareImportFileUploadAction } from "./actions";

const UNMAPPED = "__unmapped__";

/** Best-effort auto-guess: a CSV header matching a field's key or label (case/spacing-insensitive) is pre-selected, never assumed silently — the household still sees and can change every mapping before validating. */
function guessMapping(
  headers: readonly string[],
  fieldKeys: readonly { key: string; label: string }[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[\s_-]/g, "");
  fieldKeys.forEach((field) => {
    const index = headers.findIndex(
      (header) =>
        normalize(header) === normalize(field.key) ||
        normalize(header) === normalize(field.label),
    );
    if (index >= 0) {
      mapping[String(index)] = field.key;
    }
  });
  return mapping;
}

type Step = "upload" | "map" | "submitting";

export function ImportWizard({
  householdId,
  importType,
}: {
  householdId: string;
  importType: ImportType;
}) {
  const router = useRouter();
  const fields = getImportFieldDefinitions(importType);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [storeOriginalFile, setStoreOriginalFile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const mappedFieldKeys = new Set(Object.values(columnMapping));
  const missingRequired = fields.filter(
    (field) => field.required && !mappedFieldKeys.has(field.key),
  );

  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;

    setFormError(null);
    const text = await selected.text();
    const parsed = parseCsv(text);
    const { headers: parsedHeaders, dataRows } = splitHeaderAndRows(parsed);

    if (dataRows.length === 0) {
      setFormError("This file has no data rows.");
      return;
    }
    if (dataRows.length > MAX_IMPORT_ROWS) {
      setFormError(
        `This file has ${dataRows.length} rows — a single import is limited to ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
      );
      return;
    }

    setFile(selected);
    setFileName(selected.name);
    setHeaders(parsedHeaders);
    setRows(dataRows);
    setColumnMapping(guessMapping(parsedHeaders, fields));
    setStep("map");
  }

  function handleMappingChange(fieldKey: string, columnIndex: string) {
    setColumnMapping((previous) => {
      const next = { ...previous };
      // A CSV column can only feed one target field — clear any other
      // field currently pointed at this same column first.
      for (const [index, key] of Object.entries(next)) {
        if (key === fieldKey) delete next[index];
      }
      if (columnIndex !== UNMAPPED) {
        next[columnIndex] = fieldKey;
      }
      return next;
    });
  }

  function handleStartOver() {
    setStep("upload");
    setFile(null);
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setColumnMapping({});
    setFormError(null);
  }

  function handleValidate() {
    if (missingRequired.length > 0) {
      setFormError(
        `Map every required field first: ${missingRequired.map((f) => f.label).join(", ")}.`,
      );
      return;
    }
    setFormError(null);
    setStep("submitting");

    startTransition(async () => {
      let storedFilePath: string | null = null;

      if (storeOriginalFile && file) {
        const prepared = await prepareImportFileUploadAction(householdId, file.name);
        if (!prepared.ok) {
          setFormError(prepared.error);
          setStep("map");
          return;
        }
        const browserSupabase = createBrowserClient();
        const { error: uploadError } = await browserSupabase.storage
          .from("documents")
          .upload(prepared.data.storagePath, file, {
            contentType: file.type || "text/csv",
          });
        if (uploadError) {
          setFormError("Could not store a copy of the file. Please try again.");
          setStep("map");
          return;
        }
        storedFilePath = prepared.data.storagePath;
      }

      const result = await createImportBatchAction(householdId, {
        importType,
        originalFilename: fileName ?? "import.csv",
        headers,
        rows,
        columnMapping,
        storedFilePath,
      });

      if (!result.ok) {
        setFormError(result.error);
        setStep("map");
        return;
      }

      toast.success("File checked — review the results before confirming.");
      router.push(`/app/import/batch/${result.data.importBatchId}`);
    });
  }

  return (
    <div className="space-y-6">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              1. Upload a CSV file
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()}>
              Choose file…
            </Button>
            <p className="text-muted-foreground text-xs">
              First row must be a header row. Dates must be ISO format
              (YYYY-MM-DD). Up to {MAX_IMPORT_ROWS.toLocaleString()} rows per
              file.
            </p>
          </CardContent>
        </Card>
      )}

      {(step === "map" || step === "submitting") && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                2. Preview — {fileName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-2 text-xs">
                {rows.length} data row{rows.length === 1 ? "" : "s"} found.
                Showing the first {previewRows.length}.
              </p>
              <div className="relative overflow-x-auto rounded-lg border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {headers.map((header, index) => (
                        <th key={index} className="px-3 py-2 font-medium whitespace-nowrap">
                          {header || `Column ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-1.5 whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                3. Map columns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => {
                  const mappedIndex = Object.entries(columnMapping).find(
                    ([, key]) => key === field.key,
                  )?.[0];
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`map-${field.key}`}>
                        {field.label}
                        {field.required && (
                          <span className="text-destructive"> *</span>
                        )}
                      </Label>
                      <NativeSelect
                        id={`map-${field.key}`}
                        value={mappedIndex ?? UNMAPPED}
                        onChange={(event) =>
                          handleMappingChange(field.key, event.target.value)
                        }
                      >
                        <option value={UNMAPPED}>Not mapped</option>
                        {headers.map((header, index) => (
                          <option key={index} value={String(index)}>
                            {header || `Column ${index + 1}`}
                          </option>
                        ))}
                      </NativeSelect>
                      {field.helpText && (
                        <p className="text-muted-foreground text-xs">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-start gap-2 border-t pt-4">
                <input
                  id="storeOriginalFile"
                  type="checkbox"
                  className="border-input mt-0.5 size-4 rounded"
                  checked={storeOriginalFile}
                  onChange={(event) => setStoreOriginalFile(event.target.checked)}
                />
                <div>
                  <Label htmlFor="storeOriginalFile" className="font-medium">
                    Keep a private copy of this file
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Stored privately (never public), viewable only by your
                    household. Optional — declining does not affect the
                    import itself.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleStartOver}>
                  Start over
                </Button>
                <Button type="button" onClick={handleValidate} disabled={isPending}>
                  {isPending
                    ? "Checking rows…"
                    : "Validate & check for duplicates"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        Importing {IMPORT_TYPE_LABELS[importType]}. Nothing is written to your
        records yet — the next page shows exactly what would happen before
        you confirm.
      </p>
    </div>
  );
}
