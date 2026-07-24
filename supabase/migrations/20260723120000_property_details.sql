-- PROMPT 28 — Property-specific records and richer valuations, extending
-- PROMPT 27's asset register. New columns follow the exact same
-- "nullable, usable regardless of type, UI-gated" convention loans'
-- education fields and insurance's health fields already established —
-- collected/shown only for asset_group = 'immovable', enforced at the UI
-- layer, never a database CHECK requiring them.
--
-- **"Do not store precise location publicly"**: `assets.location` (from
-- PROMPT 27) stays the general/approximate location, safe to show
-- anywhere. A new `location_precise` column holds the full address —
-- selected by the detail-page query only; the list-page query
-- (`ASSET_LIST_SELECT` in src/features/assets/queries.ts) deliberately
-- never fetches it at all, the same "sensitive field only ever leaves the
-- database for its own detail view" shape People's `birth_date`/`notes`
-- already use for the People list vs. edit dialog.
--
-- **"Unverified valuations are labeled estimates"**: `asset_valuation_snapshots`
-- (PROMPT 16-style append-only table, PROMPT 27) grows a required
-- `confidence` column, defaulting to `'unverified'` — every valuation
-- must say how sure it is, and the UI renders an "Estimate" badge for
-- anything short of `'verified'` (src/lib/calculations/assets.ts's
-- `isValuationConfidenceVerified`), never silently presenting an estimate
-- as a fact.
--
-- **"Income generated links to cash flow"**: `transactions` grows a
-- nullable `asset_id` (valid only for `kind = 'income'`), so recording
-- rental/asset income writes a real ledger transaction — never just a
-- free-text note — the same "money moves are real transactions, not
-- strings" rule this schema has followed since PROMPT 10.
--
-- **"Shared ownership affects net-worth inclusion"**: already true by
-- construction since PROMPT 27 — `assets.ownership_percentage` is always
-- applied by `computeNetWorthContributionMinorUnits`. This migration adds
-- no new mechanism for it, only a descriptive `ownership_share_notes`
-- column for documenting *how* a share was determined (a partition deed,
-- a family settlement) — the number itself stays the single source of
-- truth on `ownership_percentage`, never duplicated here.

-- ---------------------------------------------------------------------------
-- 1. assets — property-specific columns
-- ---------------------------------------------------------------------------

alter table public.assets
  add column property_type text check (
    property_type is null or property_type in (
      'residential_apartment', 'independent_house', 'plot', 'agricultural',
      'commercial_retail', 'commercial_office', 'industrial', 'other'
    )
  ),
  add column location_precise text,
  add column land_area numeric check (land_area is null or land_area > 0),
  add column area_unit text check (
    area_unit is null or area_unit in ('sqft', 'sqm', 'sqyd', 'acre', 'hectare', 'bigha', 'guntha', 'cent')
  ),
  add column ownership_share_notes text,
  add column title_status text check (
    title_status is null or title_status in ('clear', 'disputed', 'pending_verification', 'litigation', 'not_verified', 'other')
  ),
  add column mutation_status text check (
    mutation_status is null or mutation_status in ('mutated', 'pending', 'not_mutated', 'not_applicable')
  ),
  add column original_owner text,
  add column legal_heir_notes text,
  add column rental_status text check (
    rental_status is null or rental_status in ('vacant', 'self_occupied', 'rented', 'partially_rented', 'under_renovation')
  ),
  add column occupancy text check (
    occupancy is null or occupancy in ('owner_occupied', 'family_occupied', 'tenant_occupied', 'vacant', 'caretaker', 'other')
  ),
  add column encumbrance_status text check (
    encumbrance_status is null or encumbrance_status in ('none', 'mortgaged', 'lien', 'attached', 'other')
  ),
  add column encumbrance_notes text,
  add column dispute_status text check (
    dispute_status is null or dispute_status in ('none', 'boundary_dispute', 'litigation', 'family_dispute', 'other')
  ),
  add column registration_details text,
  add constraint assets_land_area_requires_unit check ((land_area is null) = (area_unit is null));

comment on column public.assets.location_precise is
  'The full/precise address — sensitive. Only ever selected by the asset detail-page query (getAssetDetail); the list-page query (listAssets) never fetches this column at all. See PROMPT 28: "do not store precise location publicly."';
comment on column public.assets.location is
  'The general/approximate location (e.g. city or locality) — safe to show in list views. See location_precise for the full address, detail-view only.';
comment on column public.assets.ownership_share_notes is
  'Descriptive notes on how ownership_percentage was determined (a partition deed, a family settlement) — never a second numeric share; ownership_percentage remains the single source of truth for net-worth computation. See PROMPT 28.';
comment on column public.assets.dispute_status is
  'A property-level legal dispute (e.g. a boundary dispute), independent of assets.ownership_status — a confirmed-owned property can still have an active dispute. See PROMPT 28.';

-- ---------------------------------------------------------------------------
-- 2. asset_valuation_snapshots — appraiser + confidence
-- ---------------------------------------------------------------------------

alter table public.asset_valuation_snapshots
  add column appraiser text,
  add column confidence text not null default 'unverified' check (
    confidence in ('verified', 'professional', 'informal_estimate', 'unverified')
  );

comment on column public.asset_valuation_snapshots.confidence is
  'How sure this figure is: verified (matches a registered/official source), professional (a paid appraisal, not necessarily registered), informal_estimate (a broker/household estimate with some basis), or unverified (a rough guess). Anything short of verified renders an "Estimate" badge everywhere this value is shown — PROMPT 28: "unverified valuations are labeled estimates."';
comment on column public.asset_valuation_snapshots.appraiser is
  'Who produced this valuation (a named appraiser or agency), if applicable — nullable, most meaningful alongside confidence = professional.';

-- ---------------------------------------------------------------------------
-- 3. transactions.asset_id — links an income transaction back to the
--    asset that generated it (rental income, etc.). Only valid for
--    kind = 'income' — never a new dedicated kind, since asset-generated
--    income really is ordinary household income, just attributable to a
--    specific asset. See PROMPT 28: "income generated links to cash flow."
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column asset_id uuid references public.assets (id) on delete set null;

comment on column public.transactions.asset_id is
  'The assets row this income transaction is attributable to (e.g. rental income), if any — null for any other transaction. Only valid when kind = income — see transactions_asset_id_requires_income_kind. See PROMPT 28.';

create index transactions_asset_id_idx on public.transactions (asset_id);

alter table public.transactions
  add constraint transactions_asset_id_requires_income_kind
  check (asset_id is null or kind = 'income');

create or replace function public.check_transaction_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_transfer_household uuid;
  v_transfer_currency text;
  v_reversed_household uuid;
  v_reversed_kind text;
  v_loan_household uuid;
  v_lending_household uuid;
  v_liability_household uuid;
  v_insurance_policy_household uuid;
  v_insurance_claim_household uuid;
  v_asset_household uuid;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'transactions.account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'transactions.currency_code must match account_id''s currency';
  end if;

  if new.transfer_account_id is not null then
    select household_id, currency_code into v_transfer_household, v_transfer_currency
    from public.financial_accounts where id = new.transfer_account_id;

    if v_transfer_household is null or v_transfer_household <> new.household_id then
      raise exception 'transactions.transfer_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_transfer_currency then
      raise exception 'transactions.currency_code must match transfer_account_id''s currency (v1: same-currency transfers only)';
    end if;
  end if;

  if new.category_id is not null and not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'transactions.category_id must belong to the same household';
  end if;

  if new.recurring_rule_id is not null and not exists (
    select 1 from public.recurring_rules
    where id = new.recurring_rule_id and household_id = new.household_id
  ) then
    raise exception 'transactions.recurring_rule_id must belong to the same household';
  end if;

  if new.related_person_id is not null and not exists (
    select 1 from public.people
    where id = new.related_person_id and household_id = new.household_id
  ) then
    raise exception 'transactions.related_person_id must belong to the same household';
  end if;

  if new.income_source_id is not null and not exists (
    select 1 from public.income_sources
    where id = new.income_source_id and household_id = new.household_id
  ) then
    raise exception 'transactions.income_source_id must belong to the same household';
  end if;

  if new.loan_id is not null then
    select household_id into v_loan_household
    from public.loans where id = new.loan_id;

    if v_loan_household is null or v_loan_household <> new.household_id then
      raise exception 'transactions.loan_id must belong to the same household';
    end if;
  end if;

  if new.lending_id is not null then
    select household_id into v_lending_household
    from public.lendings where id = new.lending_id;

    if v_lending_household is null or v_lending_household <> new.household_id then
      raise exception 'transactions.lending_id must belong to the same household';
    end if;
  end if;

  if new.liability_id is not null then
    select household_id into v_liability_household
    from public.liabilities where id = new.liability_id;

    if v_liability_household is null or v_liability_household <> new.household_id then
      raise exception 'transactions.liability_id must belong to the same household';
    end if;
  end if;

  if new.insurance_policy_id is not null then
    select household_id into v_insurance_policy_household
    from public.insurance_policies where id = new.insurance_policy_id;

    if v_insurance_policy_household is null or v_insurance_policy_household <> new.household_id then
      raise exception 'transactions.insurance_policy_id must belong to the same household';
    end if;
  end if;

  if new.insurance_claim_id is not null then
    select household_id into v_insurance_claim_household
    from public.insurance_claims where id = new.insurance_claim_id;

    if v_insurance_claim_household is null or v_insurance_claim_household <> new.household_id then
      raise exception 'transactions.insurance_claim_id must belong to the same household';
    end if;
  end if;

  if new.asset_id is not null then
    select household_id into v_asset_household
    from public.assets where id = new.asset_id;

    if v_asset_household is null or v_asset_household <> new.household_id then
      raise exception 'transactions.asset_id must belong to the same household';
    end if;
  end if;

  if new.reverses_transaction_id is not null then
    select household_id, kind into v_reversed_household, v_reversed_kind
    from public.transactions where id = new.reverses_transaction_id;

    if v_reversed_household is null or v_reversed_household <> new.household_id then
      raise exception 'transactions.reverses_transaction_id must belong to the same household';
    end if;

    if v_reversed_kind <> 'expense' then
      raise exception 'transactions.reverses_transaction_id must reference a kind = expense transaction';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_transaction_consistency() is
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/lending/liability/insurance-policy/insurance-claim/asset/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. create_asset() — drop and recreate with the new property parameters
--    appended (see docs/database-plan.md's "grown-parameters RPC" note:
--    Postgres treats an appended parameter list as a new overload, not a
--    true replacement, so the old signature must be dropped explicitly).
-- ---------------------------------------------------------------------------

drop function public.create_asset(
  uuid, text, text, text, uuid, numeric, text, text, date, text, text, bigint, date,
  bigint, text, text, boolean, text, uuid, boolean, text
);

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
  p_notes text default null,
  p_property_type text default null,
  p_location_precise text default null,
  p_land_area numeric default null,
  p_area_unit text default null,
  p_ownership_share_notes text default null,
  p_title_status text default null,
  p_mutation_status text default null,
  p_original_owner text default null,
  p_legal_heir_notes text default null,
  p_rental_status text default null,
  p_occupancy text default null,
  p_encumbrance_status text default null,
  p_encumbrance_notes text default null,
  p_dispute_status text default null,
  p_registration_details text default null,
  p_valuation_confidence text default 'unverified',
  p_valuation_appraiser text default null
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
    related_loan_id, include_in_net_worth, liquidity_classification, notes,
    property_type, location_precise, land_area, area_unit, ownership_share_notes,
    title_status, mutation_status, original_owner, legal_heir_notes, rental_status,
    occupancy, encumbrance_status, encumbrance_notes, dispute_status, registration_details
  )
  values (
    p_household_id, p_name, p_asset_group, p_category, p_owner_person_id, p_ownership_percentage,
    p_ownership_status, p_acquisition_type, p_acquisition_date, p_acquisition_value_minor_units,
    p_currency_code, p_location, p_condition, p_generates_income, p_income_notes,
    p_related_loan_id, p_include_in_net_worth, p_liquidity_classification, p_notes,
    p_property_type, p_location_precise, p_land_area, p_area_unit, p_ownership_share_notes,
    p_title_status, p_mutation_status, p_original_owner, p_legal_heir_notes, p_rental_status,
    p_occupancy, p_encumbrance_status, p_encumbrance_notes, p_dispute_status, p_registration_details
  )
  returning * into v_asset;

  insert into public.asset_valuation_snapshots (
    household_id, asset_id, as_of_date, value_minor_units, currency_code, source, confidence, appraiser
  )
  values (
    p_household_id, v_asset.id, p_valuation_date, p_estimated_value_minor_units, p_currency_code,
    'manual', p_valuation_confidence, p_valuation_appraiser
  );

  return v_asset;
end;
$$;

comment on function public.create_asset(
  uuid, text, text, text, uuid, numeric, text, text, date, text, text, bigint, date,
  bigint, text, text, boolean, text, uuid, boolean, text,
  text, text, numeric, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) is
  'Atomically creates an asset (including PROMPT 28''s property-specific fields) and its first valuation snapshot (source = manual, confidence/appraiser as given). See PROMPT 27, PROMPT 28.';

grant execute on function public.create_asset(
  uuid, text, text, text, uuid, numeric, text, text, date, text, text, bigint, date,
  bigint, text, text, boolean, text, uuid, boolean, text,
  text, text, numeric, text, text, text, text, text, text, text, text, text, text, text, text,
  text, text
) to authenticated, service_role;
