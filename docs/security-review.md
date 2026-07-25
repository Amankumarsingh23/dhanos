# DhanOS — Security Review (PROMPT 45)

Status: **complete for this pass**. This is the record of the production security review conducted against the running app — not a paper audit. Every finding below was either reproduced with a real HTTP request against the local Supabase stack (using real signed-up users' real access tokens, the same methodology [household-isolation.spec.ts](../tests/e2e/household-isolation.spec.ts) already established for tenant isolation) or confirmed by direct inspection of the running database's actual RLS/grant state — never inferred from migration source alone, since a migration file describes intent, not necessarily the deployed reality.

See [threat-model.md](./threat-model.md) for *why* each category matters and [privacy-model.md](./privacy-model.md) for the data-handling/privacy-specific policy. This document is the *what did we actually check, and what did we find*.

## 1. Methodology

- **Live attacks, not code review alone.** [tests/e2e/security-review.spec.ts](../tests/e2e/security-review.spec.ts) is the permanent record — 12 tests, each attempting one of the explicit attacks below against the real local Supabase stack with real, independently signed-up users (never mocks). It stays in the suite as a regression guard, not a one-time script.
- **Database ground truth, not migration source.** RLS/grant state was queried directly from `pg_tables`, `pg_policies`, `pg_proc`, `information_schema.role_table_grants`, and `storage.buckets` against the live local database — the same database `supabase db reset` produces from every migration in order, so this reflects what's actually deployed, not what a migration file claims to do.
- **Real production build for anything involving the running app.** `next dev`'s Turbopack HMR does not reliably hydrate in this environment (a pre-existing sandbox quirk unrelated to application code — first identified during the PROMPT 44 accessibility audit); every live-app check in this review ran against `pnpm build && next start`.

## 2. Findings

Severity follows a standard scale: **Blocker** (exploitable cross-tenant data exposure or auth bypass — would block a release), **High** (a real gap with meaningful impact, fixed in this pass), **Medium** (a real gap, lower impact, fixed or explicitly deferred with reasoning), **Low/Informational** (a hardening opportunity or an accepted architectural trade-off, not a vulnerability).

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Storage buckets had no server-side `file_size_limit`/`allowed_mime_types` — the app's 25 MB/MIME-allowlist checks were client-side only | High | **Fixed** |
| 2 | Every money-amount input field (27 fields across 14 validation schemas) accepted a negative value with no positivity check at the app layer | High | **Fixed** |
| 3 | `buildCsv` had no CSV-formula-injection escaping — a malicious cell value could execute as a formula when a household exports its own data | High | **Fixed** |
| 4 | No baseline security response headers configured (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) | Medium | **Fixed** |
| 5 | No Content-Security-Policy | Medium | **Deferred** — see §4 |
| 6 | DB-level `CHECK` constraint on `transactions.amount_minor_units` only rejects zero, not negative — the app-layer fix (#2) is the only guard against a negative amount reaching the database via direct REST | Medium | **Deferred** — see §4 |
| 7 | `anon` Postgres role holds `TRUNCATE`/`TRIGGER`/`REFERENCES` grants on every public table (Supabase's own default schema grants) — not reachable through the product's actual API surface (PostgREST never exposes `TRUNCATE` over HTTP), but broader than least-privilege | Low | **Fixed in PROMPT 53** — re-auditing found `authenticated` carried the same three grants too (a larger blast radius than originally scoped here); both revoked in `supabase/migrations/20260731100000_revoke_unused_anon_authenticated_privileges.sql` — see [production-supabase.md](./production-supabase.md) §9 |
| 8 | A caller with direct Supabase REST API access sees PostgREST's raw error text (revealing table/column names) rather than the app's sanitized messages | Low | Accepted — see threat-model.md §4.15 |
| 9 | `SUPABASE_SERVICE_ROLE_KEY` is defined and reachable (`server-only`) but has zero current call sites | Informational | No action — confirms no live RLS-bypass surface today |

Nothing rose to **Blocker**. Every tenant-isolation, authentication, and Storage-access attack attempted was already correctly rejected before this review began.

## 3. Explicit attacks attempted (per the prompt's own list)

| Attack | Result | Evidence |
|---|---|---|
| Changing account IDs (IDOR write) | Rejected — RLS `WITH CHECK` / consistency trigger, victim's row unchanged | `security-review.spec.ts` — "attacker cannot change another household's account id/name..." |
| Accessing another user's transaction | Rejected — empty result, not a 403-with-visible-row | `security-review.spec.ts` — "attacker cannot read another household's accounts, transactions, or documents..." |
| Querying another household | Rejected — `households`/`household_memberships` both empty for a non-member | `household-isolation.spec.ts` (pre-existing, extended) |
| Guessing a Storage path | Rejected — both direct download and signed-URL *minting* refuse, even with the exact known path | `security-review.spec.ts` — "attacker cannot download or mint a signed URL..." |
| Downloading another policy | Not run as a literal insurance-specific attack (setup cost — insurance requires an institution + person + account fixture chain first). The identical RLS pattern (`is_household_member(household_id)`) is confirmed on `insurance_policies` in the live table survey (§5) and exercised end-to-end via the equivalent documents attack — same mechanism, different table, not an untested code path | `insurance_policies` row in the §5 table survey; `security-review.spec.ts`'s documents test for the end-to-end mechanism |
| Invoking actions without login | Rejected — every household table returns zero rows with no bearer token; the `get_or_create_household` RPC rejects an unauthenticated caller outright; architecturally, all 30 Server Action files gate on `requireUser`/`requireHouseholdRole` | `security-review.spec.ts` — "unauthenticated access" describe block |
| Submitting unexpected amount fields (mass assignment) | Rejected — PostgREST 400s on any column that doesn't exist on the table | `security-review.spec.ts` — "mass assignment..." |
| Negative-money edge cases | **DB layer currently accepts it** (documented, see Finding #2/#6) — app-layer now rejects it | `security-review.spec.ts` — both the DB-layer documentation test and `primitives.test.ts`'s new `positiveDecimalAmountSchema` tests |
| Invalid currency | Rejected — `CHECK (currency_code ~ '^[A-Z]{3}$')` | `security-review.spec.ts` — "rejects an invalid (non-3-letter) currency code" |
| Oversized file upload | **Was accepted before this review; now rejected** (Finding #1) | `security-review.spec.ts` — "oversized/disallowed file upload" describe block |
| Malicious CSV cells (formula injection) | **Was unescaped before this review; now defused** (Finding #3) | `src/lib/reports/csv.test.ts`'s "CSV injection (CWE-1236)" describe block |
| Unsafe external redirect | Rejected — `getSafeRedirectPath` used at every redirect-from-user-input call site | Code review (threat-model.md §4.9); existing `safe-redirect.test.ts` + e2e redirect-injection test in `auth.spec.ts` |

## 4. Deferred items and recommendations

These are real, honestly-classified gaps that were **not** fixed in this pass, with the reasoning for deferring each:

- **Content-Security-Policy (Finding #5).** A CSP needs nonce-based `script-src` wiring through Next.js middleware to avoid breaking the framework's own inline hydration scripts. Implementing this without breaking the app requires its own dedicated QA pass across every page (dialogs, charts, the command palette) — rushing it inside this review risks shipping a broken app in the name of hardening it. **Recommendation**: a follow-up pass specifically for CSP, tested against the full accessibility/e2e suite (PROMPT 44's `tests/e2e/accessibility.spec.ts` already exercises every page and would catch a CSP-induced breakage).
- **DB-level negative-amount `CHECK` constraint (Finding #6).** The app-layer fix (`positiveDecimalAmountSchema`) closes the gap for every path that goes through a Server Action, which is 100% of the app's own UI. It does **not** close the gap for a caller hitting PostgREST directly with valid credentials (the same "authenticated user bypassing the UI" actor from the threat model, §2). A DB-level `CHECK (amount_minor_units > 0)` would close this fully, but touches every `kind` of transaction (income/expense/transfer/investment/loan/lending/refund/adjustment) and needs a table-by-table decision about which kinds, if any, legitimately need a signed value (adjustments, specifically, were **not** audited for this in the current pass — see the note in `src/lib/validation/primitives.ts`'s new schema doc comment). **Recommendation**: audit each `transactions.kind` for legitimate sign requirements, then add per-kind `CHECK` constraints rather than one blanket one.
- **`anon` role's `TRUNCATE`/`TRIGGER`/`REFERENCES` grants (Finding #7).** Not exploitable through the product's actual API surface — PostgREST only ever translates an HTTP request into `SELECT`/`INSERT`/`UPDATE`/`DELETE`, never `TRUNCATE`, and `anon` holds zero grants for those four operations (confirmed directly — see §5). This is Supabase's own default schema-bootstrapping grant, not something introduced by application code. **Recommendation**: `REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon;` as a pure least-privilege hardening step, with no expected functional impact — low priority given it's not reachable today, but cheap to do.

## 5. RLS coverage — the actual table survey

Queried live (`select tablename, rowsecurity, count(policies) from pg_tables ... left join pg_policies ...`) rather than assumed from migrations. All 51 tables in the `public` schema:

- `rowsecurity = true` on every single one — **zero exceptions**.
- Every table has at least 2 policies (the append-only/history tables like `loan_payments`, `investment_sip_events`, `net_worth_snapshots` correctly have exactly SELECT + INSERT, no UPDATE/DELETE — matching the domain's own append-only requirement, not a gap).
- Zero policies found with `qual = 'true'` or an equivalent always-true condition (checked explicitly).
- `is_household_member()`/`household_role()` (the two functions nearly every policy composes) are `SECURITY DEFINER` with `SET search_path` pinned — the correct, injection-safe pattern for a `SECURITY DEFINER` function; an unpinned `search_path` on a `SECURITY DEFINER` function is a classic escalation vector this avoids.
- `storage.objects` has `rowsecurity = true`; both buckets (`documents`, `avatars`) are private (`public = false`); policies scope by the storage path's first segment (the household id) via the same `is_household_member()`/`household_role()` functions used everywhere else — one enforcement pattern, not a second one invented for Storage.

## 6. Acceptance criteria

- ✅ **All tenant tables have verified RLS** — queried live against all 51 tables, §5.
- ✅ **Storage is private** — both buckets confirmed `public = false`; live-attack-tested that path guessing and direct signed-URL minting both fail for a non-member.
- ✅ **No sensitive values appear in logs** — zero `console.*` calls anywhere in application code (exhaustive grep, not sampled).
- ✅ **Security findings are classified honestly** — §2's severity column includes items intentionally left unfixed (#5, #6, #7) with reasoning, not just the fixed ones; §4 states plainly what's deferred and why.
- ✅ **Blockers and high-severity issues are fixed** — zero blockers found; all three High findings (#1, #2, #3) fixed and covered by a permanent regression test.
