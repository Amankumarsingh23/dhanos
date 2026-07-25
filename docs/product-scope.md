# DhanOS — Product Scope

Status: **planning baseline, now substantially realized** (stale "no application code exists yet" corrected during the PROMPT 56 version-one audit). Nearly every module in §3 below is now implemented — see [implementation-status.md](./implementation-status.md) for the per-module build record and [version-one-release-notes.md](./version-one-release-notes.md) for the completion audit. This document remains the reference for what DhanOS is for and the feature surface every architectural/schema decision is checked against — kept as originally written rather than retrofitted, since the scope itself hasn't changed, only how much of it is built.

## 1. What DhanOS is

DhanOS is a personal financial operating system: a single place where an individual (and optionally their household) tracks money across accounts, investments, debts, insurance, and physical assets, and uses that data to plan future financial decisions. It is a system of record first, and an advisory/insight layer second — correctness and traceability of historical data outrank cleverness of projections.

## 2. Primary personas

- **Owner** — the primary user, full read/write across their financial workspace, manages household membership.
- **Household/family member** — a spouse, parent, or dependent with visibility into shared accounts/goals, scoped by permissions the owner grants.
- **Viewer** (future) — read-only access, e.g. an accountant or financial advisor invited temporarily.

## 3. Feature modules (v1 target surface)

Grouped by domain, not by implementation order (see [implementation-status.md](./implementation-status.md) for sequencing).

### 3.1 Identity & workspace
- Authentication (sign up, sign in, session management, password reset, optional OAuth)
- Personal financial workspace (the tenant boundary all data hangs off)
- Family and household members (invite, roles, shared visibility rules)

### 3.2 Money sources
- Institutions and financial platforms (banks, brokers, exchanges, wallets)
- Accounts and balances (checking, savings, credit, demat, wallet, crypto)
- Income sources (salary, freelance, rental, dividends, other)

### 3.3 Cash flow
- Expenses (categorized spending)
- Transfers (movement between owned accounts — not income/expense)
- Recurring commitments (subscriptions, EMIs, rent, bills)

### 3.4 Investing
- Investments (equities, mutual funds, bonds, crypto, alternative assets)
- SIPs (systematic investment plans / recurring contributions)
- Staking positions (crypto staking/yield)
- Valuation history (point-in-time snapshots, never overwritten)

### 3.5 Debt
- Loans (home, auto, personal, education — principal vs interest tracked separately)
- Lending and receivables (money the user has lent to others, and its recovery status)
- Liabilities (general obligations not modeled as a formal loan)

### 3.6 Protection & property
- Insurance (life, health, term, asset-linked policies, premiums, coverage, nominees)
- Movable assets (vehicles, jewelry, electronics)
- Immovable assets (real estate, land)

### 3.7 Planning
- Future financial goals (target amount, target date, linked contributions)
- Emergency-fund planning (target coverage in months, current coverage)
- Net-worth tracking (assets minus liabilities over time)
- Monthly financial closing (a locked, point-in-time monthly summary)

### 3.8 Operations & insight
- Documents (statements, policy PDFs, receipts — attached to entities above)
- Reminders (bill due dates, policy renewals, SIP dates)
- Reports (point-in-time, cutoff-dated financial reports)
- Projections and calculators (retirement, loan payoff, goal funding — clearly labeled as assumptions)
- Financial decision journal (a dated log of financial decisions and their stated rationale, for later review against outcomes)
- Financial-literacy explanations (contextual "what does this mean" content next to complex numbers)

### 3.9 Platform
- Data export (user's own data, portable format)
- Production deployment

## 4. Explicit non-goals for v1

- No multi-currency consolidation logic beyond storing each account's native currency (no live FX conversion engine in v1).
- No brokerage/bank API aggregation (Plaid-equivalent) in v1 — data entry is manual or CSV import; automated feed ingestion is a later phase. Bank-statement parsing (PDF/CSV upload with reviewed, confidence-scored extraction — not live account aggregation) is unblocked once this v1 scope is reliable; Account Aggregator integration remains explicitly gated behind legal/compliance research, provider selection, and an independent security review, none of which have been done. An AI financial assistant is a separate later phase with its own [privacy and architecture proposal](./ai-assistant-proposal.md), gated behind the non-AI product being production-reliable, not merely feature-complete.
- No collaborative editing/locking beyond simple household role-based access.
- No tax-filing computation (may reference figures, does not file).
- No investment advice / robo-advisory — projections are explicitly framed as assumptions, not recommendations (see [money-calculation-rules.md](./money-calculation-rules.md)).

## 5. Success criteria for the domain model

A correct DhanOS implementation must be able to answer, for any point in the past, using only immutable historical records:
1. What was my net worth on date X?
2. What did I actually earn/spend/invest in month Y, distinct from transfers and contributions?
3. What is outstanding loan principal vs. interest paid to date, per loan?
4. What assumptions underlie any projected future number shown to the user?
