# DhanOS — Local Supabase Workflow

Status: **implemented and verified**. This describes the actual local Supabase setup in this repository — `supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql` — not a future plan. See [database-plan.md](./database-plan.md) for the schema conventions this workflow enforces, and [money-calculation-rules.md](./money-calculation-rules.md) for why several of them exist.

Prerequisites: Docker running locally, and the project's dependencies installed (`pnpm install` — the Supabase CLI is a devDependency, invoked via `pnpm db:*` scripts, not a separate global install).

## Start

```
pnpm db:start
```

Runs `supabase start`. First run pulls Postgres/Auth/Storage/Realtime/Studio images (slow); after that it's fast. On success it prints the local API URL, anon/publishable key, service-role/secret key, Studio URL, and Inbucket (email testing) URL. Studio is at `http://127.0.0.1:54323` — useful for browsing tables/data visually during development.

Copy the printed `API_URL`, `PUBLISHABLE_KEY`, and `SECRET_KEY` into `.env.local` (see `.env.example` for the variable names DhanOS expects):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY from the start output>
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY from the start output>
```

These are shared, well-known local-dev defaults (documented in Supabase's own CLI output) — safe for `.env.local` (gitignored), never for a committed file or a real environment.

## Stop

```
pnpm db:stop
```

Runs `supabase stop`. Stops the containers; data persists in a Docker volume across stop/start. Use `supabase stop --no-backup` (not wrapped in a script — run directly if needed) to also discard that volume.

## Reset

```
pnpm db:reset
```

Runs `supabase db reset`: drops the local database, recreates it, applies every migration in `supabase/migrations/` **in filename order**, then runs `supabase/seed.sql`. This is the "clean slate" command — run it whenever migrations or seed data change, and expect it to succeed cleanly before considering either done. It only ever touches the local Docker Postgres instance, never a linked remote project.

**If auth requests start failing with a 502** ("An invalid response was received from the upstream server") after several `db:reset` runs in a row: this is Kong holding a stale internal IP for the restarted auth container, not an application bug — confirm via `docker logs supabase_kong_dhanos` (look for `connect() failed (111: Connection refused)` against the auth container's IP). Fix with a full stack restart, `pnpm db:stop && pnpm db:start`, then `pnpm db:reset` once more.

## Seed

Seeding isn't a separate step — `supabase/seed.sql` runs automatically at the end of every `db:reset` (and every `db:start` against a fresh volume). It currently creates:

- A fixture user in `auth.users`/`auth.identities`: **`demo@dhanos.local`** / **`password123`** (local dev only — this is not a real account and does not exist outside your machine's Docker volume). The `handle_new_user` trigger provisions its matching `profiles` row automatically; seed.sql just fills in a display name.
- A `households` row ("Demo Household", `INR`) with `created_by` set to that user — the `create_owner_membership` trigger (see the tenancy migration) automatically inserts the matching owner `household_memberships` row.
- One `net_worth_snapshots` row so there's a real, dated, money-bearing row to look at.

Edit `supabase/seed.sql` directly to add more fixtures as new tables land; it's plain SQL run by whatever role owns the reset.

## Create a migration

```
pnpm db:migration:new <name>
```

Runs `supabase migration new <name>`, creating an empty, correctly-timestamped file at `supabase/migrations/<timestamp>_<name>.sql`. Write the migration's SQL directly into that file. Conventions to follow (see [database-plan.md](./database-plan.md) §1 and the existing migrations for worked examples):

- UUID primary keys: `id uuid primary key default gen_random_uuid()`.
- `timestamptz` for events (`created_at`, `updated_at`); `date` for date-only concepts (e.g. `as_of_date`, `date_of_birth`) — never conflate the two.
- Money as a pair: `amount_minor_units bigint` + `currency_code text` (check `~ '^[A-Z]{3}$'`) — never a bare `numeric`/`float`.
- Explicit `check` constraints for anything the database can reject outright (enums via `check (col in (...))`, non-negative amounts, non-empty names) — don't leave a constraint to "the application will validate it" when a one-line `check` covers it.
- Explicit FK deletion behavior on every foreign key — decide `cascade` / `restrict` / `set null` deliberately per relationship, never leave it at the implicit default. See the tenancy migration for the reasoning behind each choice there.
- An index on every foreign-key column (Postgres does not create these automatically the way it does for primary/unique keys).
- `created_at` always; `updated_at` on every *mutable* table, wired to the `set_updated_at()` trigger utility (see the utility migration) — omit `updated_at` entirely on append-only/historical tables (see [money-calculation-rules.md](./money-calculation-rules.md) §3), so there's nothing to accidentally wire up.
- `deleted_at timestamptz` (nullable) where a row needs archival rather than deletion — not a blanket default on every table.
- Enable RLS in the same migration that creates the table, never a follow-up migration — see "Test RLS" below.
- New tables need explicit `grant` statements to `authenticated`/`service_role` (and `anon` only if genuinely public) — local Supabase's default config does **not** auto-expose new tables to the API without them, and table-level grants are the ceiling that RLS then narrows per-row.

## Apply a migration

Locally, "apply" is just `pnpm db:reset` (it reapplies everything from scratch, which is also how you catch a migration that only works if run after manual/interactive state). Once a migration is applied to a **shared** environment (a linked staging/production project), it is immutable — see "Production migration rules" below.

## Generate types

```
pnpm db:types
```

Runs `supabase gen types typescript --local`, writes the result to `src/types/database.ts`, then formats it with Prettier (the generator's raw output doesn't match this repo's formatting, so the script chains both). Run this after every migration that changes the schema, and commit the regenerated file alongside the migration — it should never drift from what's actually in `supabase/migrations/`.

`src/lib/supabase/client.ts`, `server.ts`, and `service-role.ts` all parametrize their Supabase client with this `Database` type, so a stale `database.ts` shows up immediately as TypeScript errors at call sites, not a silent runtime mismatch.

## Link a remote project

```
pnpm db:link
```

Runs `supabase link`, which prompts for a project ref and a personal access token (or reads `SUPABASE_ACCESS_TOKEN` from your shell environment — **never** put it in `.env.local` or any tracked file). Linking associates this local checkout with a specific remote Supabase project so `db:push`/`db:pull`/remote `db:types` know which project to talk to. The link itself is stored in Supabase CLI's own local state, not in the repo.

Once linked, `pnpm db:push` (`supabase db push`) applies any local migrations not yet present on the linked project, **in order**, to that remote database. Treat this the same as any other production deploy step: review the migration SQL first, and only push migrations that have already been exercised locally via `db:reset`.

## Pull schema safely

If someone (or some tool) changed the linked remote project's schema outside of a checked-in migration — directly in the Supabase dashboard, for instance — reconcile it deliberately rather than blindly overwriting local files:

1. `supabase db diff --linked -f <descriptive_name>` generates a **new** migration file capturing the difference between the linked remote schema and your local migration history, without touching existing migration files.
2. Read the generated SQL before keeping it. Diffing tools are a starting draft, not a substitute for understanding what changed and why.
3. Run `pnpm db:reset` locally to confirm the new migration applies cleanly from scratch alongside every prior one.
4. Commit the new migration like any other — do not fold the drift into an already-applied file.

`supabase db pull` does the same underlying diff-and-write-a-migration operation and is an acceptable alias for the same workflow; `db:diff` is called out explicitly here because "pull" can misleadingly suggest overwriting local state, which it does not do.

## Test RLS

Every table's Row Level Security is the actual tenancy boundary (see [security-model.md](./security-model.md) §3) — the application code is a second, redundant layer, not the primary one. Verify policies directly against the REST API, not just through app UI, since the UI can't exercise "what if someone else's session tries this."

With the local stack running:

```bash
source .env.local

# 1. Anonymous access must be denied outright (no grant to `anon` at all).
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/households" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
# → {"code":"42501", ... "permission denied for table households"}

# 2. Sign in as the seeded demo user and confirm they see their own household.
TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"demo@dhanos.local","password":"password123"}' \
  | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).access_token))")

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/households?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN"
# → the Demo Household row

# 3. Sign up a second, unrelated user and confirm they see NOTHING from #2.
TOKEN2=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"other@dhanos.local","password":"password123"}' \
  | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).access_token))")

curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/households?select=*" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN2"
# → []

# 4. The second user must not be able to write into the first user's household either.
curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/net_worth_snapshots" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN2" \
  -H "Content-Type: application/json" \
  -d '{"household_id":"22222222-2222-2222-2222-222222222222","as_of_date":"2026-07-21","total_assets_minor_units":1,"total_liabilities_minor_units":0,"currency_code":"INR"}'
# → 403
```

Run `pnpm db:reset` afterward to discard any fixture users/rows created while testing (step 3 above creates a real row in the local `auth.users` table that isn't part of the checked-in seed).

For append-only tables specifically (`net_worth_snapshots` today; `loan_payments`, `valuation_snapshots`, etc. as they're added), also confirm an `UPDATE`/`DELETE` is rejected even for the row's own owner — there should be no policy permitting it, so RLS denies it before the "no grant" table-level check even applies. See [manual-test-checklist.md](./manual-test-checklist.md) §3–4 for the broader list of historical-record invariants to check as each table lands.

## Production migration rules

- **A migration, once applied to any shared environment (staging or production via `db:push`), is never edited.** A correction — fixing a mistake, changing a constraint, adding a column — is always a *new* migration file, applied on top. This matches the same "corrections are new records, not edits" principle that governs the application's financial data (see [money-calculation-rules.md](./money-calculation-rules.md) §3) — it's the same reasoning applied to schema history instead of row history.
- Migrations are applied in filename (timestamp) order, always. Never renumber or reorder existing files to "fix" a mistake in sequencing — add a new one.
- `pnpm db:reset` must succeed locally, from scratch, before a migration is pushed anywhere shared. A migration that only works when hand-patched afterward is not done.
- `pnpm db:push` only pushes to whatever project `supabase link` currently points at — check `supabase status` / the linked project ref before pushing if there's any doubt which environment that is.
- No migration should assume `auto_expose_new_tables` (the legacy "expose everything automatically" behavior) — every new table gets explicit `grant`s in the same migration that creates it, so behavior doesn't depend on a config default that's already deprecated and scheduled for removal.
- Never hand-edit data in a shared environment to make a broken migration "work" — fix it locally with a new migration, verify with `db:reset`, then push.

## Secrets

- `supabase/config.toml`, every file in `supabase/migrations/`, and `supabase/seed.sql` are all committed — none of them contain a real secret (the config file references environment variables like `env(OPENAI_API_KEY)` rather than embedding values, and local-dev API keys are well-known, published defaults, not secrets).
- `supabase/.gitignore` (generated by `supabase init`) excludes `.branches`, `.temp`, and any `.env*.local` under `supabase/` — these are local CLI working state, never committed.
- A remote project's access token (from `supabase link`) and its real `SUPABASE_SERVICE_ROLE_KEY` live only in your shell environment, a secrets manager, or the deployment platform's environment config — never in `.env.local`'s tracked sibling `.env.example`, never in a migration, never in `seed.sql`.
