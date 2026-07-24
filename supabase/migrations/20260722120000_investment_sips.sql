-- PROMPT 17 — SIP management. A SIP (or any recurring investment plan) is
-- a template — name, asset/platform, contribution amount, cadence,
-- contribution account, schedule — that later investment_transactions
-- rows are generated from, mirroring recurring_rules' relationship to
-- transactions exactly (see supabase/migrations/20260721140000_recurring_commitments.sql,
-- which this migration is deliberately shaped after).
--
-- "Investment asset" and "platform" (PROMPT 17's field list) are not
-- separate columns here — a SIP references one investment_holdings row
-- (investment_holding_id), which already IS the asset+platform pair (see
-- PROMPT 16's investment_holdings). Storing them separately would let a
-- SIP's asset/platform drift out of sync with the holding its
-- contributions actually post against; the query layer derives both
-- display fields from the holding instead. "Provider" (e.g. a fund
-- house/AMC distinct from the platform used to invest through it, like
-- HDFC Mutual Fund via the Groww platform) has no dedicated entity yet,
-- so it's a plain free-text column.
--
-- Recording a contribution never rewrites recurring_rules' or
-- investment_transactions' history — each investment_transactions row
-- keeps its own independently-stored amount forever, so a SIP's
-- contribution_amount_minor_units changing going forward never touches a
-- past contribution (PROMPT 17 acceptance criterion "SIP amount changes
-- preserve historical amounts") — no dated amount-schedule table is
-- needed the way recurring_rule_amount_schedules was, since PROMPT 17
-- only asks that the past stay untouched, not that a future change be
-- schedulable ahead of time.

-- ---------------------------------------------------------------------------
-- 1. investment_sips
-- ---------------------------------------------------------------------------

create table public.investment_sips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  -- RESTRICT: a SIP with contribution history can't be silently orphaned
  -- by deleting the holding it posts against.
  investment_holding_id uuid not null references public.investment_holdings (id) on delete restrict,
  -- The fund house/issuer/AMC, when meaningfully different from the
  -- platform (investment_holding_id's account) used to invest through it
  -- — free text, no dedicated entity yet.
  provider text,
  contribution_amount_minor_units bigint not null check (contribution_amount_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  frequency text not null check (
    frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'custom')
  ),
  interval_count smallint not null default 1 check (interval_count > 0),
  start_date date not null,
  end_date date,
  -- The bank/wallet account contributions are debited from — distinct
  -- from investment_holding_id (where the money ends up). RESTRICT: same
  -- reasoning as transactions.account_id.
  contribution_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  -- Null once the schedule has nothing left before end_date, or once the
  -- SIP is completed/cancelled — same convention as recurring_rules.next_due_date.
  next_due_date date,
  last_contribution_date date,
  -- A soft, informational estimate of how long this SIP is expected to
  -- run (e.g. "planning ~60 months"), distinct from the hard end_date —
  -- PROMPT 17 lists both "end date (optional)" and "expected duration" as
  -- separate fields.
  expected_duration_months integer check (expected_duration_months is null or expected_duration_months > 0),
  status text not null default 'planned' check (
    status in ('planned', 'active', 'paused', 'completed', 'cancelled')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_sips_end_after_start check (end_date is null or end_date >= start_date)
);

comment on table public.investment_sips is
  'A recurring investment plan (SIP) template — contributions are generated against it via investment_transactions.investment_sip_id, never stored as a single mutable value here. See PROMPT 17.';
comment on column public.investment_sips.investment_holding_id is
  'The (platform, investment asset) pair this SIP contributes to — PROMPT 17''s "investment asset" and "platform" fields are both derived from this at the query layer, never duplicated as separate columns.';
comment on column public.investment_sips.status is
  'Lifecycle: planned (not yet started/activated), active (generating/reminding on schedule), paused (frozen — next_due_date does not advance), completed (schedule exhausted, or manually marked done), cancelled (stopped early by the household). History is preserved regardless of status. See PROMPT 17.';

create index investment_sips_household_id_idx on public.investment_sips (household_id);
create index investment_sips_investment_holding_id_idx on public.investment_sips (investment_holding_id);
create index investment_sips_contribution_account_id_idx on public.investment_sips (contribution_account_id);
create index investment_sips_next_due_date_idx on public.investment_sips (next_due_date) where status = 'active';

create trigger set_updated_at
  before update on public.investment_sips
  for each row
  execute function public.set_updated_at();

-- Household + currency consistency: investment_holding_id and
-- contribution_account_id must belong to the same household, and
-- currency_code must match both the holding's asset currency and the
-- contribution account's currency (no silent cross-currency SIP — PROMPT
-- 17's "different currencies are not combined without an explicit
-- conversion system" applies here exactly as it does to
-- investment_transactions/investment_valuation_snapshots).
create function public.check_investment_sip_consistency()
returns trigger
language plpgsql
as $$
declare
  v_holding_household uuid;
  v_asset_currency text;
  v_account_household uuid;
  v_account_currency text;
begin
  select ih.household_id, ia.currency_code
    into v_holding_household, v_asset_currency
  from public.investment_holdings ih
  join public.investment_assets ia on ia.id = ih.investment_asset_id
  where ih.id = new.investment_holding_id;

  if v_holding_household is null or v_holding_household <> new.household_id then
    raise exception 'investment_sips.investment_holding_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'investment_sips.currency_code must match the holding''s asset currency';
  end if;

  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.contribution_account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'investment_sips.contribution_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'investment_sips.currency_code must match contribution_account_id''s currency';
  end if;

  return new;
end;
$$;

comment on function public.check_investment_sip_consistency() is
  'Trigger: enforces investment_holding_id/contribution_account_id belong to the same household as the SIP, and that currency_code matches both the holding''s asset currency and the contribution account''s currency.';

create trigger check_investment_sip_consistency
  before insert or update on public.investment_sips
  for each row
  execute function public.check_investment_sip_consistency();

alter table public.investment_sips enable row level security;

create policy "members can view their household's SIPs" on public.investment_sips
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add SIPs" on public.investment_sips
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update SIPs" on public.investment_sips
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete SIPs" on public.investment_sips
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.investment_sips to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. investment_sip_events: append-only SIP history, mirrors
--    recurring_rule_events exactly. No update/delete policy or grant.
-- ---------------------------------------------------------------------------

create table public.investment_sip_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  investment_sip_id uuid not null references public.investment_sips (id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'activated', 'paused', 'resumed', 'completed', 'cancelled', 'contribution_recorded')
  ),
  -- The occurrence this event concerns — set for 'contribution_recorded'.
  occurrence_date date,
  -- The investment_transactions row a 'contribution_recorded' event
  -- produced.
  investment_transaction_id uuid references public.investment_transactions (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.investment_sip_events is
  'Append-only history for one investment_sips row. Never updated or deleted; a correction is a new event. See PROMPT 17.';

create index investment_sip_events_household_id_idx on public.investment_sip_events (household_id);
create index investment_sip_events_sip_id_idx on public.investment_sip_events (investment_sip_id, created_at desc);
create index investment_sip_events_investment_transaction_id_idx on public.investment_sip_events (investment_transaction_id);

create function public.check_investment_sip_event_household()
returns trigger
language plpgsql
as $$
declare
  v_transaction_household uuid;
begin
  if not exists (
    select 1 from public.investment_sips
    where id = new.investment_sip_id and household_id = new.household_id
  ) then
    raise exception 'investment_sip_events.investment_sip_id must belong to the same household';
  end if;

  if new.investment_transaction_id is not null then
    select household_id into v_transaction_household
    from public.investment_transactions where id = new.investment_transaction_id;

    if v_transaction_household is null or v_transaction_household <> new.household_id then
      raise exception 'investment_sip_events.investment_transaction_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_investment_sip_event_household
  before insert on public.investment_sip_events
  for each row
  execute function public.check_investment_sip_event_household();

alter table public.investment_sip_events enable row level security;

create policy "members can view their household's SIP events" on public.investment_sip_events
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can log a SIP event" on public.investment_sip_events
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert on public.investment_sip_events to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. investment_transactions.investment_sip_id: links a contribution back
--    to the SIP that generated it, and — via a partial unique index — is
--    the hard, database-layer backstop against ever recording the same
--    SIP's occurrence twice ("avoid double counting", PROMPT 17), the same
--    mechanism as transactions_recurring_rule_occurrence_uidx.
-- ---------------------------------------------------------------------------

alter table public.investment_transactions
  add column investment_sip_id uuid references public.investment_sips (id) on delete set null;

comment on column public.investment_transactions.investment_sip_id is
  'The investment_sips row this contribution was generated from, if any — null for a manually-entered purchase/sale/dividend/fee unrelated to a SIP. See PROMPT 17.';

-- PROMPT 16 only anticipated 'manual'/'import' source_type values;
-- widened here to also allow 'recurring' for a SIP-generated contribution
-- — the same value and meaning the core ledger's transactions.source_type
-- already uses for a recurring_rules-generated occurrence.
alter table public.investment_transactions
  drop constraint investment_transactions_source_type_check;
alter table public.investment_transactions
  add constraint investment_transactions_source_type_check
  check (source_type in ('manual', 'import', 'recurring'));

create index investment_transactions_investment_sip_id_idx on public.investment_transactions (investment_sip_id);

create unique index investment_transactions_sip_occurrence_uidx
  on public.investment_transactions (investment_sip_id, transaction_date)
  where investment_sip_id is not null and status <> 'cancelled';

comment on index public.investment_transactions_sip_occurrence_uidx is
  'At most one non-cancelled investment_transactions row per (investment_sip_id, transaction_date) — a SIP can never record the same occurrence twice, even under a race or a bug. PROMPT 17 acceptance criterion "Recording contribution affects cash account once" / "avoid double counting".';

-- Extend the investment_transactions consistency trigger (PROMPT 16) with
-- the same same-household check every other reference on this table gets.
create or replace function public.check_investment_transaction_consistency()
returns trigger
language plpgsql
as $$
declare
  v_holding_household uuid;
  v_asset_currency text;
  v_linked_household uuid;
  v_sip_household uuid;
begin
  select ih.household_id, ia.currency_code
    into v_holding_household, v_asset_currency
  from public.investment_holdings ih
  join public.investment_assets ia on ia.id = ih.investment_asset_id
  where ih.id = new.investment_holding_id;

  if v_holding_household is null or v_holding_household <> new.household_id then
    raise exception 'investment_transactions.investment_holding_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'investment_transactions.currency_code must match the holding''s asset currency';
  end if;

  if new.related_person_id is not null and not exists (
    select 1 from public.people
    where id = new.related_person_id and household_id = new.household_id
  ) then
    raise exception 'investment_transactions.related_person_id must belong to the same household';
  end if;

  if new.linked_transaction_id is not null then
    select household_id into v_linked_household
    from public.transactions where id = new.linked_transaction_id;

    if v_linked_household is null or v_linked_household <> new.household_id then
      raise exception 'investment_transactions.linked_transaction_id must belong to the same household';
    end if;
  end if;

  if new.investment_sip_id is not null then
    select household_id into v_sip_household
    from public.investment_sips where id = new.investment_sip_id;

    if v_sip_household is null or v_sip_household <> new.household_id then
      raise exception 'investment_transactions.investment_sip_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_investment_transaction_consistency() is
  'Trigger: enforces household consistency across investment_holding_id/related_person_id/linked_transaction_id/investment_sip_id, and that currency_code matches the holding''s asset currency.';

-- ---------------------------------------------------------------------------
-- 4. RPCs — each is one atomic write PostgREST cannot otherwise span
--    (docs/data-access-patterns.md §1.1).
-- ---------------------------------------------------------------------------

-- Transitions a SIP's status and logs the event together.
create function public.set_investment_sip_status(
  p_household_id uuid,
  p_investment_sip_id uuid,
  p_status text,
  p_event_type text,
  p_notes text default null
)
returns public.investment_sips
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sip public.investment_sips;
begin
  update public.investment_sips
  set status = p_status
  where id = p_investment_sip_id and household_id = p_household_id
  returning * into v_sip;

  if v_sip.id is null then
    raise exception 'SIP not found';
  end if;

  insert into public.investment_sip_events
    (household_id, investment_sip_id, event_type, notes)
  values
    (p_household_id, p_investment_sip_id, p_event_type, p_notes);

  return v_sip;
end;
$$;

comment on function public.set_investment_sip_status(uuid, uuid, text, text, text) is
  'Atomically updates a SIP''s status and logs the transition as an investment_sip_events row. See PROMPT 17.';

-- Records one actual SIP contribution: writes the core-ledger transaction
-- (kind = investment_contribution, so PROMPT 15's cash-flow dashboard and
-- the contribution account's calculated balance both pick it up), the
-- investment_transactions contribution row linked to it, advances
-- next_due_date + last_contribution_date, and logs the event — all four
-- effects the PROMPT 17 "Contributions" section requires, in one atomic
-- write. investment_transactions_sip_occurrence_uidx (above) is the hard
-- backstop against ever doing this twice for the same date.
--
-- Parameter order: required arguments first; everything mirroring a
-- nullable column (next_due_date, once the schedule is exhausted) trails
-- with `default null`, per the same Postgres-declaration-order note as
-- record_recurring_rule_occurrence.
create function public.record_investment_sip_contribution(
  p_household_id uuid,
  p_investment_sip_id uuid,
  p_investment_holding_id uuid,
  p_contribution_account_id uuid,
  p_occurrence_date date,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_status text,
  p_next_due_date date default null
)
returns public.investment_transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ledger_transaction public.transactions;
  v_investment_transaction public.investment_transactions;
  v_sip public.investment_sips;
begin
  -- 1. Linked cash-flow transaction — the account balance effect (via the
  -- existing signedContribution mapping for kind = investment_contribution)
  -- and PROMPT 15's dashboard both come from this one row.
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, status, source_type, description
  )
  values (
    p_household_id, 'investment_contribution', p_amount_minor_units, p_currency_code, p_occurrence_date,
    p_contribution_account_id, p_status, 'recurring', 'SIP contribution'
  )
  returning * into v_ledger_transaction;

  -- 2. The investment contribution record itself, linked back to (1).
  insert into public.investment_transactions (
    household_id, investment_holding_id, investment_sip_id, transaction_type,
    transaction_date, amount_minor_units, currency_code, status, linked_transaction_id,
    source_type
  )
  values (
    p_household_id, p_investment_holding_id, p_investment_sip_id, 'contribution',
    p_occurrence_date, p_amount_minor_units, p_currency_code, p_status, v_ledger_transaction.id,
    'recurring'
  )
  returning * into v_investment_transaction;

  -- 3. Advance the schedule.
  update public.investment_sips
  set next_due_date = p_next_due_date, last_contribution_date = p_occurrence_date
  where id = p_investment_sip_id and household_id = p_household_id
  returning * into v_sip;

  if v_sip.id is null then
    raise exception 'SIP not found';
  end if;

  -- 4. The SIP-specific history log (distinct from the generic
  -- activity_events audit log, which the calling Server Action writes —
  -- see docs/data-access-patterns.md step 6).
  insert into public.investment_sip_events
    (household_id, investment_sip_id, event_type, occurrence_date, investment_transaction_id)
  values
    (p_household_id, p_investment_sip_id, 'contribution_recorded', p_occurrence_date, v_investment_transaction.id);

  return v_investment_transaction;
end;
$$;

comment on function public.record_investment_sip_contribution(uuid, uuid, uuid, uuid, date, bigint, text, text, date) is
  'Atomically writes one SIP contribution''s cash-flow transaction and investment_transactions row, advances next_due_date, and logs the event — investment_transactions_sip_occurrence_uidx is the hard backstop against recording the same occurrence twice. See PROMPT 17.';

grant execute on function public.set_investment_sip_status(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.record_investment_sip_contribution(uuid, uuid, uuid, uuid, date, bigint, text, text, date) to authenticated, service_role;
