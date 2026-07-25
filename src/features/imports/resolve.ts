import { isValidDate } from "@/lib/dates";
import { parseDecimalToMinorUnits } from "@/lib/money";
import type { ColumnMapping } from "@/lib/validation/imports";
import type {
  ResolvedAccountBalanceRow,
  ResolvedInvestmentValuationRow,
  ResolvedTransactionRow,
} from "@/lib/validation/imports";
import { IMPORT_TRANSACTION_KINDS, type ImportFieldDefinition } from "./types";

/**
 * Turns one CSV row into a typed, FK-resolved record ready for the
 * resolved-row zod schemas in src/lib/validation/imports.ts — explicit
 * per-import-type functions rather than one generic interpreter, since
 * each type's fields have genuinely different resolution needs (an amount
 * needs the *account's* currency to know its minor-unit exponent; a
 * holding reference doesn't need one at all). `ImportLookups` is built
 * once per batch (src/features/imports/queries.ts) from the household's
 * own real accounts/categories/holdings — never invented, never a partial
 * match.
 *
 * Resolution happens twice in this feature's lifecycle — once when a
 * batch is first validated, and again at commit time (re-resolved fresh
 * rather than trusting the first pass, in case an account/category/
 * holding was renamed or archived in between) — so `extractMappedFields`
 * is a distinct first step: it turns a raw CSV row + the batch's chosen
 * column mapping into a plain `{ fieldKey: rawText }` record exactly once,
 * which is what gets persisted as `import_rows.raw_data`. Both resolution
 * passes then work from that same already-extracted record, never needing
 * the original row + column mapping again.
 */

export type AccountLookup = { id: string; currencyCode: string };
export type CategoryLookup = { id: string };
export type HoldingLookup = { id: string; currencyCode: string };

export type ImportLookups = {
  accountsByName: Map<string, AccountLookup>;
  categoriesByName: Map<string, CategoryLookup>;
  holdingsByLabel: Map<string, HoldingLookup>;
};

export type ResolveResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** `{ fieldKey: rawText | null }` — one field's raw CSV text, keyed by target field, never the original column index (which is meaningless once extracted). */
export type MappedFields = Record<string, string | null>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Extracts one raw CSV row into a field-keyed record, per the batch's column mapping — the one place a column index is ever consulted. */
export function extractMappedFields(
  row: readonly string[],
  columnMapping: ColumnMapping,
  fields: readonly ImportFieldDefinition[],
): MappedFields {
  const result: MappedFields = {};
  for (const field of fields) {
    const columnIndexEntry = Object.entries(columnMapping).find(
      ([, target]) => target === field.key,
    );
    const value = columnIndexEntry ? row[Number(columnIndexEntry[0])] : undefined;
    const trimmed = value?.trim() ?? "";
    result[field.key] = trimmed.length > 0 ? trimmed : null;
  }
  return result;
}

function resolveDate(raw: string | null, label: string, errors: string[]): string | null {
  if (!raw) {
    errors.push(`${label} is required.`);
    return null;
  }
  // Deliberately ISO-only (YYYY-MM-DD) for this first import foundation —
  // guessing between DD/MM and MM/DD date formats would be a real
  // correctness risk, not a convenience worth adding silently.
  if (!ISO_DATE_PATTERN.test(raw) || !isValidDate(raw)) {
    errors.push(`${label} "${raw}" is not a valid ISO date (expected YYYY-MM-DD).`);
    return null;
  }
  return raw;
}

function resolveAccount(
  raw: string | null,
  lookups: ImportLookups,
  errors: string[],
): AccountLookup | null {
  if (!raw) {
    errors.push("Account is required.");
    return null;
  }
  const account = lookups.accountsByName.get(normalizeKey(raw));
  if (!account) {
    errors.push(`Account "${raw}" does not match any existing account by name.`);
    return null;
  }
  return account;
}

function resolveAmount(
  raw: string | null,
  label: string,
  currencyCode: string,
  errors: string[],
): number | null {
  if (!raw) {
    errors.push(`${label} is required.`);
    return null;
  }
  try {
    return parseDecimalToMinorUnits(raw, currencyCode);
  } catch {
    errors.push(`${label} "${raw}" is not a valid amount.`);
    return null;
  }
}

export function resolveTransactionRow(
  fields: MappedFields,
  lookups: ImportLookups,
): ResolveResult<ResolvedTransactionRow> {
  const errors: string[] = [];

  const transactionDate = resolveDate(fields.transactionDate ?? null, "Date", errors);

  const rawKind = fields.kind ?? null;
  let kind: ResolvedTransactionRow["kind"] | null = null;
  if (!rawKind) {
    errors.push("Kind is required.");
  } else {
    const normalizedKind = rawKind.toLowerCase();
    const matched = IMPORT_TRANSACTION_KINDS.find((k) => k === normalizedKind);
    if (!matched) {
      errors.push(
        `Kind "${rawKind}" is not supported for import (transfers, refunds, and adjustments each have their own dedicated flow — see Transfers, Expenses, and Accounts).`,
      );
    } else {
      kind = matched;
    }
  }

  const account = resolveAccount(fields.account ?? null, lookups, errors);

  const amountMinorUnits = account
    ? resolveAmount(fields.amount ?? null, "Amount", account.currencyCode, errors)
    : null;

  const rawCategory = fields.category ?? null;
  let categoryId: string | null = null;
  if (rawCategory) {
    const category = lookups.categoriesByName.get(normalizeKey(rawCategory));
    if (!category) {
      errors.push(`Category "${rawCategory}" does not match any existing category by name.`);
    } else {
      categoryId = category.id;
    }
  }

  if (
    errors.length > 0 ||
    !transactionDate ||
    !kind ||
    !account ||
    amountMinorUnits === null
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      transactionDate,
      kind,
      amountMinorUnits,
      currencyCode: account.currencyCode,
      accountId: account.id,
      categoryId,
      counterparty: fields.counterparty ?? null,
      description: fields.description ?? null,
      externalReference: fields.externalReference ?? null,
    },
  };
}

export function resolveAccountBalanceRow(
  fields: MappedFields,
  lookups: ImportLookups,
): ResolveResult<ResolvedAccountBalanceRow> {
  const errors: string[] = [];

  const asOfDate = resolveDate(fields.asOfDate ?? null, "Date", errors);
  const account = resolveAccount(fields.account ?? null, lookups, errors);
  const balanceMinorUnits = account
    ? resolveAmount(fields.balance ?? null, "Balance", account.currencyCode, errors)
    : null;

  if (errors.length > 0 || !asOfDate || !account || balanceMinorUnits === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      asOfDate,
      accountId: account.id,
      balanceMinorUnits,
      currencyCode: account.currencyCode,
      notes: fields.notes ?? null,
    },
  };
}

export function resolveInvestmentValuationRow(
  fields: MappedFields,
  lookups: ImportLookups,
): ResolveResult<ResolvedInvestmentValuationRow> {
  const errors: string[] = [];

  const asOfDate = resolveDate(fields.asOfDate ?? null, "Date", errors);

  const rawHolding = fields.holding ?? null;
  let holding: HoldingLookup | null = null;
  if (!rawHolding) {
    errors.push("Holding is required.");
  } else {
    holding = lookups.holdingsByLabel.get(normalizeKey(rawHolding)) ?? null;
    if (!holding) {
      errors.push(`Holding "${rawHolding}" does not match any existing holding.`);
    }
  }

  const valueMinorUnits = holding
    ? resolveAmount(fields.value ?? null, "Value", holding.currencyCode, errors)
    : null;

  const rawPricePerUnit = fields.pricePerUnit ?? null;
  let pricePerUnit: number | null = null;
  if (rawPricePerUnit) {
    const parsed = Number(rawPricePerUnit);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push(`Price per unit "${rawPricePerUnit}" is not a valid non-negative number.`);
    } else {
      pricePerUnit = parsed;
    }
  }

  if (errors.length > 0 || !asOfDate || !holding || valueMinorUnits === null) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      asOfDate,
      investmentHoldingId: holding.id,
      valueMinorUnits,
      currencyCode: holding.currencyCode,
      pricePerUnit,
      notes: fields.notes ?? null,
    },
  };
}
