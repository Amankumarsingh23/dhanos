-- net_worth_snapshots: the first append-only, money-bearing table.
--
-- Demonstrates the full money/history convention set for every later
-- financial table to follow (see docs/money-calculation-rules.md):
--   - amounts as bigint minor units, paired with an explicit currency code;
--   - a date-only column (as_of_date) for the day the snapshot represents,
--     distinct from created_at (when the row was written);
--   - append-only: no updated_at, no update/delete policy or grant — a
--     correction is a new row for a later as_of_date, never an edit here.

create table public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  as_of_date date not null,
  total_assets_minor_units bigint not null check (total_assets_minor_units >= 0),
  total_liabilities_minor_units bigint not null check (total_liabilities_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (household_id, as_of_date)
);

comment on table public.net_worth_snapshots is
  'Append-only, dated rollup of assets minus liabilities. Never updated in place — see docs/money-calculation-rules.md §3.';

create index net_worth_snapshots_household_id_idx on public.net_worth_snapshots (household_id);

alter table public.net_worth_snapshots enable row level security;

create policy "members can view their household's net worth snapshots" on public.net_worth_snapshots
  for select
  using (public.is_household_member(household_id));

-- Viewers are read-only (see docs/security-model.md §3) — only owner/member
-- roles may record a new snapshot. There is deliberately no update or
-- delete policy: this table is append-only.
create policy "owners and members can record a net worth snapshot" on public.net_worth_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'member'));

-- Table-level grants stop at select/insert — no update/delete grant at all,
-- so even a service-role script cannot casually mutate history by mistake.
grant select, insert on public.net_worth_snapshots to authenticated, service_role;
