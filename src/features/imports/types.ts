import { GENERAL_FORM_TRANSACTION_KINDS } from "@/lib/validation/transactions";
import type { ImportType } from "@/lib/validation/imports";

/**
 * Kinds a CSV row can produce — GENERAL_FORM_TRANSACTION_KINDS minus
 * 'transfer': a transfer structurally needs a *second* account
 * (transfer_account_id), which a one-row-per-transaction CSV shape has no
 * field for, so it's excluded here rather than left to fail as an opaque
 * DB constraint violation at commit time. 'refund'/'adjustment' were
 * already excluded upstream (see GENERAL_FORM_TRANSACTION_KINDS' own
 * comment) — neither is a free-form choice a CSV row should be able to
 * produce either.
 */
export const IMPORT_TRANSACTION_KINDS = GENERAL_FORM_TRANSACTION_KINDS.filter(
  (kind) => kind !== "transfer",
);

/**
 * Per-import-type field catalogues (PROMPT 41) — drive the column-mapping
 * step's "map this CSV column to..." dropdown. The actual resolution
 * logic (turning a mapped raw cell into a typed, FK-resolved value) lives
 * in resolve.ts as explicit, per-import-type functions rather than a fully
 * generic interpreter — each import type's fields have genuinely different
 * shapes (an account reference needs a currency-aware amount parse
 * downstream; a holding reference doesn't), so this catalogue is metadata
 * for the UI, not an executable pipeline.
 */
export type ImportFieldKind =
  | "text"
  | "date"
  | "amount"
  | "account_ref"
  | "category_ref"
  | "holding_ref"
  | "transaction_kind";

export type ImportFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
  kind: ImportFieldKind;
  helpText?: string;
};

export const TRANSACTION_IMPORT_FIELDS: readonly ImportFieldDefinition[] = [
  { key: "transactionDate", label: "Date", required: true, kind: "date", helpText: "ISO format, YYYY-MM-DD" },
  { key: "kind", label: "Kind", required: true, kind: "transaction_kind", helpText: `${IMPORT_TRANSACTION_KINDS.join(", ")} — never transfer/refund/adjustment, which each have their own dedicated flow` },
  { key: "amount", label: "Amount", required: true, kind: "amount", helpText: "Always positive — kind determines direction" },
  { key: "account", label: "Account", required: true, kind: "account_ref" },
  { key: "category", label: "Category", required: false, kind: "category_ref" },
  { key: "counterparty", label: "Counterparty / merchant", required: false, kind: "text" },
  { key: "description", label: "Description", required: false, kind: "text" },
  { key: "externalReference", label: "External reference", required: false, kind: "text", helpText: "A bank/broker statement reference — used only for duplicate detection, strongest signal available" },
];

export const ACCOUNT_BALANCE_IMPORT_FIELDS: readonly ImportFieldDefinition[] = [
  { key: "asOfDate", label: "Date", required: true, kind: "date", helpText: "ISO format, YYYY-MM-DD" },
  { key: "account", label: "Account", required: true, kind: "account_ref" },
  { key: "balance", label: "Balance", required: true, kind: "amount", helpText: "The confirmed balance as of this date" },
  { key: "notes", label: "Notes", required: false, kind: "text" },
];

export const INVESTMENT_VALUATION_IMPORT_FIELDS: readonly ImportFieldDefinition[] = [
  { key: "asOfDate", label: "Date", required: true, kind: "date", helpText: "ISO format, YYYY-MM-DD" },
  { key: "holding", label: "Holding", required: true, kind: "holding_ref", helpText: "Must match an existing holding's \"Asset (Platform)\" label exactly" },
  { key: "value", label: "Value", required: true, kind: "amount", helpText: "The holding's total value as of this date" },
  { key: "pricePerUnit", label: "Price per unit", required: false, kind: "amount" },
  { key: "notes", label: "Notes", required: false, kind: "text" },
];

export function getImportFieldDefinitions(
  importType: ImportType,
): readonly ImportFieldDefinition[] {
  switch (importType) {
    case "transactions":
      return TRANSACTION_IMPORT_FIELDS;
    case "account_balances":
      return ACCOUNT_BALANCE_IMPORT_FIELDS;
    case "investment_valuations":
      return INVESTMENT_VALUATION_IMPORT_FIELDS;
  }
}

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  transactions: "Transactions",
  account_balances: "Account balances",
  investment_valuations: "Investment valuations",
};

export const IMPORT_TYPE_DESCRIPTIONS: Record<ImportType, string> = {
  transactions:
    "Bring in transactions from a bank/card statement export — each row becomes one transaction, exactly like adding one by hand.",
  account_balances:
    "Bring in a history of confirmed balances for an account — each row becomes one balance snapshot, the same record a manual reconciliation produces.",
  investment_valuations:
    "Bring in a history of valuations for an investment holding — each row becomes one valuation snapshot.",
};
