-- PROMPT 20 — Financial calculators. calculator_scenarios stores a
-- household's explicitly-saved "what if" runs (SIP projection, lump sum,
-- daily growth, EMI, loan prepayment, goal funding) — never written
-- automatically. Both the inputs that produced a scenario and the outputs
-- it showed at save time are frozen into the row (jsonb), so reopening a
-- saved scenario later always reflects exactly what the household saw and
-- decided to keep, never a silently different number from a later formula
-- change. linked_account_id is optional — set only when the calculator run
-- was seeded from a real account balance ("account-linked calculators");
-- most scenarios are standalone (null).

create table public.calculator_scenarios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  calculator_type text not null check (
    calculator_type in (
      'sip_projection', 'lump_sum', 'daily_growth', 'emi', 'loan_prepayment', 'goal_funding'
    )
  ),
  name text not null check (char_length(btrim(name)) > 0),
  -- The exact form values the household entered, keyed by field name.
  inputs jsonb not null default '{}'::jsonb,
  -- A snapshot of the computed result at save time — never recomputed in
  -- place from a possibly-changed formula (docs/money-calculation-rules.md
  -- §3's "do not overwrite historical records" spirit, applied to a
  -- calculator's own frozen output).
  outputs jsonb not null default '{}'::jsonb,
  linked_account_id uuid references public.financial_accounts (id) on delete set null,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.calculator_scenarios is
  'A household''s explicitly-saved financial-calculator scenario — inputs and the outputs they produced, frozen at save time. Never written automatically; see PROMPT 20 "Do not save a scenario unless user explicitly chooses Save."';
comment on column public.calculator_scenarios.linked_account_id is
  'Set only when this scenario was seeded from a real account''s balance (account-linked calculator use) — null for a fully standalone what-if run.';

create index calculator_scenarios_household_id_idx on public.calculator_scenarios (household_id);
create index calculator_scenarios_linked_account_id_idx on public.calculator_scenarios (linked_account_id);

create trigger set_updated_at
  before update on public.calculator_scenarios
  for each row
  execute function public.set_updated_at();

create function public.check_calculator_scenario_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.linked_account_id is not null and not exists (
    select 1 from public.financial_accounts
    where id = new.linked_account_id and household_id = new.household_id
  ) then
    raise exception 'calculator_scenarios.linked_account_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_calculator_scenario_consistency() is
  'Trigger: enforces calculator_scenarios.linked_account_id belongs to the same household as the scenario.';

create trigger check_calculator_scenario_consistency
  before insert or update on public.calculator_scenarios
  for each row
  execute function public.check_calculator_scenario_consistency();

alter table public.calculator_scenarios enable row level security;

create policy "members can view their household's calculator scenarios" on public.calculator_scenarios
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can save calculator scenarios" on public.calculator_scenarios
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update calculator scenarios" on public.calculator_scenarios
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete calculator scenarios" on public.calculator_scenarios
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.calculator_scenarios to authenticated, service_role;
