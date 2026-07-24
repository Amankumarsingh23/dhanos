-- PROMPT 31 — Emergency fund planner. Unlike Goals (PROMPT 30), this is a
-- single, focused planner: exactly one plan per household, expressing
-- "how many months of essential burn rate should we be able to survive on
-- liquid money alone" — never a growth projection, never assuming any
-- investment return.
--
-- **"Included assets are transparent" / "user can override inclusion"**
-- (PROMPT 31 acceptance criteria): `emergency_fund_source_overrides` below
-- never replaces the structural default classification — every qualifying
-- financial_accounts/investment_holdings row is always shown with its own
-- computed default (see src/lib/calculations/emergency-fund.ts's
-- classifyAccountLiquidity, and portfolio-performance.ts's existing
-- classifyLiquidity, reused unchanged for investments) and an explicit
-- reason; an override row only ever exists when the household has
-- deliberately flipped a source's inclusion away from that default.
--
-- **"Do not count" list is satisfied structurally, not by special-casing**:
--   - illiquid property — the `assets` table is never queried by this
--     feature at all.
--   - locked retirement money by default — provident_fund/pension account
--     types and ppf/epf/nps/fixed_deposit asset classes default to
--     excluded (classifyAccountLiquidity / classifyLiquidity), but remain
--     overridable, matching the prompt's own "by default" wording.
--   - disputed receivables — `lendings` is never queried by this feature.
--   - unavailable credit limits — financial_accounts.account_type in
--     ('loan', 'credit') is never even offered as a candidate (a credit
--     line is a liability, not liquid money — the one case with no
--     override, since it's not owned money at all).
--   - uncertain inherited assets — same as illiquid property; `assets` is
--     never queried here.

-- ---------------------------------------------------------------------------
-- 1. emergency_fund_plans — a singleton per household.
-- ---------------------------------------------------------------------------

create table public.emergency_fund_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- User-selected — never inferred. A suggested starting point based on
  -- dependants_count is offered in the UI, but this column always holds
  -- whatever the household actually chose.
  coverage_target_months numeric not null default 6 check (coverage_target_months > 0),
  dependants_count integer not null default 0 check (dependants_count >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id)
);

comment on table public.emergency_fund_plans is
  'One emergency-fund plan per household (PROMPT 31) — coverage target (months) and dependants count are the only stored inputs; average essential expenses, monthly EMIs, and insurance commitments are always derived fresh from real data (Expenses/Loans/Insurance), never duplicated here. See src/lib/calculations/emergency-fund.ts for the coverage math.';

create trigger set_updated_at
  before update on public.emergency_fund_plans
  for each row
  execute function public.set_updated_at();

alter table public.emergency_fund_plans enable row level security;

create policy "members can view their household's emergency fund plan" on public.emergency_fund_plans
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can save the emergency fund plan" on public.emergency_fund_plans
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update the emergency fund plan" on public.emergency_fund_plans
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update on public.emergency_fund_plans to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. emergency_fund_source_overrides — a household's explicit deviation
--    from the structural default classification, per real
--    financial_accounts/investment_holdings row.
-- ---------------------------------------------------------------------------

create table public.emergency_fund_source_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  emergency_fund_plan_id uuid not null references public.emergency_fund_plans (id) on delete cascade,
  source_type text not null check (source_type in ('account', 'investment_holding')),
  -- Cascades on delete (unlike goal_funding_sources' on delete restrict) —
  -- this is a UI preference, not a financial history record, so it should
  -- simply vanish along with the source it refers to.
  account_id uuid references public.financial_accounts (id) on delete cascade,
  investment_holding_id uuid references public.investment_holdings (id) on delete cascade,
  is_included boolean not null,
  created_at timestamptz not null default now(),
  constraint emergency_fund_source_overrides_type_matches_reference check (
    (source_type = 'account' and account_id is not null and investment_holding_id is null)
    or
    (source_type = 'investment_holding' and investment_holding_id is not null and account_id is null)
  )
);

comment on table public.emergency_fund_source_overrides is
  'A household''s explicit override of one source''s default include/exclude classification (PROMPT 31: "user can override inclusion"). Absence of a row means the structural default (classifyAccountLiquidity / classifyLiquidity) applies — this table only ever stores deviations, never a full copy of every source''s state.';

create index emergency_fund_source_overrides_household_id_idx on public.emergency_fund_source_overrides (household_id);
create index emergency_fund_source_overrides_plan_id_idx on public.emergency_fund_source_overrides (emergency_fund_plan_id);

create unique index emergency_fund_source_overrides_plan_account_uidx
  on public.emergency_fund_source_overrides (emergency_fund_plan_id, account_id)
  where account_id is not null;
create unique index emergency_fund_source_overrides_plan_holding_uidx
  on public.emergency_fund_source_overrides (emergency_fund_plan_id, investment_holding_id)
  where investment_holding_id is not null;

create function public.check_emergency_fund_source_override_consistency()
returns trigger
language plpgsql
as $$
declare
  v_plan_household uuid;
  v_account_household uuid;
  v_holding_household uuid;
begin
  select household_id into v_plan_household
  from public.emergency_fund_plans where id = new.emergency_fund_plan_id;
  if v_plan_household is null or v_plan_household <> new.household_id then
    raise exception 'emergency_fund_source_overrides.emergency_fund_plan_id must belong to the same household';
  end if;

  if new.account_id is not null then
    select household_id into v_account_household
    from public.financial_accounts where id = new.account_id;
    if v_account_household is null or v_account_household <> new.household_id then
      raise exception 'emergency_fund_source_overrides.account_id must belong to the same household';
    end if;
  end if;

  if new.investment_holding_id is not null then
    select household_id into v_holding_household
    from public.investment_holdings where id = new.investment_holding_id;
    if v_holding_household is null or v_holding_household <> new.household_id then
      raise exception 'emergency_fund_source_overrides.investment_holding_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_emergency_fund_source_override_consistency
  before insert on public.emergency_fund_source_overrides
  for each row
  execute function public.check_emergency_fund_source_override_consistency();

alter table public.emergency_fund_source_overrides enable row level security;

create policy "members can view their household's emergency fund overrides" on public.emergency_fund_source_overrides
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add emergency fund overrides" on public.emergency_fund_source_overrides
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can remove emergency fund overrides" on public.emergency_fund_source_overrides
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on public.emergency_fund_source_overrides to authenticated, service_role;
