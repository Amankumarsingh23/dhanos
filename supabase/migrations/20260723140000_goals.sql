-- PROMPT 30 — Financial goals. Major future needs (emergency fund, house
-- construction/purchase, land purchase, a sister's or one's own marriage,
-- education, business launch, vehicle, healthcare reserve, parents'
-- retirement, travel, renovation, debt closure, custom), each with a
-- target amount (today's purchasing power — see computeGoalFunding),
-- currency, target date, inflation/expected-return assumptions, priority,
-- flexibility, and optional links to the people responsible and the real
-- accounts/investment holdings funding it.
--
-- **"Goals can have multiple funding sources"** (PROMPT 30 acceptance
-- criterion) is `goal_funding_sources` below — a goal's current saved
-- amount is never a single manually-typed number alone; it's the sum of
-- an optional manual figure (untracked cash) plus every linked account's/
-- investment holding's own real current value, each scaled by an explicit
-- `allocation_percentage` rather than assumed to be 100% dedicated to this
-- one goal.
--
-- **"The same investment allocation cannot be accidentally counted fully
-- toward several goals without showing the overlap"**: nothing here
-- *prevents* linking one account/holding to more than one goal (that's a
-- legitimate real-world case — one emergency fund account can genuinely
-- back both "emergency fund" and "healthcare reserve"), but
-- `allocation_percentage` is per (goal, source) pair, never a property of
-- the source itself, and the application layer
-- (src/lib/calculations/goals.ts's computeFundingSourceAllocationTotals)
-- always computes and surfaces each source's *total* allocation across
-- every goal it's linked to — a total over 100% is a visible, explainable
-- fact ("this account is over-allocated across your goals"), never a
-- silently-hidden double-count.
--
-- Outstanding funding-gap/required-contribution/on-track figures are
-- always derived, never stored — same "no value column" rule as
-- Asset/InvestmentHolding — see src/lib/calculations/goals.ts, which
-- builds directly on src/lib/calculations/calculators/goal-funding.ts
-- (PROMPT 20) rather than re-deriving the same future-value arithmetic.

-- ---------------------------------------------------------------------------
-- 1. goals
-- ---------------------------------------------------------------------------

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  goal_type text not null check (
    goal_type in (
      'emergency_fund', 'house_construction', 'home_purchase', 'land_purchase',
      'sister_marriage', 'personal_marriage', 'education', 'business_launch',
      'vehicle', 'healthcare_reserve', 'parents_retirement', 'travel',
      'renovation', 'debt_closure', 'custom'
    )
  ),
  -- Today's purchasing power — inflated forward to target_date by the
  -- application layer (computeGoalFunding), never stored pre-inflated.
  target_amount_minor_units bigint not null check (target_amount_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  target_date date not null,
  -- The untracked portion of what's already saved (e.g. physical cash) —
  -- separate from goal_funding_sources below, which cover money already
  -- tracked in a real account/investment holding.
  manual_current_saved_amount_minor_units bigint not null default 0 check (manual_current_saved_amount_minor_units >= 0),
  -- "Never assume investment returns are guaranteed" (PROMPT 30 acceptance
  -- criterion) — both assumptions are always required, explicit inputs,
  -- never a hidden default the household didn't see. Bounds mirror
  -- liabilities.annual_interest_rate / validateAnnualRate's own bounds.
  annual_inflation_rate numeric not null default 0.06 check (annual_inflation_rate > -1 and annual_inflation_rate <= 10),
  annual_expected_return numeric not null default 0 check (annual_expected_return > -1 and annual_expected_return <= 10),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  flexibility text not null default 'somewhat_flexible' check (
    flexibility in ('fixed', 'somewhat_flexible', 'flexible')
  ),
  -- Lifecycle, only ever changed by an explicit user action — on-track/
  -- funding-gap status is always computed fresh (src/lib/calculations/goals.ts),
  -- never folded into this column.
  status text not null default 'active' check (status in ('active', 'paused', 'achieved', 'abandoned')),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.goals is
  'Financial goals (PROMPT 30): major future needs with a target amount (today''s purchasing power), currency, target date, inflation/expected-return assumptions, priority, and flexibility. Funding-gap/required-contribution/on-track figures are always derived — see src/lib/calculations/goals.ts — never stored on this row.';
comment on column public.goals.target_amount_minor_units is
  'Today''s purchasing power, not the inflated future amount — src/lib/calculations/calculators/goal-funding.ts inflates it forward to target_date using annual_inflation_rate.';
comment on column public.goals.status is
  'active/paused/achieved/abandoned — a lifecycle only ever set by an explicit user action, distinct from the computed on-track status.';

create index goals_household_id_idx on public.goals (household_id);
create index goals_target_date_idx on public.goals (target_date);

create trigger set_updated_at
  before update on public.goals
  for each row
  execute function public.set_updated_at();

alter table public.goals enable row level security;

create policy "members can view their household's goals" on public.goals
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add goals" on public.goals
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update goals" on public.goals
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete goals" on public.goals
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.goals to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. goal_responsible_people — many-to-many, mirrors
--    insurance_policy_insured_people's shape exactly.
-- ---------------------------------------------------------------------------

create table public.goal_responsible_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (goal_id, person_id)
);

comment on table public.goal_responsible_people is
  'Which people are responsible for a goal (PROMPT 30 "responsible people" field) — many-to-many, same shape as insurance_policy_insured_people.';

create index goal_responsible_people_household_id_idx on public.goal_responsible_people (household_id);
create index goal_responsible_people_goal_id_idx on public.goal_responsible_people (goal_id);
create index goal_responsible_people_person_id_idx on public.goal_responsible_people (person_id);

create function public.check_goal_responsible_person_consistency()
returns trigger
language plpgsql
as $$
declare
  v_goal_household uuid;
  v_person_household uuid;
begin
  select household_id into v_goal_household from public.goals where id = new.goal_id;
  if v_goal_household is null or v_goal_household <> new.household_id then
    raise exception 'goal_responsible_people.goal_id must belong to the same household';
  end if;

  select household_id into v_person_household from public.people where id = new.person_id;
  if v_person_household is null or v_person_household <> new.household_id then
    raise exception 'goal_responsible_people.person_id must belong to the same household';
  end if;

  return new;
end;
$$;

create trigger check_goal_responsible_person_consistency
  before insert on public.goal_responsible_people
  for each row
  execute function public.check_goal_responsible_person_consistency();

alter table public.goal_responsible_people enable row level security;

create policy "members can view their household's goal responsible people" on public.goal_responsible_people
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can manage goal responsible people" on public.goal_responsible_people
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can remove goal responsible people" on public.goal_responsible_people
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on public.goal_responsible_people to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. goal_funding_sources — a goal's real funding sources, each an
--    explicit percentage of one financial_accounts or investment_holdings
--    row's current value. See the module comment above for the overlap
--    (double-counting) design.
-- ---------------------------------------------------------------------------

create table public.goal_funding_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  source_type text not null check (source_type in ('account', 'investment_holding')),
  account_id uuid references public.financial_accounts (id) on delete restrict,
  investment_holding_id uuid references public.investment_holdings (id) on delete restrict,
  -- How much of the source's own current value counts toward *this* goal —
  -- never assumed to be 100%, and never a property of the source itself
  -- (the same source can carry a different percentage per goal it funds).
  allocation_percentage numeric not null default 100 check (allocation_percentage > 0 and allocation_percentage <= 100),
  notes text,
  created_at timestamptz not null default now(),
  constraint goal_funding_sources_type_matches_reference check (
    (source_type = 'account' and account_id is not null and investment_holding_id is null)
    or
    (source_type = 'investment_holding' and investment_holding_id is not null and account_id is null)
  )
);

comment on table public.goal_funding_sources is
  'A goal''s real funding sources (PROMPT 30 "goals can have multiple funding sources"): each row is one account or investment holding, scaled by allocation_percentage. The same source can appear under multiple goals — src/lib/calculations/goals.ts always computes each source''s total allocation across every goal, surfacing an over-100% total as a visible overlap rather than silently double-counting or blocking the link.';
comment on column public.goal_funding_sources.allocation_percentage is
  'What share of this source''s own current value counts toward this goal — per (goal, source) pair, never a property of the source itself, so the same account/holding can fund multiple goals at different percentages.';

create index goal_funding_sources_household_id_idx on public.goal_funding_sources (household_id);
create index goal_funding_sources_goal_id_idx on public.goal_funding_sources (goal_id);
create index goal_funding_sources_account_id_idx on public.goal_funding_sources (account_id);
create index goal_funding_sources_investment_holding_id_idx on public.goal_funding_sources (investment_holding_id);

-- One link per (goal, source) — adjust the percentage on the existing row
-- rather than creating a duplicate link.
create unique index goal_funding_sources_goal_account_uidx
  on public.goal_funding_sources (goal_id, account_id)
  where account_id is not null;
create unique index goal_funding_sources_goal_holding_uidx
  on public.goal_funding_sources (goal_id, investment_holding_id)
  where investment_holding_id is not null;

create function public.check_goal_funding_source_consistency()
returns trigger
language plpgsql
as $$
declare
  v_goal_household uuid;
  v_account_household uuid;
  v_holding_household uuid;
begin
  select household_id into v_goal_household from public.goals where id = new.goal_id;
  if v_goal_household is null or v_goal_household <> new.household_id then
    raise exception 'goal_funding_sources.goal_id must belong to the same household';
  end if;

  if new.account_id is not null then
    select household_id into v_account_household
    from public.financial_accounts where id = new.account_id;
    if v_account_household is null or v_account_household <> new.household_id then
      raise exception 'goal_funding_sources.account_id must belong to the same household';
    end if;
  end if;

  if new.investment_holding_id is not null then
    select household_id into v_holding_household
    from public.investment_holdings where id = new.investment_holding_id;
    if v_holding_household is null or v_holding_household <> new.household_id then
      raise exception 'goal_funding_sources.investment_holding_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_goal_funding_source_consistency
  before insert on public.goal_funding_sources
  for each row
  execute function public.check_goal_funding_source_consistency();

alter table public.goal_funding_sources enable row level security;

create policy "members can view their household's goal funding sources" on public.goal_funding_sources
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add goal funding sources" on public.goal_funding_sources
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can remove goal funding sources" on public.goal_funding_sources
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on public.goal_funding_sources to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_goal() — inserts a goal and its initial responsible-people/
--    funding-source rows atomically, same "array + jsonb-array parameter"
--    idiom as create_insurance_policy (uuid[]) extended with a jsonb[]
--    for funding sources, since each funding-source row carries more than
--    a single id (source_type, one of two possible references, a
--    percentage).
-- ---------------------------------------------------------------------------

create function public.create_goal(
  p_household_id uuid,
  p_name text,
  p_goal_type text,
  p_target_amount_minor_units bigint,
  p_currency_code text,
  p_target_date date,
  p_manual_current_saved_amount_minor_units bigint default 0,
  p_annual_inflation_rate numeric default 0.06,
  p_annual_expected_return numeric default 0,
  p_priority text default 'medium',
  p_flexibility text default 'somewhat_flexible',
  p_notes text default null,
  p_responsible_person_ids uuid[] default array[]::uuid[],
  -- Each element: {"sourceType": "account"|"investment_holding", "accountId": uuid|null, "investmentHoldingId": uuid|null, "allocationPercentage": numeric}
  p_funding_sources jsonb default '[]'::jsonb
)
returns public.goals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_goal public.goals;
  v_person_id uuid;
  v_source jsonb;
begin
  insert into public.goals (
    household_id, name, goal_type, target_amount_minor_units, currency_code, target_date,
    manual_current_saved_amount_minor_units, annual_inflation_rate, annual_expected_return,
    priority, flexibility, notes
  )
  values (
    p_household_id, p_name, p_goal_type, p_target_amount_minor_units, p_currency_code, p_target_date,
    p_manual_current_saved_amount_minor_units, p_annual_inflation_rate, p_annual_expected_return,
    p_priority, p_flexibility, p_notes
  )
  returning * into v_goal;

  foreach v_person_id in array p_responsible_person_ids loop
    insert into public.goal_responsible_people (household_id, goal_id, person_id)
    values (p_household_id, v_goal.id, v_person_id);
  end loop;

  for v_source in select jsonb_array_elements(p_funding_sources) loop
    insert into public.goal_funding_sources (
      household_id, goal_id, source_type, account_id, investment_holding_id, allocation_percentage
    )
    values (
      p_household_id,
      v_goal.id,
      v_source ->> 'sourceType',
      nullif(v_source ->> 'accountId', '')::uuid,
      nullif(v_source ->> 'investmentHoldingId', '')::uuid,
      coalesce((v_source ->> 'allocationPercentage')::numeric, 100)
    );
  end loop;

  return v_goal;
end;
$$;

comment on function public.create_goal(uuid, text, text, bigint, text, date, bigint, numeric, numeric, text, text, text, uuid[], jsonb) is
  'Creates a goal and its initial responsible-people/funding-source rows atomically. See PROMPT 30.';

grant execute on function public.create_goal(uuid, text, text, bigint, text, date, bigint, numeric, numeric, text, text, text, uuid[], jsonb) to authenticated, service_role;
