import type { ReportFilterKey } from "@/lib/validation/reports";

/**
 * The reporting centre's report catalogue (PROMPT 36) — one entry per
 * report, driving both the `/app/reports` hub (grouped by category) and
 * `/app/reports/[slug]` (which filters to show, and the page title/
 * question). Every report here answers one specific, named question
 * ("chart rules: answer a specific question") — that question is
 * `description`, shown directly under the report title, never left
 * implicit.
 *
 * `isPointInTime` distinguishes a snapshot report ("as of now" — no
 * meaningful period to filter by, so `dateRange` is deliberately absent
 * from its `relevantFilters`) from a period-based one (a real date range
 * the household can narrow).
 */

export type ReportCategory =
  | "Cash flow"
  | "Investments"
  | "Debt"
  | "Protection & property"
  | "Lending"
  | "Planning"
  | "Net worth";

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  "Cash flow",
  "Investments",
  "Debt",
  "Protection & property",
  "Lending",
  "Planning",
  "Net worth",
];

export type ReportDefinition = {
  slug: string;
  label: string;
  category: ReportCategory;
  /** The specific question this report answers — rendered as its description. */
  question: string;
  relevantFilters: readonly ReportFilterKey[];
  isPointInTime: boolean;
};

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    slug: "monthly-cash-flow",
    label: "Monthly cash flow",
    category: "Cash flow",
    question: "How much came in, went out, and was left over this period?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "income-by-source",
    label: "Income by source",
    category: "Cash flow",
    question: "Which income sources contributed how much this period?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "expense-by-category",
    label: "Expense by category",
    category: "Cash flow",
    question: "Where did spending go this period, by category?",
    relevantFilters: ["dateRange", "category"],
    isPointInTime: false,
  },
  {
    slug: "essential-vs-discretionary",
    label: "Essential vs. discretionary",
    category: "Cash flow",
    question: "How much of this period's spending was essential versus discretionary?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "investment-contributions",
    label: "Investment contributions",
    category: "Investments",
    question: "How much was contributed to investments, by month?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "portfolio-allocation",
    label: "Portfolio allocation",
    category: "Investments",
    question: "How is the portfolio allocated across asset classes right now?",
    relevantFilters: ["assetClass"],
    isPointInTime: true,
  },
  {
    slug: "portfolio-growth",
    label: "Portfolio growth",
    category: "Investments",
    question: "How has the portfolio's principal and growth changed over time?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "sip-consistency",
    label: "SIP consistency",
    category: "Investments",
    question: "How consistently were SIP contributions made on schedule this period?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "staking-performance",
    label: "Staking performance",
    category: "Investments",
    question: "How has actual staking value tracked against the expected projection?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "debt-position",
    label: "Debt position",
    category: "Debt",
    question: "How much is currently owed, and to whom?",
    relevantFilters: ["institution"],
    isPointInTime: true,
  },
  {
    slug: "debt-reduction",
    label: "Debt reduction",
    category: "Debt",
    question: "How has total outstanding debt changed over time?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
  {
    slug: "insurance-coverage",
    label: "Insurance coverage",
    category: "Protection & property",
    question: "How much coverage exists right now, by policy type?",
    relevantFilters: ["institution", "category"],
    isPointInTime: true,
  },
  {
    slug: "assets-and-liabilities",
    label: "Assets and liabilities",
    category: "Protection & property",
    question: "What does the household own and owe right now, by group?",
    relevantFilters: [],
    isPointInTime: true,
  },
  {
    slug: "lending-exposure",
    label: "Lending exposure",
    category: "Lending",
    question: "How much is currently owed to the household, and by whom?",
    relevantFilters: ["person", "institution"],
    isPointInTime: true,
  },
  {
    slug: "goal-readiness",
    label: "Goal readiness",
    category: "Planning",
    question: "How on-track are active financial goals toward their targets?",
    relevantFilters: ["person"],
    isPointInTime: true,
  },
  {
    slug: "emergency-fund-coverage",
    label: "Emergency-fund coverage",
    category: "Planning",
    question: "How many months of essential expenses could the emergency fund cover right now?",
    relevantFilters: [],
    isPointInTime: true,
  },
  {
    slug: "net-worth-history",
    label: "Net-worth history",
    category: "Net worth",
    question: "How has net worth changed over recorded snapshots?",
    relevantFilters: ["dateRange"],
    isPointInTime: false,
  },
] as const;

export function getReportDefinition(slug: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((report) => report.slug === slug);
}

export function reportsByCategory(): Map<ReportCategory, ReportDefinition[]> {
  const map = new Map<ReportCategory, ReportDefinition[]>();
  for (const category of REPORT_CATEGORIES) {
    map.set(category, []);
  }
  for (const report of REPORT_DEFINITIONS) {
    map.get(report.category)?.push(report);
  }
  return map;
}
