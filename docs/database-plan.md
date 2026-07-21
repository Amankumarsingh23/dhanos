# DhanOS — Database Plan

Status: **core ledger implemented**. The local Supabase workflow, the tenancy tables (`households`, `household_memberships`), the `profiles` identity table, `net_worth_snapshots`, and the full core relational schema (`people`, `institutions`, `financial_accounts`, `account_balance_snapshots`, `transaction_categories`, `transactions`, `transaction_splits`, `recurring_rules`, `attachments`, `activity_events`) exist — see `supabase/migrations/` and [local-supabase.md](./local-supabase.md) for the day-to-day commands. Investment-, insurance-, debt-, and asset-specific tables (§3's remaining groups) are still a plan, not yet built (see [implementation-status.md](./implementation-status.md) for sequencing).

## 1. Conventions

- **Migration tool**: Supabase CLI (`supabase migration new <name>`), SQL migrations checked into `supabase/migrations/`, applied in order, never edited after being applied to any shared environment (staging/prod). A correction is a new migration. See [local-supabase.md](./local-supabase.md) for the exact commands (`pnpm db:*`).
- **Updated-at trigger utility**: `public.set_updated_at()`, defined in `supabase/migrations/20260721021741_utility_updated_at_trigger.sql`. Attach to any mutable table with `create trigger set_updated_at before update ... execute function public.set_updated_at();`. Append-only tables skip it entirely (no `updated_at` column to maintain).
- **Naming**: snake_case tables and columns, singular table names avoided in favor of plural (`accounts`, `transactions`), foreign keys as `<referenced_singular>_id`.
- **Primary keys**: `uuid` default `gen_random_uuid()`.
- **Timestamps**: every table has `created_at timestamptz not null default now()`; mutable tables also have `updated_at`; append-only/historical tables deliberately omit `updated_at` to make in-place mutation harder to do by accident.
- **Money columns**: always a pair — `amount_minor_units bigint not null` and `currency_code text not null` (ISO 4217, `char(3)` or a `currency_code` domain/enum) — never a bare `numeric`/`float` amount. See [money-calculation-rules.md](./money-calculation-rules.md).
- **Soft delete**: avoided for financial records by default — history should be preserved via status/lifecycle columns (e.g. `closed_at` on a Loan) rather than deletion; where deletion is user-facing (e.g. removing a mistakenly-added Account with no transactions), enforce via constraints that referenced records block deletion (`ON DELETE RESTRICT`) unless explicitly empty.

## 2. Tenancy & RLS strategy — implemented

- Every financial table includes `household_id uuid not null references households(id)`.
- RLS enabled on every table from its creation migration (not added later).
- Roles: `owner`, `admin`, `editor`, `viewer` (see `public.household_memberships.role`) — owner/admin can manage household settings and membership (`canManageHousehold` in `src/lib/households/permissions.ts`), editor can read/write financial data, viewer is read-only. Membership also carries a `status` (`active`/`invited`/`suspended`) — only `active` rows grant access; `invited` is reserved for a collaboration-invite flow that doesn't exist yet (see PROMPT 4's "do not implement invitations yet").
- Implemented as two `security definer` helper functions (search_path locked down, to avoid both RLS recursion and search-path hijacking) rather than inlining the same subquery into every policy: `public.is_household_member(household_id)` and `public.household_role(household_id)` — see `supabase/migrations/20260721051051_household_memberships.sql`. Policies call these; role-based write restriction (e.g. `viewer`: `select`-only) is enforced by checking `household_role(...)` in each table's `insert`/`update`/`delete` policies.
- Bootstrapping problem solved via trigger: creating a household has no existing owner row to satisfy the `household_memberships` insert policy, so `public.create_owner_membership()` (also `security definer`) inserts the creator's owner row automatically, in an `after insert on households` trigger.
- Household creation itself goes through `public.get_or_create_household(...)` (`security invoker`, called via `supabase.rpc(...)` from onboarding) rather than a raw insert — it's idempotent: if the caller already owns a household (enforced by the `household_memberships_one_owner_per_user` partial unique index), it returns that household's id instead of erroring or creating a duplicate, making a client retry/double-submit safe. Note: an `insert ... returning` on `households` fails RLS even for the inserting user, because the row only satisfies the `is_household_member` SELECT policy once `create_owner_membership`'s cascading insert has run, and `RETURNING` evaluates against a snapshot that doesn't yet see that same-statement trigger effect — `get_or_create_household` sidesteps this by generating the id up front and never using `RETURNING`.
- No table should be readable without a household join — this is the enforcement point that backs up the domain model's "every entity scoped to a Household" invariant. Verify it directly against the API, not just through app code — see [local-supabase.md](./local-supabase.md) "Test RLS" and `tests/e2e/household-isolation.spec.ts`.
- Local Supabase's default config does not auto-expose new tables to `anon`/`authenticated`/`service_role` without explicit `grant`s (the legacy "expose everything" behavior is off by default and being removed entirely) — every table-creating migration includes its own grants, deliberately excluding `anon` unless a table is genuinely meant to be public.
- Centralized authorization helpers live in `src/lib/households/permissions.ts`: `requireUser` (re-exported), `requireHousehold` (page-gating, redirects to `/onboarding`), `requireHouseholdMember`/`requireHouseholdRole` (data-layer, throw `NotFoundError`/`PermissionDeniedError` — always re-check a submitted `household_id` against the database, never trust it because it was submitted), `canManageHousehold`.

## 3. Table groups

**Identity** — ✅ implemented (`supabase/migrations/20260721024731_profiles.sql`)
`profiles` — one row per `auth.users` identity (full name, avatar path, timezone, locale, default currency), provisioned by a `handle_new_user` trigger, not household-scoped.

**Tenancy** — ✅ implemented (`supabase/migrations/20260721021743_tenancy_households.sql`, expanded in `20260721051051_household_memberships.sql`)
`households` (name, base currency, timezone, financial month start day), `household_memberships` (role: owner/admin/editor/viewer; status: active/invited/suspended)

**Planning** — partially implemented
`net_worth_snapshots` ✅ (append-only; `supabase/migrations/20260721021746_net_worth_snapshots.sql`) — `goals`, `emergency_fund_plans`, `monthly_closings` (append-only; a correction inserts a new row with `supersedes_closing_id` rather than updating) still planned

**People** — ✅ implemented (`people`); **UI implemented** (`/app/people`, PROMPT 8)
One row per person relevant to the household's finances (self, parent, sibling, spouse, dependant, lender, borrower, nominee, co-owner via `relationship_type`), optionally linked to an `auth.users` id via nullable `user_id` — this is how a dependant with no login is now representable (resolves item 3 in §6 below).

**Money sources** — ✅ implemented (`institutions`, `financial_accounts`, `account_balance_snapshots`); **UI implemented for `institutions`** (`/app/institutions`, PROMPT 8)
`institutions` (bank/wallet/investment_platform/insurer/lender/employer/business/government/staking_platform/other via `institution_type`; `platform_name`, `support_phone`, `support_email` as of `20260721070000_institutions_contact_fields.sql`, replacing the original single `support_info` free-text column; `is_archived` for soft-archival); `financial_accounts` (savings/current/cash/wallet/fixed_deposit/recurring_deposit/investment/demat/loan/credit/staking/provident_fund/pension/other via `account_type`, optional `institution_id`, optional `owner_person_id`, `opening_balance_minor_units` as a starting point only); `account_balance_snapshots` (append-only, one row per account per `as_of_date` — the account's *current* balance is always "latest snapshot," never a mutable column on `financial_accounts`). `income_sources` remains unbuilt — deferred until the income module needs more than `transactions.kind = 'income'` + a category provides.

**Cash flow** — ✅ implemented (`transaction_categories`, `transactions`, `transaction_splits`, `recurring_rules`)
`transaction_categories` (household-scoped, self-referential `parent_category_id`, `category_kind`); `transactions` (discriminated by `kind`: income/expense/transfer/investment_contribution/investment_withdrawal/loan_disbursement/loan_payment/lending_disbursement/lending_repayment/refund/adjustment); `transaction_splits` (sum must equal the parent transaction's amount, enforced by a deferred constraint trigger — see §4); `recurring_rules` (template referenced by `transactions.recurring_rule_id`, not itself a transaction). A `public.cash_flow_transactions` view excludes `kind = 'transfer'` by construction, so reporting code doesn't rely on remembering to filter it out.

**Investing** — planned
`investments`, `sips`, `staking_positions`, `valuation_snapshots` (append-only, FK to whichever valued entity — consider a polymorphic `valuable_type`/`valuable_id` pair or per-entity join tables; decide based on whether Postgres check constraints or application-level enforcement is preferred once implementation starts)

**Debt** — planned
`loans`, `loan_payments` (append-only, `principal_component_minor_units` + `interest_component_minor_units`, both required), `receivables`, `receivable_repayments` (append-only), `liabilities`

**Protection & property** — planned
`insurance_policies`, `assets` (movable/immovable via `asset_class` enum)

**Operations** — partially implemented
`attachments` ✅ (`attachable_type`/`attachable_id` polymorphic pair, currently restricted to `'financial_account'` and `'transaction'` — Supabase Storage object references, household/referential integrity enforced by trigger); `activity_events` ✅ (append-only, household-scoped audit log — `event_type`, `entity_type`/`entity_id`, `metadata jsonb`; no automatic cross-table instrumentation yet, written to explicitly by application code today). Still planned: `reminders`, `reports` (must store `data_cutoff_at` distinct from `generated_at`), `projections` (stores assumption inputs alongside output), `decision_journal_entries`, `literacy_content` (not household-scoped — global reference content).

## 4. Constraints to enforce at the database layer, not just application code

- `amount_minor_units` on `transactions`, `recurring_rules`, `transaction_splits`: `check (amount_minor_units <> 0)` — a zero-amount row is meaningless.
- `loan_payments` (planned): `check (principal_component_minor_units >= 0 and interest_component_minor_units >= 0 and principal_component_minor_units + interest_component_minor_units = amount_minor_units)`.
- `transactions` where `kind = 'transfer'` — ✅ implemented: `transfer_account_id` required and `<> account_id`; a `before insert or update` trigger (`public.check_transaction_consistency`, see `transactions` migration) confirms `account_id` and `transfer_account_id` share the same `household_id` as the transaction row and share the same `currency_code` (v1 requires same-currency transfers — see §6, resolved). `transfer_account_id` must be `null` for every other `kind`.
- `transactions` where `kind = 'refund'` — ✅ implemented: `reverses_transaction_id` required, and the same trigger confirms the referenced transaction is `kind = 'expense'` in the same household.
- `transactions` — ✅ implemented: the trigger also confirms `category_id`, `recurring_rule_id`, and `related_person_id` (when present) belong to the same household as the transaction, and that a non-transfer transaction's `currency_code` matches its `account_id`'s currency — cross-household or cross-currency references are rejected outright, not just filtered out of reports.
- `transaction_splits` — ✅ implemented: a `constraint trigger ... deferrable initially deferred` (`public.check_transaction_split_totals`) re-validates, at end of each affected statement, that when a transaction has one or more split rows, `sum(transaction_splits.amount_minor_units) = transactions.amount_minor_units` for that transaction — checked on insert/update/delete of `transaction_splits` and on update of `transactions.amount_minor_units` itself. A transaction with zero splits is unaffected (it is categorized singly via `transactions.category_id`).
- `attachments` — ✅ implemented: `attachable_type` restricted by `check` to the entity types that exist today (`'financial_account'`, `'transaction'`); a trigger (`public.check_attachment_target`) confirms the referenced row exists and belongs to the same household, since Postgres has no first-class polymorphic FK.
- No `update`/`delete` grants on append-only tables (`account_balance_snapshots`, `net_worth_snapshots`, `activity_events`, and — once built — `valuation_snapshots`, `loan_payments`, `receivable_repayments`, `monthly_closings`) for normal application roles — only `insert`/`select`, enforced via RLS/grants, not just convention.

## 4.1 Application-layer query/mutation contract

See [data-access-patterns.md](./data-access-patterns.md) for the standard mutation process (resolve user → resolve household authorization → validate input → normalize money → atomic writes → activity event → revalidate → typed safe result, implemented by `runHouseholdMutation` in `src/lib/mutations`) and the query contract (household-scoped, paginated, deterministically ordered, no unbounded loads, no unnecessary columns, no cross-user caching, explicit archived-record handling, implemented by `src/lib/queries/pagination.ts`) every feature module must build on.

## 5. Local dev & testing

See [local-supabase.md](./local-supabase.md) for the full day-to-day workflow (start/stop/reset/seed/migrate/types/link/pull/RLS testing) and the production migration rules. In short: `pnpm db:reset` for a clean local database (migrations + `supabase/seed.sql`), `pnpm db:types` to regenerate `src/types/database.ts`, never against production data.

- Constraint tests: a small suite of SQL statements (run via `psql` or `pgTAP` if adopted) that assert forbidden states are rejected — e.g. attempting to `UPDATE` a `loan_payments` row, or inserting a `transactions` row of `type = 'transfer'` with mismatched-household accounts — must fail. Track these in `tests/` alongside the app-level test suite (see [architecture.md](./architecture.md) §7). Not yet implemented for `net_worth_snapshots` — a good first constraint test to add would assert its `update`/`delete` are rejected outright (no policy, no grant).

## 6. Open questions

1. **Resolved (v1: same-currency only)**: `transactions.currency_code` must match `account_id`'s (and, for transfers, `transfer_account_id`'s) currency — enforced by trigger, not just convention. No `fx_rate`/cross-currency support in v1; revisit once a household actually needs a foreign-currency account.
2. **Resolved for `attachments` (this migration set), still open for `valuation_snapshots`**: `attachments` uses a `(attachable_type, attachable_id)` pair with trigger-enforced integrity (checked against each currently-attachable table by `attachable_type`), rather than a join table per entity type — chosen because the attachable set (`financial_account`, `transaction`, and later `loan`/`insurance_policy`/`asset`) is small and homogeneous (all household-scoped tables with a `uuid` PK), so the trigger stays a short, easily-extended `case` statement. Revisit the join-table-per-type alternative if that `case` statement grows unwieldy. `valuation_snapshots` (planned, §3 Investing) should follow the same pattern once built, for consistency.
3. **Resolved**: `people` is the answer — a household member without a login is a `people` row with `user_id is null`; `financial_accounts.owner_person_id` and `transactions.related_person_id` both reference `people`, not `auth.users`/`household_memberships`, so ownership/attribution works identically whether or not the person has signed in.
