/**
 * Global search (PROMPT 39) — the 16 named searchable entity types, in the
 * fixed display order every grouped result view (command palette, the
 * dedicated search page) renders them in.
 */
export type SearchEntityType =
  | "account"
  | "transaction"
  | "category"
  | "person"
  | "institution"
  | "investment"
  | "sip"
  | "staking_position"
  | "loan"
  | "borrower"
  | "insurance_policy"
  | "asset"
  | "liability"
  | "goal"
  | "document"
  | "decision";

export const SEARCH_ENTITY_ORDER: readonly SearchEntityType[] = [
  "account",
  "transaction",
  "category",
  "person",
  "institution",
  "investment",
  "sip",
  "staking_position",
  "loan",
  "borrower",
  "insurance_policy",
  "asset",
  "liability",
  "goal",
  "document",
  "decision",
];

export const SEARCH_ENTITY_LABELS: Record<SearchEntityType, string> = {
  account: "Accounts",
  transaction: "Transactions",
  category: "Categories",
  person: "People",
  institution: "Institutions",
  investment: "Investments",
  sip: "SIPs",
  staking_position: "Staking positions",
  loan: "Loans",
  borrower: "Borrowers",
  insurance_policy: "Insurance policies",
  asset: "Assets",
  liability: "Liabilities",
  goal: "Goals",
  document: "Documents",
  decision: "Decisions",
};

export type SearchResultRow = {
  entityType: SearchEntityType;
  id: string;
  /** The record's own display name/title — what the match highlight is applied to. */
  title: string;
  /** Short, non-monetary context line (type/category/date) — never an amount, so a search result never needs its own privacy-mode concealment. */
  subtitle: string | null;
  href: string;
};

export type SearchResultGroup = {
  entityType: SearchEntityType;
  label: string;
  rows: SearchResultRow[];
};
