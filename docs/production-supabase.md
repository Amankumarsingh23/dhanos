# DhanOS — Production Supabase Readiness

Status: **schema verified production-ready against the local instance (which runs the identical migration history); the actual production Supabase Cloud project does not exist yet.** This document is both the record of what was checked (against the local stack — see the "Verified" callouts, each with the exact SQL used) and the exact runbook for the remaining external-account steps, which only someone with Supabase Cloud account access can perform. See [vercel-preview.md](./vercel-preview.md) for the equivalent document for Vercel/preview, which this mirrors in structure and in the same honesty about what's code-verifiable versus account-gated.

**No production Supabase project is linked to this repo** (`supabase/.temp/project-ref` doesn't exist) — this document does not claim any step against a real production project was performed, and none was. Every "Verified" item below was checked against the local CLI-managed instance, which — being built from the exact same `supabase/migrations/*.sql` in the exact same order — is schema-identical to whatever a real production project would be immediately after `pnpm db:push`. What's *not* verifiable without the real project (region latency, actual advisor UI output, real backup configuration, actual two-user production isolation) is marked **Do this** with the exact procedure.

## ⚠️ Before touching a linked production project

**Never run `supabase db reset` (or `pnpm db:reset`) against a linked production project.** That command *drops and recreates the database* — it is the single most destructive thing the Supabase CLI can do, and it is used constantly and casually throughout local development (`pnpm db:reset` is the routine "clean slate" command in [local-supabase.md](./local-supabase.md)). The only command that should ever touch a linked production project's schema is `supabase db push` (applies pending migrations only, never drops anything) — see §2. Before running any `supabase db *` command, run `pnpm exec supabase projects list` or check `supabase status`/`.temp/project-ref` to confirm which project is currently linked, since `db push` always targets whatever project `supabase link` last pointed at.

## 1. Verify region — do this

Not something this codebase can check or set (chosen at project-creation time in the Supabase dashboard/CLI, not stored in `supabase/config.toml`). DhanOS is an India-focused product (base currency `INR` in every fixture/seed row — see `supabase/seed.sql`) — create the production project in the region closest to the actual user base, which for an India-focused launch means **`ap-south-1` (Mumbai)**; confirm against real user geography before committing, since a Supabase project's region cannot be changed after creation without a full migration to a new project. Pair this with a Vercel deployment region setting (Project Settings → Functions → Function Region) close to the same region, so app-server-to-database latency doesn't dominate every request — Vercel's edge network serves static/cached content globally regardless, but server-rendered pages and Server Actions run from the pinned function region.

## 2. Apply migrations — do this (exact procedure)

```bash
pnpm db:reset                          # confirm every migration still applies cleanly from scratch, locally, first
pnpm exec supabase link --project-ref <production-project-ref>
pnpm exec supabase db push             # applies pending migrations only — never drops, never seeds
```

**Verified** (local, standing in for what `db push` would apply): all 31 migrations in `supabase/migrations/` — including the PROMPT 53 privilege cleanup in §8 — apply cleanly from scratch via `pnpm db:reset`, confirmed live during this pass.

**Do not seed production demo data**: `supabase db push` only ever applies files under `supabase/migrations/` — it does not run `supabase/seed.sql` (that only runs on `db reset`/a fresh local `db start`, both local-only concepts). No extra step is needed to avoid seeding production; simply never run `db reset` against it (see the warning above), and never manually pipe `seed.sql` into the production connection string.

Review the migration list before pushing for the first time — every file is additive schema (tables/columns/functions/policies/grants), nothing destructive, but confirm this holds for any future migration before it ships too (see §11).

## 3. Generate types — do this, then verify parity

```bash
pnpm exec supabase gen types typescript --project-id <production-project-ref> | diff - src/types/database.ts
```

This is the real proof behind the **"Production schema matches migrations"** acceptance criterion: generate types directly from the live production schema and diff against the committed `src/types/database.ts` (which is generated from — and should already match — the local instance). An empty diff proves production's actual schema shape matches what every migration file claims to produce, not just that `db push` exited `0`. If it's not empty, do **not** hand-edit `database.ts` to match production — the mismatch means either a migration didn't apply as expected (investigate before doing anything else) or `database.ts` was already stale locally (regenerate locally via `pnpm db:types`, confirm `git diff --exit-code`, then re-diff against production). This mirrors exactly the drift check `.github/workflows/ci.yml`'s `integration` job already runs locally on every PR — see [ci-cd.md](./ci-cd.md) §4.2 — now run once more against the real target.

## 4. Verify RLS — verified locally; re-run against production to confirm

**Verified** (local instance, 53 tables in `public` — up from the 51 [security-review.md](./security-review.md) audited at PROMPT 45; the growth is the imports feature's `import_batches`/`import_rows`, both correctly RLS-scoped):

```sql
-- 1. Every table has RLS enabled — expect zero rows back.
select tablename from pg_tables
where schemaname = 'public' and not rowsecurity;

-- 2. Every table has at least one policy — expect zero rows back.
select t.tablename from pg_tables t
where t.schemaname = 'public'
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename);

-- 3. No always-true policy exists anywhere — expect zero rows back.
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and (qual = 'true' or with_check = 'true');

-- 4. `anon` cannot SELECT any tenant table — expect zero rows back.
select table_name from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT';
```

All four returned zero rows against the local instance. **Do this**: run the same four queries against production (`psql` with the project's connection string, or the SQL Editor in the dashboard) after §2, before considering the project ready for real users — this is the literal verification behind the **"RLS is verified"** acceptance criterion, not an assumption carried over from the local result.

## 5. Configure private buckets — verified locally, provisioned by §2

**Verified**: both Storage buckets are already `public = false` with explicit limits, defined in migrations (`supabase/migrations/20260721120000_expense_management.sql` creates them, `20260729100000_storage_bucket_limits.sql` sets the limits):

```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
--  avatars   | f | 2097152  | {image/png,image/jpeg,image/webp}
--  documents | f | 26214400 | {application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,...}
```

Since bucket creation, privacy, size limits, and RLS are all schema (migrations), this is fully provisioned by §2's `db push` with no separate dashboard step — re-run the query above against production to confirm rather than assuming.

## 6. Configure authentication URLs — do this

Unlike [vercel-preview.md](./vercel-preview.md) §5's wildcard (needed there because Vercel gives every preview deployment a *different* URL), production has exactly one real domain — so no wildcard, an **exact** URL is both sufficient and safer:

- **Site URL** (Authentication → URL Configuration): the real production domain, e.g. `https://dhanos.app` (or whatever domain is actually used) — not `http://localhost:3000` (`supabase/config.toml`'s value, local-dev only, never pushed to a production project's auth config — see §9's warning about `config push`).
- **Redirect URLs**: the same production domain only. Do not carry over `supabase/config.toml`'s local `additional_redirect_urls` (`localhost:3000`, `127.0.0.1:3000`, `:3100`) — none of those should ever be valid redirect targets for a production project.

**Already true**: the app never hardcodes an origin for these — `getRequestOrigin()`/`originFromHeaderGetter` (`src/lib/auth/request-origin.ts`) derive it per-request from `Host`/`X-Forwarded-Host`, so once the production domain is registered here, every auth email (signup confirmation, password reset) correctly redirects back to it with no further code change — same mechanism [vercel-preview.md](./vercel-preview.md) §6 documents for preview.

## 7. Review auth settings — do this (exact values, and why local's differ)

`supabase/config.toml`'s `[auth]`/`[auth.email]` sections are tuned for fast, deterministic **local development and CI** — several of those values are deliberately wrong for production and must be set differently, directly in the production project's dashboard (Authentication → Providers / Policies), **not** carried over verbatim:

| Setting | Local value (`config.toml`) | Production value | Why they must differ |
|---|---|---|---|
| `enable_confirmations` | `false` | **`true`** | Local/CI signup (`tests/e2e/support/supabase-rest.ts`'s `signUpTestUser`) reads the `access_token` directly off the signup response — only possible when confirmation is disabled. Production must require email confirmation before a session is usable; skipping it means anyone can sign up with an email they don't own. |
| `minimum_password_length` | `6` | **`10`+ ** | The config file's own comment already says "recommended 8 or more"; a financial app's account is a worthwhile target — go above the minimum recommendation, not to it. |
| `password_requirements` | `""` (none) | **`lower_upper_letters_digits`** (or stricter) | No complexity requirement locally speeds up test fixture creation; production should require more than length alone. |
| `secure_password_change` | `false` | **`true`** | Requires recent re-authentication before a password change — local dev doesn't need this friction, production should have it. |
| `site_url` / redirect URLs | `localhost`/`127.0.0.1` | the real domain | See §6. |
| `jwt_expiry` | `3600` | `3600` (keep) | A reasonable default either way — no reason to diverge. |
| `enable_refresh_token_rotation` | `true` | `true` (keep) | Already the secure choice; keep as-is. |
| Captcha (`[auth.captcha]`) | disabled (commented out) | **enable** (hCaptcha or Turnstile) | Not configured at all today, anywhere. Combined with the rate limits in §8, this is the real anti-bot-signup defense a production project needs that local dev has no reason to pay the friction cost of. |

**Do not** use `supabase config push` to apply `config.toml` wholesale to production — it would also push the local `site_url`/redirect URLs and `enable_confirmations = false` from the table above, which is actively wrong for production (§9 covers this in more detail). Set the table above by hand in the production project's dashboard instead — a deliberate, reviewable action, not a blind file push.

## 8. Review rate limits — do this (values to bring, and what's missing)

`supabase/config.toml`'s `[auth.rate_limit]` section (`email_sent = 2`/hour, `sign_in_sign_ups = 30`/5min, `token_refresh = 150`/5min, `token_verifications = 30`/5min, `anonymous_users = 30`/hour — unused, this app never enables anonymous sign-ins) are Supabase's own sensible stock defaults and are reasonable **starting values** for production too — set them explicitly in the dashboard (Authentication → Rate Limits) rather than assuming the project's own defaults match this file, since `config.toml`'s values were never confirmed to be Supabase's actual project-creation defaults. Revisit `email_sent` specifically once real signup volume is known — 2/hour is conservative and would need raising if legitimate signup traffic outpaces it.

**Already true, at the application layer** (independent of Supabase's own auth rate limits): [security-model.md](./security-model.md) §5/§6 calls the data-export endpoint "the highest-value abuse target in a personal-finance app" — `checkExportRateLimit` (`src/features/settings/export/rate-limit.ts`) is implemented and covered by tests today, gating both `exportHouseholdDataAction` and `exportHouseholdTablesCsvAction` before any household data is ever fetched.

## 9. Check security advisors — verified locally, fixed one real finding

Supabase Cloud's actual Security Advisor UI only exists once a project is created (Do this: Database → Advisors → Security Advisor, after §2). The queries it runs are mostly public knowledge (RLS coverage, `SECURITY DEFINER` function hygiene, exposed-schema checks) — every one of them was already run directly against the local instance for this pass, standing in for the real advisor:

- **RLS coverage** — see §4. Clean.
- **`SECURITY DEFINER` function `search_path` hygiene** (the classic search-path-hijacking privilege-escalation vector for a function that runs with the definer's privileges): **verified clean** — all 4 `SECURITY DEFINER` functions (`create_owner_membership`, `handle_new_user`, `household_role`, `is_household_member`) already have `search_path` explicitly pinned to `public, pg_temp`:
  ```sql
  select proname, prosecdef, proconfig from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef = true;
  ```
- **Every data-writing RPC is `SECURITY INVOKER`, not `SECURITY DEFINER`** — verified: only the 4 functions above (session/membership bootstrapping, not financial data) are definer; `create_transaction_with_splits`, `get_or_create_household`, `record_account_balance_correction`, and every other financial RPC run as the calling user, so RLS applies to them exactly as it would to a direct client write (matches [data-access-patterns.md](./data-access-patterns.md) §1.1's own claim, now re-confirmed against the current, grown schema).
- **Excess role privileges — found and fixed this pass**: `anon` held `TRUNCATE`/`TRIGGER`/`REFERENCES` on every table (previously documented as Finding #7 in [security-review.md](./security-review.md), deferred as low-priority); re-auditing for this pass found `authenticated` — the role every real signed-in user's request runs as — carried the identical three unused grants, a larger blast radius than the original `anon`-only finding. Both are fixed in `supabase/migrations/20260731100000_revoke_unused_anon_authenticated_privileges.sql`, which also alters default privileges so a *future* table doesn't silently reintroduce them. Verified zero functional impact: all 808 unit tests and the full RLS/mutation/security-review Playwright suite (`household-isolation.spec.ts`, `security-review.spec.ts`, `financial-mutations.spec.ts`, `shell.spec.ts`, `smoke.spec.ts` — 51 tests total) pass unchanged after this migration, confirming PostgREST never actually used any of the three revoked privileges (it has no HTTP verb that issues `TRUNCATE`/`TRIGGER`/DDL `REFERENCES`).
- **Do this**: once the real advisor UI is available (post-§2), run it anyway — it may surface something specific to Supabase's own platform internals (e.g. Postgres extension versions, `auth.users` exposure patterns) that isn't visible from a local CLI instance's `pg_catalog` alone.

## 10. Check performance advisors — verified locally (the RLS-critical case), one deferred finding

**Verified**: every `household_id` foreign-key column — the column every RLS policy in this schema filters on, and so the single most performance-critical index in the whole database — is indexed, with no exceptions:

```sql
select c.conrelid::regclass from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
where c.contype = 'f' and c.connamespace = 'public'::regnamespace and a.attname = 'household_id'
  and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = a.attnum);
-- 0 rows
```

**Found, not fixed — deferred with reasoning** (matching [security-review.md](./security-review.md) §4's own "honestly classified, not silently ignored" convention rather than either fixing blind or staying quiet): roughly 30 other single-column foreign keys are unindexed — almost entirely audit-trail columns (`created_by`, `uploaded_by`, `completed_by`, `actor_user_id`, pointing at `auth.users`/`people`) that this app never queries *by* (there's no "find every row a given user created" feature) rather than columns on the app's actual hot query paths. Supabase's real Performance Advisor will very likely flag these generically regardless of query pattern, since an unindexed FK also slows down a cascade-delete's existence check, not just forward queries. **Recommendation**: review the advisor's actual output once the project exists — an FK the advisor highlights as contributing to a *real* slow query (visible in its query-performance data, which a local instance with no production traffic can't simulate) should get an index via a new migration; one that's purely theoretical (no traffic ever exercises it) is fine to leave, consistent with `local-supabase.md`'s own migration-authoring guidance to index every FK *going forward* without implying every historical gap must be closed reactively before it's shown to matter.

## 11. Document backups — do this (plan requirement + why)

Not configurable from this repo — a Supabase Cloud project setting gated by plan tier. **Do this**: use at least the **Pro** tier for the production project (the Free tier has no backups at all — unacceptable for real financial data) and enable the **Point-in-Time Recovery (PITR)** add-on. PITR matters specifically because of §12's forward-fix approach: a forward-fix migration is the *first* line of defense for a bad schema change, but if a forward-fix itself turns out to be wrong, or a migration corrupted data before the mistake was caught, PITR is the only way to recover to a specific moment before that happened without losing every legitimate write since. Set the PITR retention window to cover the realistic worst-case "how long before we'd notice" — a week is a reasonable starting point for a low-traffic early-stage product; revisit once real usage volume gives a better sense of how quickly a bad write would actually be noticed and reported.

## 12. Document migration forward-fix approach — implemented as written policy

This repo's rule is already stated in [local-supabase.md](./local-supabase.md) "Production migration rules" — restated here specifically as the forward-fix/rollback strategy PROMPT 53 asks for, since Postgres migrations (unlike some frameworks) have no automatic "down" migration to run:

1. **A migration, once pushed to production, is never edited or deleted.** A mistake — a wrong constraint, a missing column, bad data from a buggy migration — is corrected by a **new** migration that fixes it forward, never by editing the original file. This is the same "corrections are new records, not edits" principle [money-calculation-rules.md](./money-calculation-rules.md) §3 already applies to the application's own financial data, applied here to schema history instead of row history.
2. **Test the forward-fix locally first**: write the fix migration, run `pnpm db:reset` to confirm the *entire* migration history — including both the original mistake and the fix on top of it — still applies cleanly from scratch. A fix that only works when hand-patched into a partially-migrated database isn't done.
3. **Push the fix the same way as any other migration** (§2) — review the SQL, `supabase db push`, re-verify per §3/§4 afterward.
4. **If the mistake already wrote bad data** before being caught (not just a schema-shape mistake), the forward-fix migration should include the data correction too (an `update`/backfill statement), not just the schema change — and that data correction is itself subject to the same "never edited after the fact" rule once pushed.
5. **PITR (§11) is the last resort**, not the first response — for when a forward-fix isn't safely possible (e.g. the original migration already destroyed data with no way to reconstruct it forward) or when the blast radius is severe enough that restoring to a known-good point is faster and safer than reasoning through a fix under pressure. Restoring loses every write since the restore point, which is exactly why PITR is deliberately positioned last, and why §11 exists at all.
6. **Never hand-edit data in production to route around a broken migration.** Same rule as staging (`local-supabase.md`), higher stakes.

## Manual isolation test — do this (real production accounts; not performed here)

**This was not performed against a real production project** — there is no production Supabase account available to this session, and creating live production user accounts is exactly the kind of consequential, hard-to-reverse action that needs a human with real account access, not something to do autonomously even if credentials were available. What follows is the exact procedure to run once §1–9 are done, adapted from [local-supabase.md](./local-supabase.md) "Test RLS" (already proven against local/CI) to hit the real production REST API instead:

```bash
export PROD_URL="https://<project-ref>.supabase.co"
export PROD_ANON_KEY="<production publishable/anon key>"

# 1. Create two independent test users.
TOKEN_A=$(curl -s "$PROD_URL/auth/v1/signup" -H "apikey: $PROD_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"prod-isolation-test-a@<your-domain>","password":"<strong-unique-password>"}' \
  | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).access_token))")
TOKEN_B=$(curl -s "$PROD_URL/auth/v1/signup" -H "apikey: $PROD_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"prod-isolation-test-b@<your-domain>","password":"<strong-unique-password>"}' \
  | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).access_token))")
# If enable_confirmations = true (§7, as it should be in production), each signup needs its
# confirmation link followed before its token is usable — use two real, disposable inboxes you
# control, not example.com placeholders.

# 2. Each user completes onboarding through the real app UI (creates their household) —
#    the fastest way to get a realistic household/account/transaction/document per user is
#    to actually walk through the product as each user, not synthesize rows via the RPC.
#    Sign in as A in one browser profile, B in another (or two separate browser contexts),
#    and for EACH: complete onboarding, create one account, record one transaction, upload
#    one document.

# 3. Separate households — B's token must see none of A's household.
curl -s "$PROD_URL/rest/v1/households?select=*" -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer $TOKEN_B"
# → must NOT include A's household

# 4. Separate accounts / transactions / documents — same pattern, B's token against A's known ids.
curl -s "$PROD_URL/rest/v1/financial_accounts?select=*" -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer $TOKEN_B"
curl -s "$PROD_URL/rest/v1/transactions?select=*" -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer $TOKEN_B"
curl -s "$PROD_URL/rest/v1/documents?select=*" -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer $TOKEN_B"
# → each must return only B's own rows (or empty, for documents/accounts if B skipped that step),
#   never any of A's

# 5. No cross-access, the write direction too — B must not be able to write into A's household.
curl -s -o /dev/null -w "%{http_code}\n" "$PROD_URL/rest/v1/financial_accounts" \
  -H "apikey: $PROD_ANON_KEY" -H "Authorization: Bearer $TOKEN_B" -H "Content-Type: application/json" \
  -d '{"household_id":"<A_HOUSEHOLD_ID>","name":"attack","type":"bank","currency_code":"INR"}'
# → 403/permission-denied, never 201

# 6. Clean up immediately — this is real production data, not a disposable local fixture.
#    Delete both test users from Authentication → Users in the dashboard (cascades to their
#    household/accounts/transactions/documents via each table's own household_id → households
#    FK, all `on delete cascade` per database-plan.md's conventions) once every check above passes.
```

This is the same methodology `tests/e2e/household-isolation.spec.ts` already automates against local/CI on every PR (see [ci-cd.md](./ci-cd.md) §4.2) — running it once by hand against the real production project after setup confirms the actual deployed infrastructure behaves the same way the automated suite already proves the *code* does, the same "automated coverage today, manual spot-check once real infra exists" split [vercel-preview.md](./vercel-preview.md) §9 uses for the equivalent preview verification.

## Acceptance criteria — how each is satisfied

- **"Production schema matches migrations"** — §3's type-generation diff against the live production schema is the literal proof; §2's `db push` (never `db reset`, never a hand-edit) is what keeps it true going forward.
- **"Storage is private"** — §5: both buckets verified `public = false` with explicit size/MIME limits, provisioned by migrations, re-confirmed against production with the same query used locally.
- **"RLS is verified"** — §4: four specific SQL checks (RLS enabled, every table has a policy, no always-true policy, `anon` has no SELECT grant), run locally and to be re-run against production directly, not inferred from migration source.
- **"Service-role key exists only in server environment"** — already true by construction: `SUPABASE_SERVICE_ROLE_KEY` is validated exclusively in `src/lib/env/server.ts`, which imports the `server-only` package (fails the build if any Client Component imports it, transitively or not — see [security-model.md](./security-model.md) §4) and is referenced by zero client-side code (confirmed in [security-review.md](./security-review.md) Finding #9: "zero current call sites" at all, client or server, beyond validation itself). The production value itself lives only in Vercel's server-side project environment variables (§4 of [vercel-preview.md](./vercel-preview.md)'s equivalent table, scoped to Production) and the Supabase dashboard's own API settings page — never in this repository, never in a GitHub Actions secret exposed to a `pull_request`-triggered workflow (see [ci-cd.md](./ci-cd.md) §7).
