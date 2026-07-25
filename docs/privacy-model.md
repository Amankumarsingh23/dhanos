# DhanOS — Privacy Model

Status: **current**, describing the implemented system (PROMPT 45). Complements [security-model.md](./security-model.md) and [threat-model.md](./threat-model.md), which cover *who could get unauthorized access and how it's prevented*. This document covers a different question: *what data does DhanOS hold, why, who legitimately sees it, and what control does a household have over it* — privacy as data governance, not as an attack surface.

## 1. What data DhanOS holds, and why

| Category | Examples | Why it's collected |
|---|---|---|
| Identity | Email, display name | Authentication and addressing the user in the UI |
| Account metadata | Institution name, account type, a *masked* identifier | Distinguishing accounts in the UI without storing a full account number |
| Transactions | Amount, date, category, counterparty, free-text description/notes | The core ledger — the entire reason the app exists |
| Investments | Holdings, valuations, SIP schedules | Portfolio tracking |
| Debt | Loans, lending (money owed *to* the household), general liabilities | Net-worth and cash-flow accuracy require the full financial picture, not just assets |
| Insurance | Policy type, coverage/premium amounts, nominee (a `people` row, not a name string), masked policy number | Coverage-gap analysis, renewal reminders |
| Documents | Bank statements, policy PDFs, receipts (uploaded files) | Record-keeping the household explicitly chose to store |
| People | Household members and named third parties (a nominee, a lending counterparty) — display name, relationship, optional birth date/notes | Attribution ("whose account is this," "who is the policy nominee") without needing a full identity record |

**What DhanOS deliberately does *not* collect**: full unmasked account/card numbers (the schema stores `masked_identifier`, e.g. `XXXX4821`, by design — see `financial_accounts.masked_identifier`), government ID numbers, biometric data, precise real-time location, or anything from a third-party data broker. There is no analytics/tracking pixel, no ad SDK, and no third-party script of any kind in the app — confirmed by the same review that found zero `dangerouslySetInnerHTML`/external-script injection points (see [security-review.md](./security-review.md)).

## 2. Who can see what

- **Household is the privacy boundary**, not the individual user. Every `active` member of a household (any role — `owner`/`admin`/`editor`/`viewer`) can read the household's full financial picture; this is a deliberate product decision (a household's finances are meant to be visible to the household), not an oversight. Role only gates *write* access, not *read* access, within a household.
- **No cross-household visibility, ever** — enforced by Row Level Security independently of application code, and verified with live attacks using two real, independently-created users (see security-review.md §3). This is the one privacy property this document treats as non-negotiable.
- **A person record (nominee, lending counterparty) does not need their own account.** They're represented as a `people` row scoped to the household that entered them — they have no visibility into DhanOS themselves and no way to know they're recorded, which is worth stating plainly: DhanOS holds data *about* people who never consented to or interacted with the app, by the nature of a financial record needing to name a nominee or a person someone lent money to. This is the same category of data any paper-based financial record-keeping would hold (a will, a loan agreement), not a novel collection.
- **No DhanOS staff/operator access path exists in the application itself.** There is no admin panel, no support-impersonation feature, no "view as household" tool. The only way to see a household's data outside the household's own members is direct database access (a platform-level operational concern — see threat-model.md §5) or the narrowly-scoped, currently-unused service-role key (threat-model.md §4.5).

## 3. Household-facing privacy controls

These are the controls a household actually has, today, in the running app:

- **Privacy mode** (`SensitiveAmount`, `ChartCard`'s concealed state) — a one-cookie, purely presentational toggle that masks every rendered amount across the entire app at once, including every dashboard chart. It never touches stored data; concealing and revealing are both instant, client-side, and reversible by design. A screen reader gets an explicit "Amount hidden" rather than reading out mask characters. This is a *shoulder-surfing deterrent*, not access control — anyone holding the session can toggle it back — and the app never claims otherwise.
- **Screenshot-sensitive mode** — blurs the app's content whenever the browser tab loses focus or visibility (switching apps, a screen share starting). Its own doc comment states the honest limit explicitly: *no web API can prevent an actual OS-level screenshot or screen recording* — this is a deterrent against incidental/shoulder-surfing exposure, never claimed as a real technical barrier.
- **Concealed-on-launch** — an optional per-profile preference that starts every new browser session with privacy mode already on, so the first paint after opening the app on a shared/family device never shows a real figure by default.
- **Data export** (JSON or selected CSV files) — a household's own complete data, self-service, owner/admin only, rate-limited. This is the app's data-portability mechanism.
- **Archiving** — a household, once archived, is excluded from normal use and its owner is routed to a dedicated notice page rather than back into the app; the data itself is untouched (`households.deleted_at` is set, nothing is deleted). This is explicitly a **soft, reversible** action, described honestly below.

## 4. Data retention and deletion

This is the section most worth being precise about, since "delete" means two different things in this app depending on what's being deleted:

- **Household-level archival is soft, not deletion.** `archiveHouseholdAction` sets `households.deleted_at` and nothing else — every financial record underneath remains in the database, unmodified, forever, unless later hard-deleted at the individual-record level (see below). This is a deliberate consequence of the append-only domain model (see [money-calculation-rules.md](./money-calculation-rules.md)): the system is built around the assumption that a financial record, once real, is never silently destroyed. **There is currently no self-service "permanently erase my entire household" flow.**
- **Individual document deletion is a real, permanent hard delete** — `deleteDocumentAction` removes both the database row and the underlying Storage object, restricted to `owner`/`admin`. This is the one place in the app where "delete" means what it says.
- **Most financial records (transactions, loan payments, valuation snapshots, etc.) have no delete path at all by design** — RLS policies for these tables intentionally omit a `DELETE` policy (or restrict it to `owner`/`admin` where a correction genuinely needs one), because the domain model treats history as append-only; a mistake is corrected by a new, offsetting record (a refund, a reversal), never by rewriting or removing the original — see money-calculation-rules.md for why this matters for financial correctness, independent of the privacy angle.
- **Practical implication for a real deployment**: if DhanOS were operated as a real service subject to a "right to erasure" request (e.g. GDPR Article 17), full account/household erasure is **not yet a built feature** — today's honest answer to "can a user get their data permanently and completely deleted" is "documents, yes; the household and its financial history, no, only archived." This is a genuine, disclosed gap, not something to gloss over — see §5's recommendation.

## 5. Recommendations for a real deployment

- **Build a real erasure flow** if DhanOS is ever operated for real users under a jurisdiction requiring it (GDPR/CCPA-style rights). This is a product decision with real trade-offs against the append-only design, not a quick technical fix — worth scoping deliberately rather than bolting on.
- **Publish a real, user-facing privacy policy and terms of service** before any real deployment — this document and its siblings are internal engineering documentation, not a substitute for the legal-facing document a real user would need to read and consent to.
- **Decide a retention policy for `activity_events`** (the audit-trail table used for the export rate limiter and general operation history) — currently append-only with no stated retention horizon; fine for a local/demo deployment, worth an explicit decision (and possibly a scheduled purge) before real-user data accumulates indefinitely.
- **Revisit whether `people` rows for non-user third parties** (nominees, lending counterparties) need their own disclosure/consent story if DhanOS is ever deployed for real households — see §2's note that these are recorded without the named person's own knowledge or consent, same as any paper financial record, but worth a deliberate policy decision rather than an inherited default.
