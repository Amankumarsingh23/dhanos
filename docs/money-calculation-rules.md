# DhanOS — Money Calculation Rules

Status: **binding constitution**. These rules govern every schema, server action, and calculator built for DhanOS. They exist because financial software that gets arithmetic or history wrong is worse than no software — treat violations of this document as correctness bugs, not style issues.

## 1. Money representation

- **Store authoritative amounts as integer minor units.** For INR, ₹100.25 is stored as `10025` paise, in a `bigint` column (`amount_minor_units`), never as a `numeric`/`float`/`double` "rupees" value.
- **Store the ISO currency code separately**, alongside every amount (`currency_code`), never inferred from context. A money value is the pair `(amount_minor_units, currency_code)`, not the integer alone.
- **Never use binary floating-point arithmetic for authoritative money calculations**, in the database or in application code. `float`/`double`/JS `number` arithmetic on money is disallowed for anything that gets persisted or displayed as a real figure (sums, balances, interest, projections' *principal* inputs). Use integer arithmetic on minor units, or a decimal library (e.g. `dinero.js`, `decimal.js`, `big.js`) that avoids binary float representation error.
- **Formatting belongs in presentation utilities.** Converting `10025` paise + `INR` into the string `"₹100.25"` (locale-aware grouping, symbol placement, decimal places per currency) happens only at render time, in a dedicated formatting module — never by dividing by 100 and treating the result as the new authoritative value.
- **Database constraints must reject impossible values where appropriate.** Examples: a zero-amount transaction where zero is meaningless, a negative premium on an insurance policy, a `loan_payments` row where `principal_component + interest_component <> amount_minor_units`. Prefer a `CHECK` constraint over "the application will validate it" wherever the invariant is simple and absolute.

## 2. Accounts and transactions

- **A transaction is not the same as an account balance.** Balance is a derived/materialized figure computed from the transaction ledger (or a periodic reconciled snapshot), never a bare mutable field that's edited directly to "fix" a number.
- **A transfer between owned accounts is not income or expense.** It must be modeled as its own transaction type (or a linked pair) and excluded from income/expense totals and reports by construction, not by a filter someone might forget to apply.
- **An investment contribution is not a consumption expense.** SIP contributions, lump-sum buys, and staking deposits use a distinct transaction type (`investment_contribution`) so cash-flow reports don't conflate "money spent" with "money moved into an asset the household still owns."
- **Loan principal and loan interest must be distinguishable.** Every loan payment record splits into a principal component and an interest component (both required); "total outstanding principal" and "total interest paid to date" must always be independently computable, never commingled into one payment figure.
- **Refunds should link to or clearly reverse the original expense.** A refund is not unlabeled income — it references the transaction it reverses (fully or partially) so net spending for a category stays accurate and the reversal is auditable.
- **Corrections must preserve traceability.** Fixing a miscategorized or mistakenly-entered transaction creates an adjustment record (or a clearly linked replacement referencing the original), rather than silently rewriting the original row's amount/category in place.

## 3. Historical records

- **Do not overwrite historical valuations.** Every valuation is a new, dated `ValuationSnapshot` row; updating a past valuation in place is disallowed even for "corrections" — a correction is a new snapshot with a note, or an explicit superseding record.
- **Store valuation snapshots**, not a single "current value" field with no history, for every investment, staking position, and asset — net-worth trend lines depend on this existing from day one, not being retrofitted later.
- **Do not overwrite loan-payment history.** Each payment is an immutable, append-only row.
- **Do not overwrite prior monthly closing reports.** A `MonthlyClosing` is locked once created; a later correction produces a new closing record that references (`supersedes_closing_id`) the one it corrects.
- **Corrections should create adjustment records or a traceable replacement** — this is the general pattern across all of the above, not a special case per entity.
- **Reports must identify the data cutoff date.** Every generated `Report` stores `data_cutoff_at` (what point-in-time the figures reflect) distinct from `generated_at` (when the report was produced) — the two will diverge whenever a report is regenerated or viewed later.

## 4. Projections

- **Future returns are assumptions.** Any projected growth rate, expected return, or yield used in a calculator is a labeled input the user (or a documented default) supplied, never presented as a fact.
- **Compounding output is not guaranteed.** Projection outputs are framed as "if these assumptions hold," with the assumptions shown alongside the number, not hidden behind it.
- **Inflation assumptions must be visible.** Any real-terms/inflation-adjusted figure must show the inflation rate assumed, next to the figure, not buried in a tooltip or settings page only.
- **Daily-return projections require prominent risk language.** Any calculator that compounds a daily/short-horizon return (common for crypto/high-volatility assets) must carry clearly visible risk disclosure at the point of display, not just in a terms page — daily compounding assumptions are the easiest place for a projection to look far more confident than it should.
- **The app must distinguish actual performance from projected performance** — visually (distinct styling, e.g. dashed projection lines vs. solid actual lines on charts) and structurally (projections and actuals are different entities/tables, never merged into one series that could be mistaken for a single ground truth).

## 5. How this document is used

- Every schema migration touching a money column or a historical/append-only table is checked against sections 1 and 3 before being written (see [database-plan.md](./database-plan.md)).
- Every calculator or projection feature is checked against section 4 before its UI is built (see [product-scope.md](./product-scope.md) §3.8).
- Code review for any PR touching transactions, loans, valuations, or reports should treat a violation of this document as a blocking correctness issue.
- A dedicated audit of the app's calculation code against every rule in this document has since been conducted (PROMPT 46) — see [financial-correctness-review.md](./financial-correctness-review.md) for the evidence (which tests/live-database checks back which claim) and the one real gap it found and fixed (net worth's silent cross-currency exclusion, §2 #16 there). That review is explicit about what it does and doesn't prove — read its §4 before citing it as a blanket correctness guarantee.
