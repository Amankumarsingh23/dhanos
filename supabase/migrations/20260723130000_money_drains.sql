-- PROMPT 29 — Depreciating and money-draining items. A single register
-- (`money_drains`) for anything that quietly costs money over time and is
-- easy to lose track of: subscriptions, memberships, vehicles, unused
-- services, rented space, gadgets, maintenance-heavy assets, contractual
-- commitments, recurring fees — discriminated by `drain_type`.
--
-- This is deliberately a *tracking + analysis* register, not a second
-- ledger: it never writes its own transactions. Two existing structures
-- already do the real cash-movement work and this table optionally points
-- at them instead of duplicating them:
--   - `linked_recurring_rule_id` (-> recurring_rules) — "recurring expenses
--     remain connected to transactions" (PROMPT 29 acceptance criterion) is
--     satisfied by pointing at the real recurring_rules row that actually
--     generates/reconciles transactions, rather than inventing a second,
--     disconnected "recurring cost" concept. cost_amount_minor_units/
--     cost_frequency stay on this row as the household's own entered
--     estimate either way (a drain can exist with no linked rule at all —
--     a vehicle's fuel/insurance/service costs rarely map to one clean
--     recurring transaction), but a linked rule's real current amount and
--     last actual occurrence are what the analysis layer reads and labels
--     as "from your transactions," never blended silently with the
--     estimate — see src/features/money-drains/queries.ts.
--   - `linked_asset_id` (-> assets) — a depreciating asset (vehicle,
--     gadget) already has its own valuation history in
--     asset_valuation_snapshots; this table never stores a duplicate value
--     history, just current_value_minor_units as the household's own
--     latest-known figure for quick display, cross-checked against the
--     linked asset's real latest snapshot in the analysis layer when both
--     exist.
--
-- **"Estimated usage is visibly user-entered"** (PROMPT 29 acceptance
-- criterion): usage_frequency has no default — every row requires an
-- explicit choice — and the UI always renders it under a "Your estimate"
-- caption, never presented as measured/observed usage.
--
-- **"Do not automatically order the user to cancel anything"**: nothing in
-- this schema or its RPCs writes a cancellation/status change on the
-- household's behalf — `status` (active/paused/cancelled) is only ever
-- set by an explicit user action, and the analysis layer only surfaces
-- descriptive flags (unused, high-cost-low-use, upcoming renewal), never a
-- directive.

-- ---------------------------------------------------------------------------
-- 1. money_drains
-- ---------------------------------------------------------------------------

create table public.money_drains (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item text not null check (char_length(btrim(item)) > 0),
  drain_type text not null check (
    drain_type in (
      'subscription', 'membership', 'vehicle', 'unused_service', 'rented_space',
      'gadget', 'maintenance_heavy_asset', 'contractual_commitment', 'recurring_fee', 'other'
    )
  ),
  -- The household's own entered cost estimate — cross-validated against
  -- any linked_recurring_rule_id's real current amount by the application
  -- layer, never overwritten by it.
  cost_frequency text not null check (
    cost_frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time', 'irregular')
  ),
  cost_amount_minor_units bigint not null check (cost_amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  -- Only meaningful for a depreciating item (vehicle/gadget/maintenance-
  -- heavy asset) — null for a pure service (subscription/rented space)
  -- that has no resale value to speak of.
  current_value_minor_units bigint check (current_value_minor_units is null or current_value_minor_units >= 0),
  -- No default: PROMPT 29 "estimated usage is visibly user-entered" means
  -- every row requires an explicit choice, never a silently-assumed one.
  usage_frequency text not null check (
    usage_frequency in ('daily', 'weekly', 'monthly', 'occasionally', 'rarely', 'never')
  ),
  is_essential boolean not null default false,
  cancellation_terms text,
  next_renewal_date date,
  linked_account_id uuid references public.financial_accounts (id) on delete set null,
  linked_asset_id uuid references public.assets (id) on delete set null,
  linked_recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.money_drains is
  'Depreciating and money-draining items (PROMPT 29): subscriptions, memberships, vehicles, unused services, rented space, gadgets, maintenance-heavy assets, contractual commitments, recurring fees. A tracking/analysis register, not a second ledger — see linked_recurring_rule_id/linked_asset_id for how it stays connected to real transactions/valuations instead of duplicating them.';
comment on column public.money_drains.usage_frequency is
  'Always a household-entered estimate, never measured — PROMPT 29: "estimated usage is visibly user-entered." Rendered with a "Your estimate" caption everywhere it appears.';
comment on column public.money_drains.linked_recurring_rule_id is
  'Optional pointer to the recurring_rules row that actually generates/reconciles this item''s transactions — PROMPT 29: "recurring expenses remain connected to transactions." Null for a drain with no clean recurring transaction mapping (e.g. a vehicle''s variable running costs).';
comment on column public.money_drains.status is
  'active/paused/cancelled, only ever changed by an explicit user action — PROMPT 29: "do not automatically order the user to cancel anything." A cancelled item is never deleted, so its historical cost stays visible.';

create index money_drains_household_id_idx on public.money_drains (household_id);
create index money_drains_linked_account_id_idx on public.money_drains (linked_account_id);
create index money_drains_linked_asset_id_idx on public.money_drains (linked_asset_id);
create index money_drains_linked_recurring_rule_id_idx on public.money_drains (linked_recurring_rule_id);
create index money_drains_next_renewal_date_idx on public.money_drains (next_renewal_date);

create trigger set_updated_at
  before update on public.money_drains
  for each row
  execute function public.set_updated_at();

create function public.check_money_drain_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_asset_household uuid;
  v_rule_household uuid;
  v_rule_currency text;
begin
  if new.linked_account_id is not null then
    select household_id, currency_code into v_account_household, v_account_currency
    from public.financial_accounts where id = new.linked_account_id;

    if v_account_household is null or v_account_household <> new.household_id then
      raise exception 'money_drains.linked_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_account_currency then
      raise exception 'money_drains.currency_code must match linked_account_id''s currency';
    end if;
  end if;

  if new.linked_asset_id is not null then
    select household_id into v_asset_household
    from public.assets where id = new.linked_asset_id;

    if v_asset_household is null or v_asset_household <> new.household_id then
      raise exception 'money_drains.linked_asset_id must belong to the same household';
    end if;
  end if;

  if new.linked_recurring_rule_id is not null then
    select household_id, currency_code into v_rule_household, v_rule_currency
    from public.recurring_rules where id = new.linked_recurring_rule_id;

    if v_rule_household is null or v_rule_household <> new.household_id then
      raise exception 'money_drains.linked_recurring_rule_id must belong to the same household';
    end if;

    if new.currency_code <> v_rule_currency then
      raise exception 'money_drains.currency_code must match linked_recurring_rule_id''s currency';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_money_drain_consistency() is
  'Trigger: enforces money_drains.linked_account_id/linked_asset_id/linked_recurring_rule_id belong to the same household, and currency_code matches linked_account_id/linked_recurring_rule_id where set.';

create trigger check_money_drain_consistency
  before insert or update on public.money_drains
  for each row
  execute function public.check_money_drain_consistency();

alter table public.money_drains enable row level security;

create policy "members can view their household's money drains" on public.money_drains
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add money drains" on public.money_drains
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update money drains" on public.money_drains
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete money drains" on public.money_drains
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.money_drains to authenticated, service_role;
