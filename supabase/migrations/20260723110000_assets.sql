-- PROMPT 27 — Asset register. Movable, immovable, and business assets in
-- one table, discriminated by asset_group (category cross-validated
-- against it, same "one shared table, cross-validated category" idiom as
-- liabilities' liability_source/category — see
-- supabase/migrations/20260722170000_liabilities.sql).
--
-- **"Asset values use snapshots"** (PROMPT 27 acceptance criterion):
-- `assets` itself carries no current-value column at all — same
-- "no quantity/value column at all" shape as `investment_holdings` — only
-- `acquisition_value_minor_units` (a static historical fact). Current/
-- estimated value always comes from the latest row in the new append-only
-- `asset_valuation_snapshots` table, exactly mirroring
-- `investment_valuation_snapshots` (PROMPT 16). `create_asset()` below
-- atomically writes the asset row and its first valuation snapshot from
-- the "estimated current value"/"valuation date" fields collected at
-- creation time; every later re-valuation is a new snapshot via
-- `record_asset_valuation()` — never an edit of the asset row or an
-- existing snapshot.
--
-- **"Ownership percentages are supported"**: `ownership_percentage`
-- (0, 100], always applied when computing this household's owned share of
-- an asset's value — see src/lib/calculations/assets.ts.
--
-- **"Disputed or expected property is not presented as fully owned"**:
-- `ownership_status` includes `disputed`/`expected` — computed net-worth
-- contribution is always 0 for those two statuses regardless of
-- `include_in_net_worth`, enforced in application code
-- (computeNetWorthContributionMinorUnits) since a per-row exclusion rule
-- like this doesn't need a database constraint to be reliable, only a
-- single, always-used pure function.
--
-- **"Attached debt remains separate"**: `related_loan_id` is a plain,
-- nullable, optional cross-reference to `loans` — an asset's value and a
-- linked loan's outstanding (`src/lib/calculations/loan-outstanding.ts`,
-- reused as-is) are always two distinct figures shown side by side, never
-- netted into one stored or computed "equity" value.

-- ---------------------------------------------------------------------------
-- 1. assets
-- ---------------------------------------------------------------------------

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  asset_group text not null check (asset_group in ('movable', 'immovable', 'business')),
  -- Cross-validated against asset_group below (assets_category_matches_group)
  -- rather than a single shared enum — 'machinery'/'equipment' deliberately
  -- appear in both the movable and business lists (PROMPT 27's own
  -- category lists), disambiguated by asset_group, not by the category
  -- string alone.
  category text not null check (
    category in (
      'vehicle', 'machinery', 'jewellery', 'gold', 'laptop', 'phone', 'furniture', 'equipment', 'collectible',
      'land', 'house', 'shop', 'commercial_property', 'agricultural_land',
      'inventory', 'ownership_interest', 'intellectual_property'
    )
  ),
  owner_person_id uuid not null references public.people (id) on delete restrict,
  ownership_percentage numeric not null default 100 check (ownership_percentage > 0 and ownership_percentage <= 100),
  ownership_status text not null default 'confirmed' check (
    ownership_status in (
      'confirmed', 'shared', 'transfer_pending', 'documentation_incomplete', 'disputed', 'expected', 'unknown'
    )
  ),
  acquisition_type text not null check (
    acquisition_type in ('purchased', 'inherited', 'gifted', 'jointly_owned', 'expected_inheritance', 'other')
  ),
  acquisition_date date not null,
  -- Nullable: an inherited/gifted/expected-inheritance asset often has no
  -- known acquisition cost — schema stays permissive, UI decides what to
  -- collect per acquisition_type (same convention as loans' education
  -- fields / insurance's health fields).
  acquisition_value_minor_units bigint check (acquisition_value_minor_units is null or acquisition_value_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  location text,
  condition text,
  generates_income boolean not null default false,
  income_notes text,
  -- Optional cross-reference to an attached loan (a vehicle/home loan)
  -- financing this asset — see migration header, "attached debt remains
  -- separate." ON DELETE SET NULL: a loan record's own lifecycle is
  -- independent of any asset that happens to reference it.
  related_loan_id uuid references public.loans (id) on delete set null,
  include_in_net_worth boolean not null default true,
  liquidity_classification text not null check (liquidity_classification in ('liquid', 'semi_liquid', 'illiquid')),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_category_matches_group check (
    (asset_group = 'movable' and category in (
      'vehicle', 'machinery', 'jewellery', 'gold', 'laptop', 'phone', 'furniture', 'equipment', 'collectible'
    ))
    or
    (asset_group = 'immovable' and category in (
      'land', 'house', 'shop', 'commercial_property', 'agricultural_land'
    ))
    or
    (asset_group = 'business' and category in (
      'machinery', 'inventory', 'ownership_interest', 'intellectual_property', 'equipment'
    ))
  )
);

comment on table public.assets is
  'A movable, immovable, or business asset (PROMPT 27), discriminated by asset_group (category cross-validated against it). Carries no current-value column — see asset_valuation_snapshots below. A renewed/corrected value is always a new snapshot, never an edit of this row.';
comment on column public.assets.ownership_percentage is
  'This household''s owned share of the asset, (0, 100] — always applied when computing owned value, never assumed to be 100. See src/lib/calculations/assets.ts.';
comment on column public.assets.ownership_status is
  'confirmed/shared/transfer_pending/documentation_incomplete/unknown are informational. disputed and expected specifically mean this asset is never counted toward net worth regardless of include_in_net_worth — PROMPT 27: "disputed or expected property is not presented as fully owned."';
comment on column public.assets.related_loan_id is
  'An optional financing loan for this asset (e.g. a vehicle/home loan). Its outstanding balance is always computed independently (src/lib/calculations/loan-outstanding.ts) and shown separately — never netted into this asset''s own value. See PROMPT 27: "attached debt remains separate."';

create index assets_household_id_idx on public.assets (household_id);
create index assets_owner_person_id_idx on public.assets (owner_person_id);
create index assets_related_loan_id_idx on public.assets (related_loan_id);
create index assets_asset_group_idx on public.assets (household_id, asset_group);

create trigger set_updated_at
  before update on public.assets
  for each row
  execute function public.set_updated_at();

create function public.check_asset_consistency()
returns trigger
language plpgsql
as $$
declare
  v_owner_household uuid;
  v_loan_household uuid;
begin
  if not exists (
    select 1 from public.people
    where id = new.owner_person_id and household_id = new.household_id
  ) then
    raise exception 'assets.owner_person_id must belong to the same household';
  end if;

  if new.related_loan_id is not null then
    select household_id into v_loan_household
    from public.loans where id = new.related_loan_id;

    if v_loan_household is null or v_loan_household <> new.household_id then
      raise exception 'assets.related_loan_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_asset_consistency() is
  'Trigger: enforces assets.owner_person_id/related_loan_id belong to the same household.';

create trigger check_asset_consistency
  before insert or update on public.assets
  for each row
  execute function public.check_asset_consistency();

alter table public.assets enable row level security;

create policy "members can view their household's assets" on public.assets
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add assets" on public.assets
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update assets" on public.assets
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete assets" on public.assets
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.assets to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. asset_valuation_snapshots — append-only, mirrors
--    investment_valuation_snapshots exactly (see migration header).
-- ---------------------------------------------------------------------------

create table public.asset_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- CASCADE: append-only history that's meaningless without its parent
  -- asset — same convention as investment_valuation_snapshots.investment_holding_id.
  asset_id uuid not null references public.assets (id) on delete cascade,
  as_of_date date not null,
  value_minor_units bigint not null check (value_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  source text not null check (
    source in ('manual', 'appraisal', 'market_estimate', 'purchase_price', 'other')
  ),
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, as_of_date, source)
);

comment on table public.asset_valuation_snapshots is
  'Append-only, dated value per assets row (PROMPT 27). Never updated in place — a correction is a new snapshot for a later as_of_date. See docs/money-calculation-rules.md §3.';
comment on column public.asset_valuation_snapshots.source is
  'How this figure was produced: manual (household''s own estimate), appraisal (professional valuation), market_estimate (comparable market research), purchase_price (the acquisition value itself, typically the first snapshot), or other.';

create index asset_valuation_snapshots_household_id_idx on public.asset_valuation_snapshots (household_id);
create index asset_valuation_snapshots_asset_id_idx on public.asset_valuation_snapshots (asset_id);

create function public.check_asset_valuation_snapshot_consistency()
returns trigger
language plpgsql
as $$
declare
  v_asset_household uuid;
  v_asset_currency text;
begin
  select household_id, currency_code into v_asset_household, v_asset_currency
  from public.assets where id = new.asset_id;

  if v_asset_household is null or v_asset_household <> new.household_id then
    raise exception 'asset_valuation_snapshots.asset_id must belong to the same household';
  end if;

  if new.currency_code <> v_asset_currency then
    raise exception 'asset_valuation_snapshots.currency_code must match the asset''s currency';
  end if;

  return new;
end;
$$;

comment on function public.check_asset_valuation_snapshot_consistency() is
  'Trigger: rejects an asset_valuation_snapshots row whose asset_id belongs to a different household, or whose currency_code does not match the asset''s currency.';

create trigger check_asset_valuation_snapshot_consistency
  before insert on public.asset_valuation_snapshots
  for each row
  execute function public.check_asset_valuation_snapshot_consistency();

alter table public.asset_valuation_snapshots enable row level security;

create policy "members can view their household's asset valuations" on public.asset_valuation_snapshots
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all — a correction
-- is a new snapshot for a later as_of_date.
create policy "owners, admins, and editors can record an asset valuation" on public.asset_valuation_snapshots
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert on public.asset_valuation_snapshots to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. attachments.attachable_type grown to include 'asset' — "documents"
--    (PROMPT 27 field list), paired with a real upload widget in the UI
--    (src/features/assets/asset-dialog.tsx), same as PROMPT 26's
--    'insurance_claim' branch.
-- ---------------------------------------------------------------------------

alter table public.attachments
  drop constraint attachments_attachable_type_check;

alter table public.attachments
  add constraint attachments_attachable_type_check
  check (attachable_type in ('financial_account', 'transaction', 'lending', 'insurance_policy', 'insurance_claim', 'asset'));

create or replace function public.check_attachment_target()
returns trigger
language plpgsql
as $$
begin
  if new.attachable_type = 'financial_account' then
    if not exists (
      select 1 from public.financial_accounts
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a financial_accounts row in the same household';
    end if;
  elsif new.attachable_type = 'transaction' then
    if not exists (
      select 1 from public.transactions
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a transactions row in the same household';
    end if;
  elsif new.attachable_type = 'lending' then
    if not exists (
      select 1 from public.lendings
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference a lendings row in the same household';
    end if;
  elsif new.attachable_type = 'insurance_policy' then
    if not exists (
      select 1 from public.insurance_policies
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference an insurance_policies row in the same household';
    end if;
  elsif new.attachable_type = 'insurance_claim' then
    if not exists (
      select 1 from public.insurance_claims
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference an insurance_claims row in the same household';
    end if;
  elsif new.attachable_type = 'asset' then
    if not exists (
      select 1 from public.assets
      where id = new.attachable_id and household_id = new.household_id
    ) then
      raise exception 'attachments.attachable_id must reference an assets row in the same household';
    end if;
  else
    -- Unreachable given the attachable_type CHECK constraint; guards
    -- against the check and this trigger drifting apart in a future edit.
    raise exception 'unsupported attachments.attachable_type: %', new.attachable_type;
  end if;

  return new;
end;
$$;

comment on function public.check_attachment_target() is
  'Trigger: validates attachments.attachable_id exists in the table named by attachable_type and belongs to the same household. Extend with a new branch when a new attachable_type is added.';

-- ---------------------------------------------------------------------------
-- 4. create_asset() — inserts an asset and its first valuation snapshot
--    atomically, from the "estimated current value"/"valuation date"
--    fields collected at creation time (source = 'manual'). Mirrors
--    create_insurance_policy's "atomically write parent + first related
--    row" shape.
-- ---------------------------------------------------------------------------

create function public.create_asset(
  p_household_id uuid,
  p_name text,
  p_asset_group text,
  p_category text,
  p_owner_person_id uuid,
  p_ownership_percentage numeric,
  p_ownership_status text,
  p_acquisition_type text,
  p_acquisition_date date,
  p_currency_code text,
  p_liquidity_classification text,
  p_estimated_value_minor_units bigint,
  p_valuation_date date,
  p_acquisition_value_minor_units bigint default null,
  p_location text default null,
  p_condition text default null,
  p_generates_income boolean default false,
  p_income_notes text default null,
  p_related_loan_id uuid default null,
  p_include_in_net_worth boolean default true,
  p_notes text default null
)
returns public.assets
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_asset public.assets;
begin
  insert into public.assets (
    household_id, name, asset_group, category, owner_person_id, ownership_percentage,
    ownership_status, acquisition_type, acquisition_date, acquisition_value_minor_units,
    currency_code, location, condition, generates_income, income_notes,
    related_loan_id, include_in_net_worth, liquidity_classification, notes
  )
  values (
    p_household_id, p_name, p_asset_group, p_category, p_owner_person_id, p_ownership_percentage,
    p_ownership_status, p_acquisition_type, p_acquisition_date, p_acquisition_value_minor_units,
    p_currency_code, p_location, p_condition, p_generates_income, p_income_notes,
    p_related_loan_id, p_include_in_net_worth, p_liquidity_classification, p_notes
  )
  returning * into v_asset;

  insert into public.asset_valuation_snapshots (
    household_id, asset_id, as_of_date, value_minor_units, currency_code, source
  )
  values (
    p_household_id, v_asset.id, p_valuation_date, p_estimated_value_minor_units, p_currency_code, 'manual'
  );

  return v_asset;
end;
$$;

comment on function public.create_asset(uuid, text, text, text, uuid, numeric, text, text, date, text, text, bigint, date, bigint, text, text, boolean, text, uuid, boolean, text) is
  'Atomically creates an asset and its first valuation snapshot (source = manual). See PROMPT 27.';

grant execute on function public.create_asset(uuid, text, text, text, uuid, numeric, text, text, date, text, text, bigint, date, bigint, text, text, boolean, text, uuid, boolean, text) to authenticated, service_role;
