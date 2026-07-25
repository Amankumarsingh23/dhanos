"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireHouseholdRole } from "@/lib/households/permissions";
import { recordActivityEvent } from "@/lib/activity";
import { mapSupabaseError } from "@/lib/errors/supabase";
import { reportActionError } from "@/lib/observability/report-action-error";
import { unwrapList, unwrapSingle } from "@/lib/database/query";
import {
  actionError,
  actionOk,
  runHouseholdMutation,
  type ActionResult,
} from "@/lib/mutations";
import { sanitizeFileName } from "@/lib/calculations/documents";
import {
  findAccountBalanceDuplicate,
  findInvestmentValuationDuplicate,
  findTransactionDuplicate,
  type SnapshotDuplicateCandidate,
  type TransactionDuplicateCandidate,
} from "@/lib/calculations/import-duplicate-matching";
import {
  createImportBatchSchema,
  commitImportBatchSchema,
  rollbackImportBatchSchema,
  type CreateImportBatchInput,
  type CommitImportBatchInput,
  type RollbackImportBatchInput,
  type ResolvedAccountBalanceRow,
  type ResolvedInvestmentValuationRow,
  type ResolvedTransactionRow,
} from "@/lib/validation/imports";
import { getImportFieldDefinitions } from "./types";
import {
  extractMappedFields,
  resolveAccountBalanceRow,
  resolveInvestmentValuationRow,
  resolveTransactionRow,
  type ImportLookups,
  type MappedFields,
  type ResolveResult,
} from "./resolve";
import {
  getAccountBalanceDuplicateCandidates,
  getImportLookups,
  getInvestmentValuationDuplicateCandidates,
  getTransactionDuplicateCandidates,
} from "./queries";

/**
 * CSV import Server Actions (PROMPT 41) — the workflow's steps 3–9 in two
 * calls: `createImportBatchAction` does column-mapping resolution,
 * validation, and duplicate detection (steps 3–6) in one pass and stores
 * every row's outcome; `commitImportBatchAction` re-resolves each
 * still-pending row fresh and writes it in small, independently-failing
 * chunks (steps 7–9 — "import atomically or in safe batches": one bad
 * chunk is rejected and logged, the rest of the import still proceeds).
 * Rollback (step 10) is offered for transactions only — see
 * rollbackImportBatchAction's own comment for why account/investment
 * snapshots can't safely offer the same.
 */

const WRITE_ROLES = ["owner", "admin", "editor"] as const;
const ROLLBACK_ROLES = ["owner", "admin"] as const;
const COMMIT_CHUNK_SIZE = 200;

export async function prepareImportFileUploadAction(
  householdId: string,
  originalFilename: string,
): Promise<ActionResult<{ storagePath: string }>> {
  try {
    await requireHouseholdRole(householdId, [...WRITE_ROLES]);
    const storagePath = `${householdId}/import/${crypto.randomUUID()}-${sanitizeFileName(originalFilename)}`;
    return actionOk({ storagePath });
  } catch (error) {
    return actionError(
      reportActionError(error, "imports.prepare_upload", { householdId }),
    );
  }
}

type RowOutcome = {
  rowNumber: number;
  rawData: MappedFields;
  status: "pending" | "rejected" | "skipped_duplicate";
  errorMessage: string | null;
  duplicateReason: string | null;
};

/** Resolves + duplicate-checks every mapped row of one import type, given already-fetched lookups and existing-record duplicate candidates. Same-file duplicates are tracked as we go (a rolling "seen" list), so the second of two identical rows in one file is flagged against the first. */
function processTransactionRows(
  mappedRows: readonly MappedFields[],
  lookups: ImportLookups,
  existingCandidates: readonly TransactionDuplicateCandidate[],
): RowOutcome[] {
  const outcomes: RowOutcome[] = [];
  const seen: TransactionDuplicateCandidate[] = [];

  mappedRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const resolved = resolveTransactionRow(raw, lookups);
    if (!resolved.ok) {
      outcomes.push({
        rowNumber,
        rawData: raw,
        status: "rejected",
        errorMessage: resolved.errors.join(" "),
        duplicateReason: null,
      });
      return;
    }
    const candidateShape = {
      accountId: resolved.value.accountId,
      transactionDate: resolved.value.transactionDate,
      amountMinorUnits: resolved.value.amountMinorUnits,
      description: resolved.value.description ?? resolved.value.counterparty,
      externalReference: resolved.value.externalReference,
    };
    const duplicateReason = findTransactionDuplicate(candidateShape, [
      ...existingCandidates,
      ...seen,
    ]);
    seen.push({ label: `row ${rowNumber} of this file`, ...candidateShape });
    outcomes.push({
      rowNumber,
      rawData: raw,
      status: duplicateReason ? "skipped_duplicate" : "pending",
      errorMessage: null,
      duplicateReason,
    });
  });

  return outcomes;
}

function processAccountBalanceRows(
  mappedRows: readonly MappedFields[],
  lookups: ImportLookups,
  existingByAccount: ReadonlyMap<string, readonly SnapshotDuplicateCandidate[]>,
): RowOutcome[] {
  const outcomes: RowOutcome[] = [];
  const seenByAccount = new Map<string, SnapshotDuplicateCandidate[]>();

  mappedRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const resolved = resolveAccountBalanceRow(raw, lookups);
    if (!resolved.ok) {
      outcomes.push({
        rowNumber,
        rawData: raw,
        status: "rejected",
        errorMessage: resolved.errors.join(" "),
        duplicateReason: null,
      });
      return;
    }
    const accountId = resolved.value.accountId;
    const candidates = [
      ...(existingByAccount.get(accountId) ?? []),
      ...(seenByAccount.get(accountId) ?? []),
    ];
    const duplicateReason = findAccountBalanceDuplicate(
      resolved.value.asOfDate,
      candidates,
    );
    const list = seenByAccount.get(accountId) ?? [];
    list.push({
      label: `row ${rowNumber} of this file`,
      asOfDate: resolved.value.asOfDate,
    });
    seenByAccount.set(accountId, list);

    outcomes.push({
      rowNumber,
      rawData: raw,
      status: duplicateReason ? "skipped_duplicate" : "pending",
      errorMessage: null,
      duplicateReason,
    });
  });

  return outcomes;
}

function processInvestmentValuationRows(
  mappedRows: readonly MappedFields[],
  lookups: ImportLookups,
  existingByHolding: ReadonlyMap<string, readonly SnapshotDuplicateCandidate[]>,
): RowOutcome[] {
  const outcomes: RowOutcome[] = [];
  const seenByHolding = new Map<string, SnapshotDuplicateCandidate[]>();

  mappedRows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const resolved = resolveInvestmentValuationRow(raw, lookups);
    if (!resolved.ok) {
      outcomes.push({
        rowNumber,
        rawData: raw,
        status: "rejected",
        errorMessage: resolved.errors.join(" "),
        duplicateReason: null,
      });
      return;
    }
    const holdingId = resolved.value.investmentHoldingId;
    const candidates = [
      ...(existingByHolding.get(holdingId) ?? []),
      ...(seenByHolding.get(holdingId) ?? []),
    ];
    const duplicateReason = findInvestmentValuationDuplicate(
      resolved.value.asOfDate,
      candidates,
    );
    const list = seenByHolding.get(holdingId) ?? [];
    list.push({
      label: `row ${rowNumber} of this file`,
      asOfDate: resolved.value.asOfDate,
    });
    seenByHolding.set(holdingId, list);

    outcomes.push({
      rowNumber,
      rawData: raw,
      status: duplicateReason ? "skipped_duplicate" : "pending",
      errorMessage: null,
      duplicateReason,
    });
  });

  return outcomes;
}

export async function createImportBatchAction(
  householdId: string,
  input: CreateImportBatchInput,
): Promise<ActionResult<{ importBatchId: string }>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: createImportBatchSchema,
    input,
    actionName: "imports.create_batch",
    run: async ({ supabase, householdId, input }) => {
      const fieldDefs = getImportFieldDefinitions(input.importType);
      const lookups = await getImportLookups(supabase, householdId);
      const mappedRows = input.rows.map((row) =>
        extractMappedFields(row, input.columnMapping, fieldDefs),
      );

      let outcomes: RowOutcome[];

      if (input.importType === "transactions") {
        const accountIds = new Set<string>();
        for (const raw of mappedRows) {
          const account = raw.account
            ? lookups.accountsByName.get(raw.account.trim().toLowerCase())
            : undefined;
          if (account) accountIds.add(account.id);
        }
        const existingCandidates = await getTransactionDuplicateCandidates(
          supabase,
          householdId,
          [...accountIds],
        );
        outcomes = processTransactionRows(
          mappedRows,
          lookups,
          existingCandidates,
        );
      } else if (input.importType === "account_balances") {
        const accountIds = new Set<string>();
        for (const raw of mappedRows) {
          const account = raw.account
            ? lookups.accountsByName.get(raw.account.trim().toLowerCase())
            : undefined;
          if (account) accountIds.add(account.id);
        }
        const existingByAccount = await getAccountBalanceDuplicateCandidates(
          supabase,
          householdId,
          [...accountIds],
        );
        outcomes = processAccountBalanceRows(
          mappedRows,
          lookups,
          existingByAccount,
        );
      } else {
        const holdingIds = new Set<string>();
        for (const raw of mappedRows) {
          const holding = raw.holding
            ? lookups.holdingsByLabel.get(raw.holding.trim().toLowerCase())
            : undefined;
          if (holding) holdingIds.add(holding.id);
        }
        const existingByHolding =
          await getInvestmentValuationDuplicateCandidates(
            supabase,
            householdId,
            [...holdingIds],
          );
        outcomes = processInvestmentValuationRows(
          mappedRows,
          lookups,
          existingByHolding,
        );
      }

      const { data: batch, error: batchError } = await supabase
        .from("import_batches")
        .insert({
          household_id: householdId,
          import_type: input.importType,
          status: "ready",
          original_filename: input.originalFilename,
          stored_file_path: input.storedFilePath,
          column_mapping: input.columnMapping,
          total_row_count: outcomes.length,
          skipped_row_count: outcomes.filter(
            (o) => o.status === "skipped_duplicate",
          ).length,
          rejected_row_count: outcomes.filter((o) => o.status === "rejected")
            .length,
        })
        .select()
        .single();
      if (batchError || !batch) {
        throw mapSupabaseError(batchError!);
      }

      const rowInserts = outcomes.map((outcome) => ({
        household_id: householdId,
        import_batch_id: batch.id as string,
        row_number: outcome.rowNumber,
        raw_data: outcome.rawData,
        status: outcome.status,
        error_message: outcome.errorMessage,
        duplicate_reason: outcome.duplicateReason,
      }));
      for (let i = 0; i < rowInserts.length; i += COMMIT_CHUNK_SIZE) {
        const { error: rowsError } = await supabase
          .from("import_rows")
          .insert(rowInserts.slice(i, i + COMMIT_CHUNK_SIZE));
        if (rowsError) {
          throw mapSupabaseError(rowsError);
        }
      }

      return { importBatchId: batch.id as string };
    },
    activityEvent: ({ input, output }) => ({
      householdId,
      eventType: "import.validated",
      entityType: "import_batch",
      entityId: output.importBatchId,
      metadata: { importType: input.importType, rowCount: input.rows.length },
    }),
    revalidatePaths: ["/app/import"],
  });
}

type CommitOutcome = { importedCount: number; rejectedCount: number };

type ImportRowStatusUpdate = {
  id: string;
  status: "rejected" | "imported";
  error_message: string | null;
  created_entity_table: string | null;
  created_entity_id: string | null;
};

/**
 * One batched RPC call for the whole chunk's differently-valued
 * import_rows updates, rather than one .update() per row — see
 * bulk_update_import_row_status() in
 * supabase/migrations/20260730100000_bulk_update_import_row_status.sql
 * and docs/performance-audit.md, "CSV import" (confirmed N+1: up to
 * COMMIT_CHUNK_SIZE individual UPDATEs per chunk before this fix).
 */
async function applyImportRowStatusUpdates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  updates: readonly ImportRowStatusUpdate[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }
  const { error } = await supabase.rpc("bulk_update_import_row_status", {
    p_updates: updates as unknown as never,
  });
  if (error) {
    throw mapSupabaseError(error);
  }
}

async function commitChunk<TValue>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  targetTable:
    | "transactions"
    | "account_balance_snapshots"
    | "investment_valuation_snapshots",
  chunk: readonly { rowId: string; resolved: ResolveResult<TValue> }[],
  buildInsertRow: (value: TValue) => Record<string, unknown>,
): Promise<CommitOutcome> {
  let importedCount = 0;
  let rejectedCount = 0;

  const invalid = chunk.filter(
    (
      item,
    ): item is typeof item & { resolved: { ok: false; errors: string[] } } =>
      !item.resolved.ok,
  );
  await applyImportRowStatusUpdates(
    supabase,
    invalid.map((item) => ({
      id: item.rowId,
      status: "rejected",
      error_message: item.resolved.errors.join(" "),
      created_entity_table: null,
      created_entity_id: null,
    })),
  );
  rejectedCount += invalid.length;

  const valid = chunk.filter(
    (item): item is typeof item & { resolved: { ok: true; value: TValue } } =>
      item.resolved.ok,
  );
  if (valid.length === 0) {
    return { importedCount, rejectedCount };
  }

  const insertPayload = valid.map((item) => ({
    household_id: householdId,
    ...buildInsertRow(item.resolved.value),
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from(targetTable)
    .insert(insertPayload as never)
    .select("id");

  if (insertError || !insertedRows) {
    const message = mapSupabaseError(
      insertError ?? new Error("Insert failed"),
    ).message;
    await applyImportRowStatusUpdates(
      supabase,
      valid.map((item) => ({
        id: item.rowId,
        status: "rejected",
        error_message: message,
        created_entity_table: null,
        created_entity_id: null,
      })),
    );
    rejectedCount += valid.length;
    return { importedCount, rejectedCount };
  }

  await applyImportRowStatusUpdates(
    supabase,
    valid.map((item, i) => ({
      id: item.rowId,
      status: "imported",
      error_message: null,
      created_entity_table: targetTable,
      created_entity_id:
        (insertedRows[i] as { id: string } | undefined)?.id ?? null,
    })),
  );
  importedCount += valid.length;

  return { importedCount, rejectedCount };
}

export async function commitImportBatchAction(
  householdId: string,
  input: CommitImportBatchInput,
): Promise<ActionResult<CommitOutcome>> {
  return runHouseholdMutation({
    householdId,
    allowedRoles: [...WRITE_ROLES],
    schema: commitImportBatchSchema,
    input,
    actionName: "imports.commit_batch",
    run: async ({ supabase, householdId, input }) => {
      const batch = unwrapSingle(
        await supabase
          .from("import_batches")
          .select("*")
          .eq("household_id", householdId)
          .eq("id", input.importBatchId)
          .single(),
      );
      if (batch.status !== "ready") {
        throw new Error(
          "This import has already been committed, rolled back, or isn't ready yet.",
        );
      }

      const pendingRows = unwrapList(
        await supabase
          .from("import_rows")
          .select("*")
          .eq("household_id", householdId)
          .eq("import_batch_id", batch.id)
          .eq("status", "pending")
          .order("row_number", { ascending: true }),
      );

      const lookups = await getImportLookups(supabase, householdId);

      let importedCount = 0;
      let rejectedCount = 0;

      for (let i = 0; i < pendingRows.length; i += COMMIT_CHUNK_SIZE) {
        const chunk = pendingRows.slice(i, i + COMMIT_CHUNK_SIZE);
        let outcome: CommitOutcome;

        if (batch.import_type === "transactions") {
          outcome = await commitChunk<ResolvedTransactionRow>(
            supabase,
            householdId,
            "transactions",
            chunk.map((row) => ({
              rowId: row.id,
              resolved: resolveTransactionRow(
                row.raw_data as MappedFields,
                lookups,
              ),
            })),
            (v) => ({
              kind: v.kind,
              amount_minor_units: v.amountMinorUnits,
              currency_code: v.currencyCode,
              transaction_date: v.transactionDate,
              account_id: v.accountId,
              category_id: v.categoryId,
              counterparty: v.counterparty,
              description: v.description,
              status: "cleared",
              source_type: "import",
            }),
          );
        } else if (batch.import_type === "account_balances") {
          outcome = await commitChunk<ResolvedAccountBalanceRow>(
            supabase,
            householdId,
            "account_balance_snapshots",
            chunk.map((row) => ({
              rowId: row.id,
              resolved: resolveAccountBalanceRow(
                row.raw_data as MappedFields,
                lookups,
              ),
            })),
            (v) => ({
              account_id: v.accountId,
              as_of_date: v.asOfDate,
              balance_minor_units: v.balanceMinorUnits,
              currency_code: v.currencyCode,
              source: "imported",
              notes: v.notes,
            }),
          );
        } else {
          outcome = await commitChunk<ResolvedInvestmentValuationRow>(
            supabase,
            householdId,
            "investment_valuation_snapshots",
            chunk.map((row) => ({
              rowId: row.id,
              resolved: resolveInvestmentValuationRow(
                row.raw_data as MappedFields,
                lookups,
              ),
            })),
            (v) => ({
              investment_holding_id: v.investmentHoldingId,
              as_of_date: v.asOfDate,
              value_minor_units: v.valueMinorUnits,
              price_per_unit: v.pricePerUnit,
              currency_code: v.currencyCode,
              source: "imported",
              notes: v.notes,
            }),
          );
        }

        importedCount += outcome.importedCount;
        rejectedCount += outcome.rejectedCount;
      }

      await supabase
        .from("import_batches")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          imported_row_count: importedCount,
          rejected_row_count: batch.rejected_row_count + rejectedCount,
        })
        .eq("id", batch.id);

      return { importedCount, rejectedCount };
    },
    activityEvent: ({ input, output }) => ({
      householdId,
      eventType: "import.committed",
      entityType: "import_batch",
      entityId: input.importBatchId,
      metadata: { ...output },
    }),
    revalidatePaths: [
      "/app/import",
      "/app/cash-flow",
      "/app/accounts",
      "/app/investments/portfolio",
    ],
  });
}

/**
 * Rollback (step 10, "where practical") is offered for `transactions`
 * batches only: undoing one just means marking each row's created
 * transaction `cancelled` — an ordinary, already-supported update, the
 * same reversible archive every manually-entered transaction can go
 * through. `account_balance_snapshots`/`investment_valuation_snapshots`
 * have no update/delete grant at all (append-only by design — see
 * docs/money-calculation-rules.md §3, "do not overwrite historical
 * valuations") — practical rollback for those would mean weakening that
 * guarantee for every other feature that relies on it, so it isn't
 * offered; re-import is always safe instead, since duplicate detection
 * would flag the untouched originals rather than doubling them.
 */
export async function rollbackImportBatchAction(
  householdId: string,
  input: RollbackImportBatchInput,
): Promise<ActionResult<undefined>> {
  const parsed = rollbackImportBatchSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  try {
    await requireHouseholdRole(householdId, [...ROLLBACK_ROLES]);
    const supabase = await createClient();

    const batch = unwrapSingle(
      await supabase
        .from("import_batches")
        .select("*")
        .eq("household_id", householdId)
        .eq("id", parsed.data.importBatchId)
        .single(),
    );

    if (batch.import_type !== "transactions") {
      return actionError(
        "Only transaction imports can be rolled back — balance and valuation snapshots are append-only history.",
      );
    }
    if (batch.status !== "completed") {
      return actionError("Only a completed import can be rolled back.");
    }

    const importedRows = unwrapList(
      await supabase
        .from("import_rows")
        .select("created_entity_id")
        .eq("household_id", householdId)
        .eq("import_batch_id", batch.id)
        .eq("status", "imported"),
    );

    const transactionIds = importedRows
      .map((row) => row.created_entity_id)
      .filter((id): id is string => id !== null);

    if (transactionIds.length > 0) {
      const { error } = await supabase
        .from("transactions")
        .update({ status: "cancelled" })
        .eq("household_id", householdId)
        .in("id", transactionIds)
        .neq("status", "cancelled");
      if (error) {
        throw mapSupabaseError(error);
      }
    }

    await supabase
      .from("import_batches")
      .update({
        status: "rolled_back",
        rolled_back_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    await recordActivityEvent(supabase, {
      householdId,
      eventType: "import.rolled_back",
      entityType: "import_batch",
      entityId: batch.id,
      metadata: { cancelledTransactionCount: transactionIds.length },
    });

    revalidatePath("/app/import");
    revalidatePath("/app/cash-flow");

    return actionOk(undefined);
  } catch (error) {
    return actionError(
      reportActionError(error, "imports.rollback", {
        householdId,
        importBatchId: parsed.data.importBatchId,
      }),
    );
  }
}
