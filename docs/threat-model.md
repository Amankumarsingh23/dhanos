# DhanOS — Threat Model

Status: **current**, written against the implemented system (PROMPT 45). Complements [security-model.md](./security-model.md) (the design) and [security-review.md](./security-review.md) (the audit that verified this model against the real, running app with real attacks — see that document for evidence and findings). This document is the analysis: what could go wrong, who would do it, and why each mitigation is where it is.

## 1. What's being protected

DhanOS stores a household's complete financial picture: account balances, transaction history, investment holdings, insurance policy details (coverage amounts, nominees), loan/lending records, and uploaded documents (bank statements, policy PDFs, identity-adjacent paperwork). None of it is anonymous or low-stakes — a leak exposes exactly the kind of information used for identity theft, targeted phishing, or straightforwardly reading someone's financial life without consent.

Two things make the *shape* of the risk specific to this app rather than a generic "protect the database" statement:

- **The data is append-only by design** (see [money-calculation-rules.md](./money-calculation-rules.md)) — a correctness requirement that happens to double as an audit trail. A successful attack that could *alter* history (not just read it) is worse here than in a system where records are freely mutable, because DhanOS's own domain model assumes history never changes.
- **Every household member with `editor` role or above can already write freely to their own household's data.** The threat model is therefore *not* "no untrusted user ever touches this data" — it's "household A's boundary around household B's data holds regardless of what any authenticated user does," and secondarily, "a household's own members can't do something the UI wouldn't let them do just because they went around the UI."

## 2. Actors

| Actor | Capability | Primary concern |
|---|---|---|
| Unauthenticated visitor | Has the public `anon` API key (it ships in every page load — not a secret) and can reach any public endpoint | Must never read or write anything household-scoped |
| Authenticated user, no household membership | Has a valid session but no `household_memberships` row for the household they're probing | Same as above — a valid login is not itself authorization |
| Authenticated user, member of a *different* household | Real session, real membership — just not in the target household | The most realistic "attacker" in this system: any signed-up user, trivially. Cross-household isolation is the single most load-bearing property in this threat model |
| A household's own member (editor/viewer) acting outside the UI | Legitimate credentials, direct REST/RPC calls instead of the app's forms | Bypassing client-side validation (mass assignment, malformed amounts, unexpected fields) must still be caught server-side |
| A user with a stolen/hijacked session (XSS, malware, shared device) | Everything the real user can do, for as long as the session is valid | Bounded by defense-in-depth: short-lived signed URLs, rate-limited export, no sensitive data in browser cache/history |
| Supabase/Vercel platform account compromise | Full control | **Explicitly out of scope for application-level mitigation** — this is operational credential hygiene (2FA, secret rotation), not something app code can defend against |

## 3. Trust boundaries

```
Browser (untrusted)
  │  cookies (Supabase session), no secrets in JS bundle beyond the public anon key
  ▼
Next.js Server (semi-trusted convenience layer)
  │  Server Components / Server Actions — re-verify identity via cookies on every request,
  │  never trust a client-submitted household_id/role without re-checking it
  ▼
Supabase Postgres — Row Level Security (the actual boundary)
  │  every query, from every layer above, executes as the authenticated user's own role;
  │  RLS policies are what actually decide what a query can see or write
  ▼
Supabase Storage — RLS on storage.objects (same household-scoping pattern)
```

The critical architectural decision this model rests on: **the Next.js layer is a UX convenience, not a security boundary.** `requireHousehold()`/`requireOnboardedUser()` redirect a signed-out visitor to a sane page instead of a broken one; they do not, by themselves, protect any data — RLS does that independently, so a bug in a Server Component's own logic (forgetting a check, a typo in a filter) degrades to "the correct data, fetched insecurely-looking-code" rather than "the wrong household's data," because the database itself refuses the query. This is verified directly, not just asserted — see [security-review.md](./security-review.md)'s live-attack results.

## 4. Threats, by category

Each entry: what it is, why it matters here specifically, and how it's mitigated. See [security-review.md](./security-review.md) for the corresponding verification (a live attack, a code citation, or both) and any residual gap.

### 4.1 Authentication bypass
Forging or guessing a valid session without real credentials. Mitigated entirely by Supabase Auth (cookie-based, `@supabase/ssr`) — no hand-rolled session logic exists anywhere in the app. Every server-side identity check calls `supabase.auth.getUser()`, which re-validates against Supabase Auth on every request rather than trusting an unverified cookie value.

### 4.2 Household-ID spoofing
Submitting a `household_id` the caller doesn't belong to, hoping a query trusts it. Mitigated at two independent layers: `requireHouseholdRole()`/`requireHouseholdMember()` re-verify the *submitted* id against `household_memberships` on every mutation (never trusting it because it arrived in the request), and RLS enforces the same boundary underneath regardless of whether the app-layer check was even called correctly. Live-tested: a forged `household_id` on an insert is rejected before it ever reaches a table, whether the mismatch is caught by RLS's `WITH CHECK` or by a business-consistency trigger that fires first (both reject unconditionally — see security-review.md).

### 4.3 Insecure direct object references (IDOR)
Guessing/incrementing another household's record id (an account, transaction, document, policy) and requesting it directly. Every household-scoped table's SELECT/UPDATE/DELETE policies filter by `is_household_member(household_id)`/`household_role(household_id)` — an id belonging to another household simply doesn't exist from the caller's point of view, at the database level, not just hidden by an application-layer `if`. Live-tested against accounts, transactions, and documents by exact known id.

### 4.4 Missing RLS
A tenant table created without RLS enabled, or with RLS enabled but no policies (which defaults to deny-all, a safer failure mode, but still a functional bug worth catching). Verified directly: all 51 tables in the `public` schema have `rowsecurity = true` and at least 2 policies each (queried live from `pg_tables`/`pg_policies`, not inferred from migration source) — see security-review.md for the full table.

### 4.5 Service-role exposure
The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely — if it ever reached the browser, or got used in a request path that echoes client-supplied filters, cross-tenant isolation would collapse instantly regardless of how correct every RLS policy is. Confirmed: the key is `server-only` (`src/lib/supabase/service-role.ts`), never referenced from a Client Component, and — as of this review — has **zero actual call sites** anywhere in the app. It exists schema-ready for a future cross-household aggregation job (per its own docstring) but isn't currently exercised by any request path, so there is no live RLS-bypass surface to audit for scoping mistakes today.

### 4.6 Storage access / signed URL duration
A document (bank statement, policy PDF) fetchable by URL guessing, or a permanent public link. Both buckets (`documents`, `avatars`) are private (`public = false`); every read goes through a signed URL generated server-side (`createSignedDownloadUrl`, `server-only`), 60–120 second TTL depending on context. `storage.objects` RLS mirrors the household-scoping pattern (path convention: `householdId/...`), and — the detail that actually matters — **the RLS check applies to signed-URL *minting* itself**, not just to reading an already-signed URL: an attacker who somehow learned a victim's exact storage path still can't get Storage to issue them a signed URL for it. Live-tested.

### 4.7 Malicious file upload
Uploading an oversized file or a disallowed type (an executable disguised as a document) directly against the Storage API, bypassing the app's client-side 25 MB/MIME-allowlist checks. **Found during this review and fixed**: neither bucket had a server-side `file_size_limit`/`allowed_mime_types` before PROMPT 45 — the client-side checks were the only guard. Both buckets now enforce the same limits server-side (`supabase/migrations/20260729100000_storage_bucket_limits.sql`), so a direct API call is rejected the same way the UI already was.

### 4.8 XSS / unsafe notes
Household-entered free text (transaction descriptions, notes, decision-journal rationale) rendered back as executable markup. React escapes all interpolated content by default; the app has **zero** `dangerouslySetInnerHTML` usage anywhere (confirmed by exhaustive grep), and the one feature that visually manipulates matched substrings (global search highlighting) does so by splitting into plain text nodes, never by building an HTML string — see the doc comment in `src/features/search/highlight.tsx`. No custom email-sending feature exists that could interpolate user content into an HTML template either (password reset/verification emails are Supabase Auth's own managed templates).

### 4.9 Open redirects
`?next=`/`redirect_to`-style parameters sent to an attacker-controlled external site. Every redirect-target-from-user-input call site (login, signup, the auth callback route, middleware) funnels through `getSafeRedirectPath()`, which rejects anything that isn't a same-origin path (protocol-relative `//`, absolute URLs, control characters, non-http(s) schemes).

### 4.10 Server-action invocation without login
Directly invoking a Server Action's compiled reference, bypassing the page that would normally gate it. Every one of the 30 `"use server"` files in the app calls at least one of `requireUser`/`requireHouseholdRole`/`requireHouseholdMember`/`runHouseholdMutation` (confirmed exhaustively, not sampled) — since these read the *request's own* session cookie via `supabase.auth.getUser()`, invoking an action's reference directly without a valid session fails the same way calling it normally would, regardless of how it was reached.

### 4.11 CSV formula injection
A malicious cell value (`=cmd|'/C calc'!A1`, `=HYPERLINK(...)`) that executes as a formula when a household later exports its own data and opens the CSV in a spreadsheet application. **Found during this review and fixed**: `buildCsv`'s cell-escaping only handled RFC 4180 quoting (commas/quotes/newlines), not formula-injection characters. Every cell starting with `=`, `+`, `-`, `@`, tab, or CR is now prefixed with a defusing apostrophe before RFC 4180 quoting is applied — fixed once in `src/lib/reports/csv.ts`, which both export surfaces (the reporting centre's per-report export and the full household data export) share.

### 4.12 Log leakage
Sensitive financial data (amounts, account identifiers, document paths) written to application logs. There are **zero** `console.log`/`console.error`/`console.warn`/`console.info`/`console.debug` calls anywhere in application code. `AppError`'s `cause` field is documented to carry anything sensitive precisely so it's never accidentally interpolated into a message shown to the user — see §4.17. Platform-level request logging (Vercel's own function logs, outside application code's control) is a residual, out-of-scope consideration, mitigated by the fact that `runHouseholdMutation` catches every error before it would otherwise propagate to an uncaught-exception log entry.

### 4.13 Sensitive browser caching
A shared/public computer's browser retaining a cached copy of a rendered page with real financial figures after logout, or via back/forward navigation. Verified live: every authenticated `/app/*` page (dynamic, cookie-dependent by construction, since they all call `requireHousehold()`) receives `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` from Next.js's own production defaults — no explicit configuration needed, and none was weakened.

### 4.14 Exported data exposure
The full household data-export feature (JSON/CSV) is the single highest-value target in the app — one request produces everything. Restricted to `owner`/`admin` roles (`requireHouseholdRole`, not just hidden in the UI), rate-limited to a small number of exports per rolling window per household (backed by the existing `activity_events` audit table, checked *before* the expensive export work runs), and every export is itself activity-logged.

### 4.15 Overexposed error messages
A raw database error (revealing schema/constraint internals) reaching an end user. Every Server Action result flows through `toUserMessage()`, which returns only an `AppError`'s own deliberately-safe message or a generic fallback — a raw `PostgrestError` can never reach a Server Action's return value. **Residual, accepted gap**: a caller with direct Supabase REST API access (the same anon key + JWT the app itself uses — not an additional secret) sees PostgREST's own raw error format, including Postgres exception text from a business-consistency trigger (e.g. `"transactions.account_id must belong to the same household"`). This reveals table/column names to someone who already has legitimate API credentials, which is a normal, accepted characteristic of exposing PostgREST directly (the same architecture every Supabase app uses) — not a fixable "leak" without abandoning direct REST access, and not information an authenticated attacker couldn't already infer from the app's own client-side network requests.

### 4.16 Negative-money / malformed-amount edge cases
Submitting a negative, zero, or otherwise nonsensical amount directly via the REST API, bypassing the UI's implicit assumptions. Zero-amount and invalid-currency-code inputs are rejected at the database layer (`CHECK` constraints) regardless of app-layer validation. **Found during this review and fixed at the app layer**: every money-amount input field across the app (goal targets, loan principals, insurance coverage/premiums, SIP contributions, transaction/expense/income amounts, and 20 more — 27 fields across 14 validation schemas) previously accepted a leading `-` with no positivity check, because `parseDecimalToMinorUnits` is a general-purpose parser that deliberately supports signed input for genuinely-signed contexts. A shared `positiveDecimalAmountSchema` now rejects a leading `-` at the schema layer for every field that must always be a positive magnitude. Deliberately **not** applied to account-balance reconciliation (a credit-type account's confirmed balance is legitimately negative) — see security-review.md for the full field-by-field reasoning. The underlying DB-level `CHECK` constraint still permits a negative `amount_minor_units` (documented, not changed in this pass — see security-review.md's recommendations).

### 4.17 Mass assignment
Submitting extra/unexpected fields on an insert, hoping one maps to a privileged column (`is_admin`, `role`, someone else's `user_id`). PostgREST rejects an insert containing any column name that doesn't exist on the target table outright (400), and every Server Action validates input against an explicit zod schema (allow-listed fields only) before it ever reaches a query — never a raw spread of client input into an insert/update.

## 5. Explicitly out of scope

- **Platform account security** (Supabase/Vercel 2FA, credential rotation) — operational hygiene, not application architecture.
- **A fully compromised end-user device** (keylogger, malicious browser extension) — no application-layer control defends against the OS/browser itself being untrusted. Screenshot-sensitive mode and privacy mode are explicitly scoped as *deterrents against shoulder-surfing/incidental exposure*, never claimed as protection against a compromised device — see `src/components/shared/screenshot-sensitive-guard.tsx`'s own doc comment.
- **Denial of service** — rate limiting exists specifically for the export endpoint (the one genuinely expensive, high-value operation); general DoS resilience is an infrastructure/platform concern (Vercel's own protections), not covered here.
- **A strict Content-Security-Policy** — recommended as a follow-up (see security-review.md) rather than implemented in this pass, since a CSP wired incorrectly (breaking Next.js's own inline hydration scripts) is a worse outcome than no CSP, and doing it correctly needs nonce-based middleware wiring with its own dedicated QA pass.
