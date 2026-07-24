-- PROMPT 19 — Staking and daily value tracking. A dedicated module for a
-- position whose value is tracked day by day (crypto staking, or any
-- other daily-growth arrangement) — distinct from investment_holdings'
-- periodic, sparse investment_valuation_snapshots (PROMPT 16), which
-- can't represent "one entry per day with a full opening/contribution/
-- reward/withdrawal/fee/closing breakdown, never overwritten."
--
-- Like investment_sips (PROMPT 17), a staking_positions row references
-- one investment_holdings row rather than duplicating "platform"/"asset"
-- as separate columns — the holding already is that pair.

-- ---------------------------------------------------------------------------
-- 1. staking_positions
-- ---------------------------------------------------------------------------

create table public.staking_positions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  -- RESTRICT: a position with daily snapshot history can't be silently
  -- orphaned by deleting the holding it tracks.
  investment_holding_id uuid not null references public.investment_holdings (id) on delete restrict,
  opening_principal_minor_units bigint not null check (opening_principal_minor_units > 0),
  opening_date date not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Optional, and NEVER shown as guaranteed (PROMPT 19) — a decimal daily
  -- rate, e.g. 0.0005 for 0.05%/day. Bounded to reject clearly impossible
  -- entries: <= -100% would mean losing the entire position (or more) in
  -- a single day; above +50%/day is implausible for any real position and
  -- almost certainly a data-entry error (e.g. "5" typed for 5% instead of
  -- 0.05) — see src/lib/calculations/staking-snapshot.ts's
  -- validateExpectedDailyRate for the additional application-layer
  -- "suspicious but not impossible" warning band.
  expected_daily_rate numeric check (
    expected_daily_rate is null or (expected_daily_rate > -1 and expected_daily_rate <= 0.5)
  ),
  -- Null: no lock-in. Otherwise the date before which withdrawal isn't
  -- possible/penalized — the "liquidity limitation" risk signal.
  lock_in_end_date date,
  fee_notes text,
  risk_notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staking_positions_lock_in_after_opening
    check (lock_in_end_date is null or lock_in_end_date >= opening_date)
);

comment on table public.staking_positions is
  'A daily-tracked staking/daily-growth position — references one investment_holdings row (platform+asset), never duplicates them as separate columns. See PROMPT 19.';
comment on column public.staking_positions.expected_daily_rate is
  'An assumption, not a guarantee — see docs/money-calculation-rules.md §4 and PROMPT 19: "expected return must never be shown as guaranteed."';

create index staking_positions_household_id_idx on public.staking_positions (household_id);
create index staking_positions_investment_holding_id_idx on public.staking_positions (investment_holding_id);

create trigger set_updated_at
  before update on public.staking_positions
  for each row
  execute function public.set_updated_at();

-- Household + currency consistency — same shape as
-- check_investment_sip_consistency (PROMPT 17).
create function public.check_staking_position_consistency()
returns trigger
language plpgsql
as $$
declare
  v_holding_household uuid;
  v_asset_currency text;
begin
  select ih.household_id, ia.currency_code
    into v_holding_household, v_asset_currency
  from public.investment_holdings ih
  join public.investment_assets ia on ia.id = ih.investment_asset_id
  where ih.id = new.investment_holding_id;

  if v_holding_household is null or v_holding_household <> new.household_id then
    raise exception 'staking_positions.investment_holding_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'staking_positions.currency_code must match the holding''s asset currency';
  end if;

  return new;
end;
$$;

comment on function public.check_staking_position_consistency() is
  'Trigger: enforces investment_holding_id belongs to the same household as the position, and that currency_code matches the holding''s asset currency.';

create trigger check_staking_position_consistency
  before insert or update on public.staking_positions
  for each row
  execute function public.check_staking_position_consistency();

alter table public.staking_positions enable row level security;

create policy "members can view their household's staking positions" on public.staking_positions
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add staking positions" on public.staking_positions
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update staking positions" on public.staking_positions
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete staking positions" on public.staking_positions
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.staking_positions to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. staking_daily_snapshots — append-only, revision-versioned. PROMPT 19:
--    "Do not overwrite yesterday's snapshot" / "One snapshot per position
--    per day unless adjustments are explicitly versioned."
--
--    `revision` starts at 1 for a date's first entry; a correction is
--    always a NEW row with the next revision number for the same
--    (position, date) — never an UPDATE of the existing row (no UPDATE
--    policy or grant at all, same convention as account_balance_snapshots/
--    investment_valuation_snapshots). `adjustment_reason` is required
--    (non-empty) whenever revision > 1, so an adjustment is always
--    explicitly explained, never a silent overwrite-by-another-name.
--
--    The closing-value equation PROMPT 19 specifies is enforced as a
--    database CHECK constraint (not just application validation) since it
--    is simple and absolute (docs/money-calculation-rules.md §1): every
--    revision's own five components must already balance to its own
--    closing value. "Allow adjustments with explanation" means a
--    household can submit a *different* balanced set of components as a
--    new revision, explained — never an unbalanced one at any revision.
-- ---------------------------------------------------------------------------

create table public.staking_daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  staking_position_id uuid not null references public.staking_positions (id) on delete cascade,
  snapshot_date date not null,
  revision smallint not null default 1 check (revision > 0),
  opening_value_minor_units bigint not null check (opening_value_minor_units >= 0),
  contribution_minor_units bigint not null default 0 check (contribution_minor_units >= 0),
  withdrawal_minor_units bigint not null default 0 check (withdrawal_minor_units >= 0),
  -- Signed: a slashing/penalty event is a legitimate negative reward.
  reward_minor_units bigint not null default 0,
  fee_minor_units bigint not null default 0 check (fee_minor_units >= 0),
  closing_value_minor_units bigint not null check (closing_value_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- False for a system-generated placeholder/estimate (no such generator
  -- exists yet — this app only ever writes manually-entered rows today,
  -- but the flag exists so a future import/estimate path can be
  -- distinguished at the UI layer, per PROMPT 19's "manually entered data
  -- indicator" risk signal).
  manually_confirmed boolean not null default true,
  source text not null default 'manual' check (
    source in ('manual', 'imported', 'institution_statement', 'calculated')
  ),
  adjustment_reason text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staking_position_id, snapshot_date, revision),
  constraint staking_daily_snapshots_balances check (
    closing_value_minor_units = opening_value_minor_units + contribution_minor_units
      + reward_minor_units - withdrawal_minor_units - fee_minor_units
  ),
  constraint staking_daily_snapshots_adjustment_requires_reason check (
    revision = 1 or (adjustment_reason is not null and char_length(btrim(adjustment_reason)) > 0)
  )
);

comment on table public.staking_daily_snapshots is
  'Append-only, revision-versioned daily value snapshot for one staking_positions row. Never updated or deleted — a correction is a new, higher-revision row for the same date, with a required adjustment_reason. See PROMPT 19.';
comment on column public.staking_daily_snapshots.revision is
  'Starts at 1 per (staking_position_id, snapshot_date); a correction inserts revision + 1, explained by adjustment_reason. The row with the highest revision for a date is authoritative — see staking_daily_snapshots_current below.';

create index staking_daily_snapshots_household_id_idx on public.staking_daily_snapshots (household_id);
create index staking_daily_snapshots_position_id_idx on public.staking_daily_snapshots (staking_position_id, snapshot_date desc);

create function public.check_staking_daily_snapshot_consistency()
returns trigger
language plpgsql
as $$
declare
  v_position_household uuid;
  v_position_currency text;
begin
  select household_id, currency_code into v_position_household, v_position_currency
  from public.staking_positions where id = new.staking_position_id;

  if v_position_household is null or v_position_household <> new.household_id then
    raise exception 'staking_daily_snapshots.staking_position_id must belong to the same household';
  end if;

  if new.currency_code <> v_position_currency then
    raise exception 'staking_daily_snapshots.currency_code must match the position''s currency';
  end if;

  return new;
end;
$$;

comment on function public.check_staking_daily_snapshot_consistency() is
  'Trigger: rejects a staking_daily_snapshots row whose staking_position_id belongs to a different household, or whose currency_code does not match the position''s currency.';

create trigger check_staking_daily_snapshot_consistency
  before insert on public.staking_daily_snapshots
  for each row
  execute function public.check_staking_daily_snapshot_consistency();

alter table public.staking_daily_snapshots enable row level security;

create policy "members can view their household's staking snapshots" on public.staking_daily_snapshots
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all.
create policy "owners, admins, and editors can record a staking snapshot" on public.staking_daily_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- No update/delete grant either — see docs/database-plan.md §4.
grant select, insert on public.staking_daily_snapshots to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. staking_daily_snapshots_current: the latest (highest-revision) row
--    per (staking_position_id, snapshot_date) — what every read query
--    should use instead of re-deriving "latest revision" client-side.
-- ---------------------------------------------------------------------------

create view public.staking_daily_snapshots_current
with (security_invoker = true)
as
  select distinct on (staking_position_id, snapshot_date) *
  from public.staking_daily_snapshots
  order by staking_position_id, snapshot_date, revision desc;

comment on view public.staking_daily_snapshots_current is
  'The authoritative (highest-revision) staking_daily_snapshots row per position per date. security_invoker = true so the view is subject to the same RLS as the underlying table.';

grant select on public.staking_daily_snapshots_current to authenticated, service_role;
