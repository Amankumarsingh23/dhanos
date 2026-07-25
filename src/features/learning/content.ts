/**
 * Money Classroom's content catalogue (PROMPT 38) — one entry per
 * financial-literacy topic, the exact list PROMPT 38 names. Deliberately a
 * plain, git-tracked TypeScript module rather than database rows: "content
 * is source/version controlled" means every wording change goes through the
 * same review/history as the rest of the codebase, not a UI-editable table
 * a household could silently drift between versions of.
 *
 * This is educational content, not individualized financial advice (see the
 * standing disclaimer rendered on every Money Classroom page). Every
 * section is checked against docs/money-calculation-rules.md §4 and
 * PROMPT 38's own list before being written — never claim a guaranteed
 * future return, that a specific asset must be bought, that a loan must be
 * taken, that a policy is legally sufficient, or a tax/legal conclusion
 * without a verified rule. Where a number is unavoidable (an interest-rate
 * example, an inflation rate), it is always labeled as an illustrative
 * example, never this household's own assumption.
 *
 * `relatedInsightKey`, where set, is the one PROMPT-38-named personalized
 * insight (see src/lib/calculations/learning-insights.ts and
 * src/features/learning/queries.ts's LearningInsightKey) most relevant to
 * this topic — rendered inline on the topic page, deterministic and linked
 * back to its underlying records, never a guess when the household hasn't
 * entered the data it depends on.
 */

export type LearningCategory =
  | "Foundations"
  | "Borrowing & Credit"
  | "Investing"
  | "Protection & Planning"
  | "Safety";

export const LEARNING_CATEGORIES: readonly LearningCategory[] = [
  "Foundations",
  "Borrowing & Credit",
  "Investing",
  "Protection & Planning",
  "Safety",
];

export type LearningInsightKey =
  | "fixedCommitmentsRatio"
  | "emergencyFundCoverage"
  | "platformConcentration"
  | "debtToIncomeRatio"
  | "insuranceRenewalStatus"
  | "investmentContributionRate";

export type LearningSection = {
  heading: string;
  paragraphs: readonly string[];
};

export type LearningTopicDefinition = {
  slug: string;
  title: string;
  category: LearningCategory;
  /** One sentence shown on the topic card in the hub list. */
  summary: string;
  sections: readonly LearningSection[];
  keyTakeaways: readonly string[];
  relatedInsightKey?: LearningInsightKey;
};

export const LEARNING_TOPICS: readonly LearningTopicDefinition[] = [
  {
    slug: "cash-flow",
    title: "Cash flow",
    category: "Foundations",
    summary: "The movement of money in and out over a period — the starting point for every other topic here.",
    sections: [
      {
        heading: "What cash flow means",
        paragraphs: [
          "Cash flow is simply money moving: what comes in (income) and what goes out (expenses, debt payments, transfers into investments) over a period, usually a month. It is not the same as how much money you have — that is a balance, a snapshot at one moment. Cash flow is the story of movement between two snapshots.",
          "Positive cash flow means more came in than went out; negative means the reverse. Neither is automatically good or bad in isolation — a month with negative cash flow because of a planned one-time purchase reads very differently from a pattern repeating every month.",
        ],
      },
      {
        heading: "Why it's tracked separately from a bank balance",
        paragraphs: [
          "A bank balance can rise or fall for reasons that have nothing to do with income or spending — moving money between your own accounts, for instance. Cash flow tracking deliberately excludes those transfers so the income and expense figures reflect only money actually earned or actually spent, not money relocated.",
        ],
      },
    ],
    keyTakeaways: [
      "Cash flow is movement (a period); balance is a snapshot (a moment).",
      "Transfers between your own accounts are not income or expense.",
      "One negative month is a data point, not automatically a problem — the pattern over several months is what matters.",
    ],
    relatedInsightKey: "fixedCommitmentsRatio",
  },
  {
    slug: "income-vs-wealth",
    title: "Income versus wealth",
    category: "Foundations",
    summary: "Earning a lot and having a lot are different things — wealth is what remains after spending, over time.",
    sections: [
      {
        heading: "Two different numbers",
        paragraphs: [
          "Income is what flows in during a period — a salary, business revenue, rental income. Wealth (or net worth) is what has accumulated: everything owned, minus everything owed, measured at a point in time.",
          "A high income does not automatically create wealth if spending rises to match it. A modest income can still build wealth steadily if a consistent share of it is retained rather than spent.",
        ],
      },
      {
        heading: "How the two connect",
        paragraphs: [
          "Wealth grows from the portion of income that isn't spent — what's often called the savings rate — being retained as cash, invested, or used to reduce debt. Two people with the same income can end up with very different wealth over time purely based on what share of each period's cash flow was kept versus spent.",
        ],
      },
    ],
    keyTakeaways: [
      "Income is a flow (per period); wealth is a stock (at a point in time).",
      "A high income doesn't guarantee wealth — what's retained matters more than what's earned.",
      "Net worth (this app's dedicated tracking) is the running scoreboard for wealth; cash flow is the scoreboard for income and spending.",
    ],
  },
  {
    slug: "needs-and-wants",
    title: "Needs and wants",
    category: "Foundations",
    summary: "Distinguishing essential spending from discretionary spending is the basis for most budgeting decisions.",
    sections: [
      {
        heading: "The distinction",
        paragraphs: [
          "A need is spending required to maintain basic living and obligations — housing, groceries, utilities, minimum debt payments, essential healthcare. A want is spending that improves quality of life but isn't required to function — dining out, entertainment, upgrades, and most discretionary purchases.",
          "The line isn't always sharp and can vary by household and circumstance — a car might be a need for someone commuting to work and a want for someone with reliable public transit nearby. What matters is that the household has made its own explicit, conscious classification, not that any external rule dictates it.",
        ],
      },
      {
        heading: "Why the split matters",
        paragraphs: [
          "Separating needs from wants makes it possible to see how much spending is genuinely inflexible versus how much could be adjusted if circumstances required it — during a job loss, an emergency, or when deciding how aggressively to save.",
        ],
      },
    ],
    keyTakeaways: [
      "Needs are what's required to function; wants improve quality of life but are more flexible.",
      "The classification is a household's own judgment call, not a universal rule.",
      "Knowing the split shows how much spending could flex if circumstances changed.",
    ],
  },
  {
    slug: "simple-interest",
    title: "Simple interest",
    category: "Foundations",
    summary: "Interest calculated only on the original principal, never on interest already earned or charged.",
    sections: [
      {
        heading: "The formula",
        paragraphs: [
          "Simple interest = Principal × Rate × Time. If ₹10,000 is placed at a 6% annual simple interest rate for 3 years, the interest earned each year is a fixed ₹600 (6% of ₹10,000), for a total of ₹1,800 over 3 years — the principal used in the calculation never changes.",
          "This is different from compound interest, where interest is calculated on a growing balance that includes previously earned interest (see the next topic). Simple interest is common in some loan structures and short-term instruments; compound interest is far more common for savings, investments, and most loans in practice.",
        ],
      },
    ],
    keyTakeaways: [
      "Simple interest = Principal × Rate × Time — the principal used never grows.",
      "Every year earns/costs the same amount in absolute terms.",
      "Real rates shown here are illustrative examples only, not a projection for any specific account or loan.",
    ],
  },
  {
    slug: "compound-interest",
    title: "Compound interest",
    category: "Foundations",
    summary: "Interest calculated on principal plus previously accumulated interest — growth that accelerates over time.",
    sections: [
      {
        heading: "The formula",
        paragraphs: [
          "Compound interest applies the rate not just to the original principal but to the running total, including interest already added. The general formula is A = P × (1 + r/n)^(n×t), where P is principal, r is the annual rate, n is how many times per year it compounds, and t is time in years.",
          "For example, ₹10,000 at 6% compounded annually becomes ₹10,600 after year one — but in year two, the 6% applies to ₹10,600, not ₹10,000, giving ₹11,236. Over long periods, this compounding effect produces meaningfully more growth than simple interest at the same stated rate.",
        ],
      },
      {
        heading: "Why the compounding frequency matters",
        paragraphs: [
          "The same annual rate produces slightly different results depending on whether it compounds annually, monthly, or daily — more frequent compounding produces marginally more growth, because interest starts earning its own interest sooner.",
        ],
      },
    ],
    keyTakeaways: [
      "Compound interest grows on principal plus previously earned interest, not just the original principal.",
      "The effect compounds over time — the difference from simple interest widens the longer money stays invested or borrowed.",
      "Any rate used in an example here is illustrative only — see this app's calculators for projections built from a rate you supply, always labeled as an assumption, never a guarantee.",
    ],
  },
  {
    slug: "inflation",
    title: "Inflation",
    category: "Foundations",
    summary: "The general rise in prices over time, which erodes the purchasing power of money that isn't growing at least as fast.",
    sections: [
      {
        heading: "What it means",
        paragraphs: [
          "Inflation measures how much prices for goods and services rise, on average, over a period — commonly reported as an annual percentage. If inflation is 5% in a year, something that cost ₹100 at the start of the year would, on average, cost about ₹105 by the end.",
          "Money that sits idle, or grows slower than inflation, loses purchasing power over time even though the number on a statement stays the same or grows a little — the same ₹100 buys less next year if prices have risen faster than that ₹100 did.",
        ],
      },
      {
        heading: "Real versus nominal figures",
        paragraphs: [
          "A \"nominal\" return is the plain percentage growth of an amount. A \"real\" return subtracts the inflation rate to show growth in actual purchasing power. Any inflation-adjusted figure shown anywhere in this app always states the inflation rate it assumed alongside the number — never hidden behind it.",
        ],
      },
    ],
    keyTakeaways: [
      "Inflation is the general rise in prices — it reduces what a fixed amount of money can buy over time.",
      "A nominal return can look positive while a real (inflation-adjusted) return is flat or negative.",
      "Any inflation assumption used in a projection is always shown next to the figure it affects.",
    ],
  },
  {
    slug: "loans-and-emis",
    title: "Loans and EMIs",
    category: "Borrowing & Credit",
    summary: "How borrowed money is repaid over time through Equated Monthly Instalments, split between principal and interest.",
    sections: [
      {
        heading: "What an EMI is",
        paragraphs: [
          "An EMI (Equated Monthly Instalment) is a fixed monthly payment that repays a loan over its agreed term. Each EMI is split into two parts: a principal component (reducing what's owed) and an interest component (the cost of borrowing). Early in a loan's term, a larger share of each EMI typically goes to interest; later, a larger share goes to principal, even though the total EMI amount usually stays the same.",
        ],
      },
      {
        heading: "Why principal and interest are tracked separately",
        paragraphs: [
          "Knowing how much of what's been paid so far was interest versus principal shows the true cost of borrowing and how much is genuinely left to repay — the outstanding principal, not the sum of remaining EMIs, is what determines a prepayment's real effect.",
        ],
      },
    ],
    keyTakeaways: [
      "An EMI combines a principal component and an interest component in one fixed payment.",
      "Outstanding principal (not remaining EMI count) is what a loan actually still costs to pay off.",
      "This app's loan and EMI calculators compute these splits directly from what you've entered — see Debts and Calculators for the specifics of any loan you're tracking.",
    ],
  },
  {
    slug: "credit",
    title: "Credit",
    category: "Borrowing & Credit",
    summary: "Borrowed capacity — money made available to spend now against a promise to repay later, usually with interest.",
    sections: [
      {
        heading: "What credit is",
        paragraphs: [
          "Credit is the ability to borrow — a credit card limit, an overdraft facility, a line of credit. Using credit means spending money now that will need to be repaid later, typically with interest if not repaid within any interest-free period the credit provider offers.",
          "An unused credit limit is not owned money — it's borrowing capacity, and this app deliberately never counts it as part of net worth or as a liquid asset, even though it can feel like available money in daily life.",
        ],
      },
      {
        heading: "Cost and repayment behavior",
        paragraphs: [
          "How credit is used, and how promptly it's repaid, generally affects how it's viewed by future lenders. This app tracks credit accounts, balances, and repayment as financial records — it does not compute or report any external credit score or rating.",
        ],
      },
    ],
    keyTakeaways: [
      "Credit is borrowing capacity, not owned money — an unused limit is never counted as an asset.",
      "Interest and fees on unpaid credit balances are a real cost of borrowing, tracked like any other loan.",
      "This app records credit activity; it does not calculate or report any credit score.",
    ],
  },
  {
    slug: "emergency-funds",
    title: "Emergency funds",
    category: "Protection & Planning",
    summary: "Accessible money set aside to cover essential costs for a period without relying on new income or new borrowing.",
    sections: [
      {
        heading: "What it's for",
        paragraphs: [
          "An emergency fund is money kept somewhere genuinely accessible — not locked away, not requiring a sale first — specifically to cover essential living costs, EMIs, and insurance premiums if income stops or drops unexpectedly.",
          "Coverage is usually expressed in months: how many months of essential burn rate the accessible money on hand could sustain. There is no single correct number of months for every household — it depends on job stability, dependants, and how much certainty a household wants.",
        ],
      },
      {
        heading: "What typically counts, and what doesn't",
        paragraphs: [
          "Savings and current accounts usually count. Property, disputed money owed to you, unused credit limits, and long-locked retirement accounts typically don't, or only partly, since they can't reliably be turned into spendable money quickly. This app's Emergency Fund planner lists exactly which of your own accounts and investments it includes, and why, for full transparency.",
        ],
      },
    ],
    keyTakeaways: [
      "An emergency fund is measured in months of essential burn rate covered, not a single fixed amount.",
      "Only genuinely accessible money counts — locked or illiquid assets don't provide the same protection.",
      "Your own coverage figure, computed from your real accounts, is available on the Emergency Fund page.",
    ],
    relatedInsightKey: "emergencyFundCoverage",
  },
  {
    slug: "insurance",
    title: "Insurance",
    category: "Protection & Planning",
    summary: "A contract that transfers a specific financial risk to an insurer in exchange for a premium.",
    sections: [
      {
        heading: "How insurance works",
        paragraphs: [
          "Insurance is a pooled-risk arrangement: many people pay a premium, and the insurer pays out to the (comparatively few) people who experience the insured event within the policy term. Health, life, term, vehicle, home, and travel insurance each cover a different kind of risk.",
          "A policy has defined coverage, exclusions, and conditions — what it pays for, what it doesn't, and under what circumstances. Reading and understanding a policy's actual terms matters more than its category label.",
        ],
      },
      {
        heading: "Renewal and lapses",
        paragraphs: [
          "Most policies require renewal by a stated date; missing it can lapse coverage, sometimes permanently ending certain protections (like continuity benefits) that a fresh policy wouldn't restore. This app can only flag that a renewal or expiry date you entered is approaching or has passed — it never assesses or represents whether a policy is legally sufficient for your situation.",
        ],
      },
    ],
    keyTakeaways: [
      "Insurance transfers a specific, defined risk to an insurer for a premium — it isn't a general savings or investment product.",
      "What a policy actually covers and excludes matters more than its category label.",
      "This app tracks renewal/expiry dates you enter and flags them as approaching or passed — it never interprets a policy's legal sufficiency.",
    ],
    relatedInsightKey: "insuranceRenewalStatus",
  },
  {
    slug: "mutual-funds",
    title: "Mutual funds",
    category: "Investing",
    summary: "A pooled investment vehicle where many investors' money is combined and professionally managed across a basket of holdings.",
    sections: [
      {
        heading: "How they work",
        paragraphs: [
          "A mutual fund pools money from many investors and invests it in a basket of assets — stocks, bonds, or a mix — according to the fund's stated strategy. Each investor owns units representing their share of the pooled portfolio; the unit's value (NAV) rises or falls with the underlying holdings.",
          "Funds vary widely by strategy, risk level, and cost (expense ratio). A fund's past performance describes what already happened to that specific portfolio under specific market conditions — it does not predict what will happen next.",
        ],
      },
    ],
    keyTakeaways: [
      "A mutual fund pools money across many investors into one professionally managed portfolio.",
      "Unit value moves with the underlying holdings — it can fall as well as rise.",
      "Past performance is a historical fact about that fund, not a promise about future returns.",
    ],
  },
  {
    slug: "sips",
    title: "SIPs",
    category: "Investing",
    summary: "Systematic Investment Plans — committing a fixed amount at a regular interval, rather than investing a lump sum at once.",
    sections: [
      {
        heading: "How SIPs work",
        paragraphs: [
          "A SIP is a recurring contribution of a fixed amount (say, a set sum every month) into an investment, typically a mutual fund. Because the amount is fixed but the unit price varies, a SIP buys more units when prices are lower and fewer when prices are higher — an effect sometimes called rupee-cost averaging.",
          "SIPs suit money set aside from ongoing income; they don't eliminate market risk — the underlying investment can still lose value, and a SIP paused or missed doesn't retroactively change what was already contributed.",
        ],
      },
    ],
    keyTakeaways: [
      "A SIP is a fixed amount contributed at a regular interval, not a separate asset class of its own.",
      "It averages the purchase price over time — it doesn't guarantee a positive return.",
      "This app's SIP tracking distinguishes missed occurrences from completed contributions — a missed SIP is never counted as if it happened.",
    ],
    relatedInsightKey: "investmentContributionRate",
  },
  {
    slug: "stocks",
    title: "Stocks",
    category: "Investing",
    summary: "A share representing partial ownership in a company, whose value moves with the company's performance and market sentiment.",
    sections: [
      {
        heading: "What owning a stock means",
        paragraphs: [
          "A stock (or share) represents a fractional ownership stake in a company. Its price is set by what buyers and sellers are willing to trade it for, which reflects the company's actual performance, expectations about its future, and broader market conditions — all of which can change quickly.",
          "Some companies pay a portion of profit to shareholders as dividends; not all do. A stock's price can rise or fall independently of whether it pays a dividend.",
        ],
      },
      {
        heading: "Volatility",
        paragraphs: [
          "Individual stock prices can swing considerably over short periods. Historical patterns describe what has happened to specific stocks or markets in the past — they are not a guarantee of what any specific stock will do next.",
        ],
      },
    ],
    keyTakeaways: [
      "A stock is a fractional ownership stake in a company, not a fixed-return instrument.",
      "Price reflects company performance and market sentiment together, and can be volatile in the short term.",
      "No historical pattern guarantees a specific future outcome for any stock.",
    ],
  },
  {
    slug: "diversification",
    title: "Diversification",
    category: "Investing",
    summary: "Spreading exposure across different assets, platforms, or categories so no single one determines the overall outcome.",
    sections: [
      {
        heading: "The core idea",
        paragraphs: [
          "Diversification means not concentrating everything in one place — one stock, one asset class, one platform, one institution. If a single holding or platform experiences a problem, a diversified portfolio is affected less than a concentrated one, because other holdings aren't necessarily affected the same way at the same time.",
          "Diversification can apply across several dimensions at once: asset class (stocks versus bonds versus cash), sector or geography, and platform or custodian (where the investment is actually held). Concentration on a single platform is an operational and access risk distinct from the investment's own market risk — even a well-diversified set of holdings can share a single point of failure if they all sit with one provider.",
        ],
      },
    ],
    keyTakeaways: [
      "Diversification spreads exposure so no single holding, sector, or platform determines the whole outcome.",
      "Platform concentration is a distinct risk from market risk — it's about where holdings sit, not just what they are.",
      "This app can show how concentrated your own portfolio currently is on its single largest platform — see below.",
    ],
    relatedInsightKey: "platformConcentration",
  },
  {
    slug: "risk",
    title: "Risk",
    category: "Investing",
    summary: "The possibility that an actual outcome differs from what was expected — including the possibility of loss.",
    sections: [
      {
        heading: "What financial risk means",
        paragraphs: [
          "In a financial context, risk describes the range of possible outcomes and their uncertainty — not just the chance of loss, but the chance that actual results (positive or negative) differ from what was expected. Generally, asset types offering the potential for higher returns also carry a wider range of possible outcomes, including larger potential losses over shorter periods.",
          "Risk isn't only about individual assets — it also includes liquidity risk (how quickly something can be turned into spendable money without a discount), concentration risk (see Diversification), and timeline risk (needing money back sooner than an investment's typical holding period allows).",
        ],
      },
    ],
    keyTakeaways: [
      "Risk is about the range and uncertainty of outcomes, not only the chance of loss.",
      "Higher potential returns are generally associated with a wider range of possible outcomes, not a guarantee of a better result.",
      "Liquidity, concentration, and timeline are all distinct forms of risk beyond an asset's own price volatility.",
    ],
  },
  {
    slug: "nominations",
    title: "Nominations",
    category: "Protection & Planning",
    summary: "Naming who should receive an account's or policy's proceeds, intended to simplify claims after the holder's death.",
    sections: [
      {
        heading: "What a nomination does",
        paragraphs: [
          "A nomination names a specific person to receive the proceeds of an account, policy, or investment if the holder dies, generally intended to make the claims process faster and simpler for that named person.",
          "A nomination is a practical instruction to the institution holding the asset — it is a distinct concept from a will or broader estate/succession arrangements, and how the two interact can depend on the specific rules governing that asset and jurisdiction. This app tracks which of your accounts, policies, and investments have a nominee recorded and who it is — it does not offer legal interpretation of how a nomination interacts with succession law.",
        ],
      },
    ],
    keyTakeaways: [
      "A nomination names who should receive an asset's proceeds — a practical instruction to the holding institution.",
      "A nomination is not the same thing as a will, and the relationship between the two can vary by asset and jurisdiction.",
      "This app records nominee details you enter; it does not provide legal interpretation of succession outcomes.",
    ],
  },
  {
    slug: "net-worth",
    title: "Net worth",
    category: "Protection & Planning",
    summary: "Everything owned minus everything owed, at a single point in time — the running scoreboard of accumulated wealth.",
    sections: [
      {
        heading: "The calculation",
        paragraphs: [
          "Net worth = total assets − total liabilities. Assets include cash and account balances, investment values, and owned property; liabilities include outstanding loans and other debts. Unlike income or cash flow, net worth is a snapshot, not a rate — it changes as balances, valuations, and debts change, not over a period.",
          "A missing or outdated valuation for an asset doesn't make its true value zero — it just means that component is less certain. This app's Net Worth tracking always reports what fraction of the total had a real, current valuation, rather than letting an incomplete figure look more precise than it is.",
        ],
      },
    ],
    keyTakeaways: [
      "Net worth is assets minus liabilities, measured at a point in time, not a flow like income.",
      "A missing valuation reduces completeness, not the reported value to zero.",
      "Net worth trends over recorded snapshots — never backdated or invented — are the more meaningful signal than any single figure alone.",
    ],
  },
  {
    slug: "financial-fraud",
    title: "Financial fraud",
    category: "Safety",
    summary: "Deception intended to cause a financial loss or an unauthorized gain — recognizing common patterns is the first defense.",
    sections: [
      {
        heading: "Common patterns",
        paragraphs: [
          "Financial fraud takes many forms: phishing messages impersonating a bank or institution, fake investment schemes promising unusually high or guaranteed returns, requests to share one-time passwords or account credentials, and impersonation of someone the household knows or trusts.",
          "A common thread across most schemes is urgency combined with a request for money, credentials, or remote access — legitimate institutions generally do not ask for passwords, full card details, or OTPs over a call or message.",
        ],
      },
      {
        heading: "A guaranteed high return is a warning sign",
        paragraphs: [
          "Any offer promising a guaranteed high return with little or no risk should be treated with skepticism — genuine investments carry risk, and no legitimate provider can guarantee a specific outcome (see the Risk topic). This principle applies regardless of how credible the source appears.",
        ],
      },
      {
        heading: "What this app does and doesn't do",
        paragraphs: [
          "This app can help by keeping a clear, dated record of accounts, transactions, and decisions, which makes it easier to notice something unexpected. It does not monitor your accounts for fraud in real time, does not verify the legitimacy of any institution or scheme, and does not replace reporting a suspected fraud to your bank, institution, or the relevant authorities.",
        ],
      },
    ],
    keyTakeaways: [
      "Urgency plus a request for money, credentials, or an OTP is a common fraud pattern.",
      "A guaranteed high return with little or no risk is a warning sign, not a legitimate offer.",
      "This app keeps records that can help you notice something unusual — it does not detect, monitor for, or report fraud on your behalf.",
    ],
  },
] as const;

export function getLearningTopic(
  slug: string,
): LearningTopicDefinition | undefined {
  return LEARNING_TOPICS.find((topic) => topic.slug === slug);
}

export function learningTopicsByCategory(): Map<
  LearningCategory,
  LearningTopicDefinition[]
> {
  const map = new Map<LearningCategory, LearningTopicDefinition[]>();
  for (const category of LEARNING_CATEGORIES) {
    map.set(category, []);
  }
  for (const topic of LEARNING_TOPICS) {
    map.get(topic.category)?.push(topic);
  }
  return map;
}
