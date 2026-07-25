-- CSV import foundation (PROMPT 41). Two new tables carry the whole
-- workflow's audit trail — "user sees which rows were imported, skipped,
-- or rejected" is a stored fact per row, never something recomputed or
-- guessed after the fact:
--
--   import_batches: one row per upload attempt (transactions/
--   account_balances/investment_valuations), its column mapping, and
--   running counts.
--   import_rows: one row per CSV data row, its raw data (jsonb, so the
--   original values are always inspectable regardless of how mapping
--   changed), and its final status.
--
-- Nothing here writes to transactions/account_balance_snapshots/
-- investment_valuation_snapshots directly — those inserts happen through
-- the exact same application-layer paths (create_transaction_with_splits,
-- or a plain scoped insert) every manual entry already goes through, so
-- every existing trigger/constraint on those tables still applies
-- unchanged to an imported row ("invalid rows do not corrupt data" is
-- enforced by the same database-level checks manual entry already relies
-- on, not a second, parallel set of import-only rules).

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  import_type text not null check (
    import_type in ('transactions', 'account_balances', 'investment_valuations')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'ready', 'completed', 'failed', 'rolled_back')
  ),
  original_filename text not null check (char_length(btrim(original_filename)) > 0),
  -- Only set when the household opts in to keeping a private copy of the
  -- source file ("original file can be stored privately if user chooses")
  -- — reuses the existing private 'documents' Storage bucket and its
  -- household-scoped RLS unchanged (see
  -- supabase/migrations/20260721120000_expense_management.sql), never a
  -- public URL. Null means the household declined to keep a copy.
  stored_file_path text,
  -- { csvColumnIndex: targetFieldKey } as chosen in the column-mapping
  -- step — kept so a completed batch's mapping is always inspectable
  -- later, not just applied-and-forgotten.
  column_mapping jsonb not null default '{}'::jsonb,
  total_row_count integer not null default 0 check (total_row_count >= 0),
  imported_row_count integer not null default 0 check (imported_row_count >= 0),
  skipped_row_count integer not null default 0 check (skipped_row_count >= 0),
  rejected_row_count integer not null default 0 check (rejected_row_count >= 0),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

comment on table public.import_batches is
  'One row per CSV import attempt (PROMPT 41) — draft (uploaded, not yet validated) -> ready (validated + duplicate-checked, awaiting confirm) -> completed (committed) -> rolled_back. failed is reserved for a batch whose commit step could not proceed at all (e.g. every row rejected); a partially-successful commit is still "completed", with its per-row detail in import_rows carrying the actual outcome.';
comment on column public.import_batches.stored_file_path is
  'Storage path in the existing ''documents'' bucket, only when the household opted to keep a private copy of the source file. Null is the default — storing the original file is optional, never automatic.';

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- CASCADE: a row has no meaning without its parent batch.
  import_batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  -- The row's original CSV values, keyed by mapped target field — always
  -- inspectable regardless of what happened to it, so "which rows were
  -- skipped/rejected" always has a real answer, never a discarded one.
  raw_data jsonb not null,
  status text not null default 'pending' check (
    status in ('pending', 'imported', 'skipped_duplicate', 'rejected')
  ),
  error_message text,
  -- Populated only for status = 'skipped_duplicate' — always a specific,
  -- explainable reason (which key matched, and against what), never a
  -- bare "duplicate" flag. See PROMPT 41: "never silently discard
  -- uncertain duplicates" — an uncertain case is surfaced as a warning a
  -- household must explicitly decide on, not auto-skipped.
  duplicate_reason text,
  created_entity_table text check (
    created_entity_table in (
      'transactions', 'account_balance_snapshots', 'investment_valuation_snapshots'
    )
  ),
  created_entity_id uuid,
  created_at timestamptz not null default now(),
  unique (import_batch_id, row_number),
  constraint import_rows_rejected_has_message check (
    status <> 'rejected' or error_message is not null
  ),
  constraint import_rows_duplicate_has_reason check (
    status <> 'skipped_duplicate' or duplicate_reason is not null
  ),
  constraint import_rows_imported_has_entity check (
    status <> 'imported'
    or (created_entity_table is not null and created_entity_id is not null)
  )
);

comment on table public.import_rows is
  'One row per CSV data row (PROMPT 41) — the permanent, per-row audit trail behind a batch''s summary counts. Never deleted: even a rolled-back batch keeps its rows exactly as they were, so what happened during that import is never lost.';

create index import_batches_household_id_idx on public.import_batches (household_id);
create index import_rows_household_id_idx on public.import_rows (household_id);
create index import_rows_batch_id_idx on public.import_rows (import_batch_id);

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

create policy "members can view their household's import batches" on public.import_batches
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can create import batches" on public.import_batches
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update import batches" on public.import_batches
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "members can view their household's import rows" on public.import_rows
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can create import rows" on public.import_rows
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update import rows" on public.import_rows
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- No delete policy on either table, by design — same "archive/supersede,
-- never delete" convention as every other historical record in this app.

grant select, insert, update on public.import_batches to authenticated, service_role;
grant select, insert, update on public.import_rows to authenticated, service_role;

-- account_balance_snapshots.source grows an 'imported' value, matching
-- investment_valuation_snapshots.source's existing vocabulary exactly —
-- so an imported balance is honestly labeled as such, distinct from a
-- household's own manual entry or a reconciliation.
alter table public.account_balance_snapshots
  drop constraint account_balance_snapshots_source_check;

alter table public.account_balance_snapshots
  add constraint account_balance_snapshots_source_check
  check (source in ('manual', 'reconciliation', 'system_calculated', 'imported'));
