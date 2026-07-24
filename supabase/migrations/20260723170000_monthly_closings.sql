-- PROMPT 33 — Monthly financial closing. A guided monthly review
-- workflow: start a closing for a period, work through 12 review items,
-- complete it (freezing income/expense/investment/debt totals plus a
-- net-worth snapshot link), and produce a report. Realizes the
-- `monthly_closings` entity already anticipated (but unbuilt) in
-- docs/financial-domain-model.md §7/§10 and docs/database-plan.md's
-- Planning table group: "append-only; a correction inserts a new row with
-- supersedes_closing_id rather than updating."
--
-- **Not fully append-only like loan_payments/net_worth_snapshots** — a
-- closing's own lifecycle `status` (and its reopen fields) genuinely does
-- change over time, the same "status is a mutable lifecycle marker,
-- substantive figures are not" shape `insurance_policies` already
-- established for renewal (PROMPT 25: the *old* row's `status` flips to
-- 'renewed' via an UPDATE, but its coverage/dates/premium never change).
-- Here: `start_monthly_closing()` inserts a new row (status
-- 'in_progress'); completing it fills in every total *once* via a single
-- UPDATE (income/expense/investment/debt/net-worth-snapshot/reconciliation
-- fields — never touched again afterward by any other action);
-- **"reopening requires deliberate confirmation"** is `reopenMonthlyClosingAction`,
-- a narrowly-scoped UPDATE of only `status`/`reopened_at`/`reopened_by`/
-- `reopen_reason` — the completed totals on that same row are never
-- rewritten. **"Later corrections are marked"**: re-closing a reopened
-- period always inserts a brand-new row with `supersedes_closing_id`
-- pointing at the reopened one (via `start_monthly_closing()` again) —
-- the old row keeps its original totals forever, now simply also
-- carrying `status = 'reopened'` as a permanent historical fact that it
-- was later revisited. **"Closed month remains viewable"**: nothing here
-- ever deletes a closing or a review item — every row for a period stays
-- queryable, oldest to newest, forming a full audit chain.
--
-- **"Immutable report version"**: `report_version` — 1 for a period's
-- first closing, incrementing by one each time a correction supersedes a
-- prior one for the same period.

-- ---------------------------------------------------------------------------
-- 1. monthly_closings
-- ---------------------------------------------------------------------------

create table public.monthly_closings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'in_progress' check (status in ('in_progress', 'closed', 'reopened')),
  started_at timestamptz not null default now(),
  started_by uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users (id) on delete set null,
  reopen_reason text,
  -- Set exactly once, by completeMonthlyClosingAction — never touched
  -- again by any other action, including reopen.
  income_total_minor_units bigint,
  expense_total_minor_units bigint,
  investment_contribution_minor_units bigint,
  debt_payment_minor_units bigint,
  net_cash_flow_minor_units bigint generated always as (
    income_total_minor_units - expense_total_minor_units - debt_payment_minor_units
  ) stored,
  -- Links to a real net_worth_snapshots row (PROMPT 32) rather than
  -- duplicating its figures — completing a closing ensures a snapshot
  -- exists "as of now" and records which one this closing refers to.
  net_worth_snapshot_id uuid references public.net_worth_snapshots (id) on delete restrict,
  reconciliation_status text check (reconciliation_status in ('clean', 'has_unresolved_items')),
  unresolved_items_count integer not null default 0 check (unresolved_items_count >= 0),
  notes text,
  report_version integer not null default 1 check (report_version >= 1),
  supersedes_closing_id uuid references public.monthly_closings (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint monthly_closings_completion_shape check (
    (status = 'in_progress' and completed_at is null and completed_by is null)
    or
    (status in ('closed', 'reopened') and completed_at is not null and completed_by is not null)
  ),
  constraint monthly_closings_reopen_shape check (
    status <> 'reopened' or (reopened_at is not null and reopened_by is not null and reopen_reason is not null)
  )
);

comment on table public.monthly_closings is
  'A household''s monthly closing workflow (PROMPT 33) — one row per closing attempt for a period; a correction after reopening is a brand-new row (supersedes_closing_id), never an edit of the old one''s frozen totals. See docs/financial-domain-model.md''s MonthlyClosing entry.';
comment on column public.monthly_closings.report_version is
  'Immutable once set — 1 for a period''s first closing, incrementing for each correction (a new row superseding a reopened one) for the same period.';
comment on column public.monthly_closings.status is
  'in_progress -> closed -> (optionally) reopened. Only this column (plus the reopen_at/by/reason fields) is ever updated after insert — income/expense/investment/debt totals, once set at completion, are never touched again by any action.';

create index monthly_closings_household_period_idx on public.monthly_closings (household_id, period, created_at desc);

create unique index monthly_closings_household_period_in_progress_uidx
  on public.monthly_closings (household_id, period)
  where status = 'in_progress';

create function public.check_monthly_closing_consistency()
returns trigger
language plpgsql
as $$
declare
  v_snapshot_household uuid;
  v_supersedes_household uuid;
  v_supersedes_period text;
begin
  if new.net_worth_snapshot_id is not null then
    select household_id into v_snapshot_household
    from public.net_worth_snapshots where id = new.net_worth_snapshot_id;
    if v_snapshot_household is null or v_snapshot_household <> new.household_id then
      raise exception 'monthly_closings.net_worth_snapshot_id must belong to the same household';
    end if;
  end if;

  if new.supersedes_closing_id is not null then
    select household_id, period into v_supersedes_household, v_supersedes_period
    from public.monthly_closings where id = new.supersedes_closing_id;
    if v_supersedes_household is null or v_supersedes_household <> new.household_id then
      raise exception 'monthly_closings.supersedes_closing_id must belong to the same household';
    end if;
    if v_supersedes_period <> new.period then
      raise exception 'monthly_closings.supersedes_closing_id must reference a closing for the same period';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_monthly_closing_consistency
  before insert or update on public.monthly_closings
  for each row
  execute function public.check_monthly_closing_consistency();

alter table public.monthly_closings enable row level security;

create policy "members can view their household's monthly closings" on public.monthly_closings
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can start a monthly closing" on public.monthly_closings
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update a monthly closing" on public.monthly_closings
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update on public.monthly_closings to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. monthly_closing_review_items — the 12-item checklist per closing.
-- ---------------------------------------------------------------------------

create table public.monthly_closing_review_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  monthly_closing_id uuid not null references public.monthly_closings (id) on delete cascade,
  item_type text not null check (
    item_type in (
      'account_balances', 'income', 'expenses', 'transfers', 'sip_contributions',
      'investment_valuations', 'loan_balances', 'lending_repayments',
      'insurance_premiums', 'asset_changes', 'goals', 'unusual_transactions'
    )
  ),
  is_reviewed boolean not null default false,
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (monthly_closing_id, item_type)
);

comment on table public.monthly_closing_review_items is
  'The 12-item review checklist for one monthly closing (PROMPT 33) — account balances, income, expenses, transfers, SIP contributions, investment valuations, loan balances, lending repayments, insurance premiums, asset changes, goals, unusual transactions. Persists as part of the historical record once a closing is completed — never deleted.';

create index monthly_closing_review_items_household_id_idx on public.monthly_closing_review_items (household_id);
create index monthly_closing_review_items_closing_id_idx on public.monthly_closing_review_items (monthly_closing_id);

create function public.check_monthly_closing_review_item_consistency()
returns trigger
language plpgsql
as $$
declare
  v_closing_household uuid;
begin
  select household_id into v_closing_household
  from public.monthly_closings where id = new.monthly_closing_id;
  if v_closing_household is null or v_closing_household <> new.household_id then
    raise exception 'monthly_closing_review_items.monthly_closing_id must belong to the same household';
  end if;
  return new;
end;
$$;

create trigger check_monthly_closing_review_item_consistency
  before insert or update on public.monthly_closing_review_items
  for each row
  execute function public.check_monthly_closing_review_item_consistency();

alter table public.monthly_closing_review_items enable row level security;

create policy "members can view their household's closing review items" on public.monthly_closing_review_items
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add closing review items" on public.monthly_closing_review_items
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update closing review items" on public.monthly_closing_review_items
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update on public.monthly_closing_review_items to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. start_monthly_closing() — atomically inserts the closing row and its
--    12 review-item rows.
-- ---------------------------------------------------------------------------

create function public.start_monthly_closing(
  p_household_id uuid,
  p_period text,
  p_currency_code text,
  p_supersedes_closing_id uuid default null
)
returns public.monthly_closings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_closing public.monthly_closings;
  v_item_type text;
  v_item_types text[] := array[
    'account_balances', 'income', 'expenses', 'transfers', 'sip_contributions',
    'investment_valuations', 'loan_balances', 'lending_repayments',
    'insurance_premiums', 'asset_changes', 'goals', 'unusual_transactions'
  ];
  v_report_version integer := 1;
begin
  if p_supersedes_closing_id is not null then
    select coalesce(report_version, 1) + 1 into v_report_version
    from public.monthly_closings
    where id = p_supersedes_closing_id and household_id = p_household_id;
  end if;

  insert into public.monthly_closings (
    household_id, period, currency_code, started_by, supersedes_closing_id, report_version
  )
  values (
    p_household_id, p_period, p_currency_code, auth.uid(), p_supersedes_closing_id, v_report_version
  )
  returning * into v_closing;

  foreach v_item_type in array v_item_types loop
    insert into public.monthly_closing_review_items (household_id, monthly_closing_id, item_type)
    values (p_household_id, v_closing.id, v_item_type);
  end loop;

  return v_closing;
end;
$$;

comment on function public.start_monthly_closing(uuid, text, text, uuid) is
  'Atomically creates a monthly closing plus its 12 review-item checklist rows. p_supersedes_closing_id links a post-reopen correction back to the closing it replaces and increments report_version. See PROMPT 33.';

grant execute on function public.start_monthly_closing(uuid, text, text, uuid) to authenticated, service_role;
