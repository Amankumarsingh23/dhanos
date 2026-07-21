import { z } from "zod";
import {
  currencyCodeSchema,
  isoDateStringSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

/**
 * Shared zod schemas for the Accounts feature (src/features/accounts) —
 * see docs/financial-domain-model.md §2 and
 * supabase/migrations/20260721060003_financial_accounts.sql +
 * 20260721060004_account_balance_snapshots.sql for the matching column
 * definitions/check constraints this schema must stay in sync with.
 */

export const accountTypeSchema = z.enum([
  "savings",
  "current",
  "cash",
  "wallet",
  "fixed_deposit",
  "recurring_deposit",
  "investment",
  "demat",
  "loan",
  "credit",
  "staking",
  "provident_fund",
  "pension",
  "other",
]);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  savings: "Savings",
  current: "Current",
  cash: "Cash",
  wallet: "Wallet",
  fixed_deposit: "Fixed deposit",
  recurring_deposit: "Recurring deposit",
  investment: "Investment",
  demat: "Demat",
  loan: "Loan",
  credit: "Credit",
  staking: "Staking",
  provident_fund: "Provident fund",
  pension: "Pension",
  other: "Other",
};

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name is too long");

const maskedIdentifierSchema = z
  .string()
  .trim()
  .max(50, "Masked identifier is too long")
  .nullable()
  .optional();

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .nullable()
  .optional();

const optionalUuidSchema = uuidSchema.nullable().optional();
const optionalDateSchema = isoDateStringSchema.nullable().optional();

const accountFieldsSchema = z
  .object({
    name: nameSchema,
    accountType: accountTypeSchema,
    institutionId: optionalUuidSchema,
    ownerPersonId: optionalUuidSchema,
    maskedIdentifier: maskedIdentifierSchema,
    currencyCode: currencyCodeSchema,
    // A decimal string (e.g. "1000.50"), converted to minor units in the
    // Server Action via parseDecimalToMinorUnits — never trusted as an
    // integer here, since the exponent depends on currencyCode (see
    // src/lib/money/index.ts).
    openingBalance: z
      .string()
      .trim()
      .min(1, "Enter an opening balance (0 if none)"),
    openedDate: optionalDateSchema,
    closedDate: optionalDateSchema,
    isActive: z.boolean().default(true),
    includeInNetWorth: z.boolean().default(true),
    notes: notesSchema,
  })
  .refine((values) => !values.closedDate || !values.isActive, {
    message: "A closed account cannot also be active",
    path: ["closedDate"],
  })
  .refine(
    (values) =>
      !values.openedDate ||
      !values.closedDate ||
      values.closedDate >= values.openedDate,
    {
      message: "Closed date cannot be before opened date",
      path: ["closedDate"],
    },
  );

export const accountInputSchema = accountFieldsSchema;
export type AccountInput = z.input<typeof accountInputSchema>;

export const accountUpdateSchema = accountFieldsSchema;
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;

export type AccountFilters = {
  search?: string;
  accountType?: AccountType;
  institutionId?: string;
  ownerPersonId?: string;
  includeClosed?: boolean;
};

/**
 * A manual balance correction (see PROMPT 9, "Balance rules"): the user
 * confirms what the account's balance actually is as of a date, and the
 * Server Action reconciles that against the ledger-derived figure via
 * record_account_balance_correction — see src/features/accounts/actions.ts.
 */
export const balanceCorrectionSchema = z.object({
  accountId: uuidSchema,
  asOfDate: isoDateStringSchema,
  confirmedBalance: z.string().trim().min(1, "Enter the confirmed balance"),
  notes: notesSchema,
});
export type BalanceCorrectionInput = z.input<typeof balanceCorrectionSchema>;
