-- PROMPT 25 — Insurance architecture. Policy management across 12 types
-- (health/term/life/vehicle/home/personal_accident/travel/business/
-- property/crop/device/other), with health-only fields kept nullable at
-- the schema layer and UI-gated — the same "nullable/usable regardless of
-- type, UI decides what to show" pattern PROMPT 21's education-loan fields
-- established on `loans`.
--
-- **"Renewal does not overwrite the old policy period"** (PROMPT 25
-- acceptance criterion) is `previous_policy_id`: renewing a policy never
-- edits the existing row — `create_insurance_policy` below always inserts
-- a brand-new row (linked back via `previous_policy_id`) and only ever
-- flips the *old* row's `status` to `'renewed'`, never touching any of its
-- period/coverage/premium data. Same "correction/change is a new row,
-- never an edit" idiom as `loan_payments.reverses_payment_id` and
-- `investment_valuation_snapshots`' append-only history — just applied to
-- a policy period instead of a payment or a valuation.
--
-- **"Premium payment creates a cash transaction"**: unlike loans/lending/
-- liabilities, a premium payment has no "outstanding principal" to pay
-- down — it is a plain, real household expense (buying protection), so it
-- is recorded as an ordinary `kind = 'expense'` transaction (categorized
-- under the household's existing `classification = 'protection'` category
-- — see `supabase/migrations/20260721090000_transaction_engine.sql`'s
-- seeded 'Insurance' category and PROMPT 15's dashboard, which already
-- reads "insurance premiums" as a subset of Expenses), linked back via the
-- new `transactions.insurance_policy_id` column — never a new dedicated
-- `transactions.kind`, and never a second append-only payments table: the
-- transactions table itself, filtered by `insurance_policy_id`, is already
-- the full premium-payment history.
--
-- **"Documents remain private"**: satisfied structurally by the existing
-- `attachments` table (private Storage bucket, household-scoped RLS,
-- signed-URL-only reads — see docs/security-model.md §5) — this migration
-- only grows `attachable_type` with an `'insurance_policy'` branch, same
-- "extend with a new branch" follow-up `financial_domain_model.md` §8
-- already anticipated for loans/insurance policies/assets.

-- ---------------------------------------------------------------------------
-- 1. insurance_policies
-- ---------------------------------------------------------------------------

create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  policy_type text not null check (
    policy_type in (
      'health', 'term', 'life', 'vehicle', 'home', 'personal_accident',
      'travel', 'business', 'property', 'crop', 'device', 'other'
    )
  ),
  name text not null check (char_length(btrim(name)) > 0),
  insurer_institution_id uuid not null references public.institutions (id) on delete restrict,
  policyholder_person_id uuid not null references public.people (id) on delete restrict,
  nominee_person_id uuid references public.people (id) on delete restrict,
  -- Entered already-masked by the household (e.g. "XXXX-4821") — this
  -- column is never the source of a full policy number, same "never store
  -- more than needed" reasoning as profiles.avatar_path being a storage
  -- path rather than the file itself.
  masked_policy_number text,
  coverage_amount_minor_units bigint not null check (coverage_amount_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  premium_amount_minor_units bigint not null check (premium_amount_minor_units > 0),
  premium_frequency text not null check (
    premium_frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'one_time')
  ),
  start_date date not null,
  renewal_date date check (renewal_date is null or renewal_date >= start_date),
  expiry_date date check (expiry_date is null or expiry_date >= start_date),
  status text not null default 'active' check (
    status in ('active', 'expired', 'lapsed', 'cancelled', 'renewed')
  ),
  agent_name text,
  agent_contact text,
  support_contact text,
  claim_contact text,
  notes text,
  -- Where premium payments are recorded from — required, same reasoning
  -- as loans.payment_account_id.
  payment_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  -- Self-reference forming the renewal chain — see the migration header
  -- comment above. Never set by an UPDATE, only by create_insurance_policy
  -- at insert time.
  previous_policy_id uuid references public.insurance_policies (id) on delete set null,
  -- Health-specific fields (PROMPT 25) — nullable and usable regardless of
  -- policy_type at the schema layer (the UI only collects/shows them for
  -- policy_type = 'health'), same convention as loans' education fields.
  -- "sum insured" is deliberately not a separate column — coverage_amount_minor_units
  -- above already is that figure for a health policy.
  deductible_minor_units bigint check (deductible_minor_units is null or deductible_minor_units >= 0),
  co_pay_percentage numeric check (co_pay_percentage is null or (co_pay_percentage >= 0 and co_pay_percentage <= 1)),
  room_rent_restriction text,
  pre_existing_conditions_declared text,
  waiting_periods text,
  network_hospital_notes text,
  cashless_availability boolean,
  restoration_benefit boolean,
  no_claim_bonus text,
  opd_cover boolean,
  consumables_cover boolean,
  pre_hospitalization_days integer check (pre_hospitalization_days is null or pre_hospitalization_days >= 0),
  post_hospitalization_days integer check (post_hospitalization_days is null or post_hospitalization_days >= 0),
  day_care_treatment boolean,
  exclusions_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.insurance_policies is
  'An insurance policy (PROMPT 25) — 12 types, health-specific fields nullable/UI-gated regardless of type. A renewal is always a new row (previous_policy_id linking back to the old one), never an edit — see create_insurance_policy. Entered data is a tracking summary, never a legal interpretation of the actual policy document.';
comment on column public.insurance_policies.previous_policy_id is
  'The policy row this one renewed, if any. Only ever set at insert time by create_insurance_policy — never backfilled onto an existing row, so a renewal can never retroactively rewrite what an earlier period looked like.';
comment on column public.insurance_policies.status is
  'active/expired/lapsed/cancelled are set manually; renewed is set automatically on the *old* row by create_insurance_policy when a new row supersedes it — never on the new row itself.';

create index insurance_policies_household_id_idx on public.insurance_policies (household_id);
create index insurance_policies_insurer_institution_id_idx on public.insurance_policies (insurer_institution_id);
create index insurance_policies_policyholder_person_id_idx on public.insurance_policies (policyholder_person_id);
create index insurance_policies_nominee_person_id_idx on public.insurance_policies (nominee_person_id);
create index insurance_policies_payment_account_id_idx on public.insurance_policies (payment_account_id);
create index insurance_policies_previous_policy_id_idx on public.insurance_policies (previous_policy_id);

create trigger set_updated_at
  before update on public.insurance_policies
  for each row
  execute function public.set_updated_at();

create function public.check_insurance_policy_consistency()
returns trigger
language plpgsql
as $$
declare
  v_account_household uuid;
  v_account_currency text;
  v_previous_household uuid;
begin
  select household_id, currency_code into v_account_household, v_account_currency
  from public.financial_accounts where id = new.payment_account_id;

  if v_account_household is null or v_account_household <> new.household_id then
    raise exception 'insurance_policies.payment_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'insurance_policies.currency_code must match payment_account_id''s currency';
  end if;

  if not exists (
    select 1 from public.institutions
    where id = new.insurer_institution_id and household_id = new.household_id
  ) then
    raise exception 'insurance_policies.insurer_institution_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.people
    where id = new.policyholder_person_id and household_id = new.household_id
  ) then
    raise exception 'insurance_policies.policyholder_person_id must belong to the same household';
  end if;

  if new.nominee_person_id is not null and not exists (
    select 1 from public.people
    where id = new.nominee_person_id and household_id = new.household_id
  ) then
    raise exception 'insurance_policies.nominee_person_id must belong to the same household';
  end if;

  if new.previous_policy_id is not null then
    select household_id into v_previous_household
    from public.insurance_policies where id = new.previous_policy_id;

    if v_previous_household is null or v_previous_household <> new.household_id then
      raise exception 'insurance_policies.previous_policy_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_insurance_policy_consistency() is
  'Trigger: enforces insurance_policies.payment_account_id/insurer_institution_id/policyholder_person_id/nominee_person_id/previous_policy_id belong to the same household, and currency_code matches payment_account_id''s currency.';

create trigger check_insurance_policy_consistency
  before insert or update on public.insurance_policies
  for each row
  execute function public.check_insurance_policy_consistency();

alter table public.insurance_policies enable row level security;

create policy "members can view their household's insurance policies" on public.insurance_policies
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add insurance policies" on public.insurance_policies
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update insurance policies" on public.insurance_policies
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete insurance policies" on public.insurance_policies
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.insurance_policies to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. insurance_policy_insured_people — the "multiple people can be insured
--    under one policy" join table (PROMPT 25 acceptance criterion). Always
--    written atomically alongside the policy by create_insurance_policy,
--    so a policy can never exist with a half-written insured-people list.
-- ---------------------------------------------------------------------------

create table public.insurance_policy_insured_people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (policy_id, person_id)
);

comment on table public.insurance_policy_insured_people is
  'Which people are covered under a policy — many-to-many, PROMPT 25: "multiple people can be insured under one policy." Always written atomically with the policy row via create_insurance_policy.';

create index insurance_policy_insured_people_household_id_idx on public.insurance_policy_insured_people (household_id);
create index insurance_policy_insured_people_policy_id_idx on public.insurance_policy_insured_people (policy_id);
create index insurance_policy_insured_people_person_id_idx on public.insurance_policy_insured_people (person_id);

create function public.check_insurance_insured_person_consistency()
returns trigger
language plpgsql
as $$
declare
  v_policy_household uuid;
begin
  select household_id into v_policy_household
  from public.insurance_policies where id = new.policy_id;

  if v_policy_household is null or v_policy_household <> new.household_id then
    raise exception 'insurance_policy_insured_people.policy_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.people
    where id = new.person_id and household_id = new.household_id
  ) then
    raise exception 'insurance_policy_insured_people.person_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_insurance_insured_person_consistency() is
  'Trigger: enforces insurance_policy_insured_people.policy_id/person_id belong to the same household.';

create trigger check_insurance_insured_person_consistency
  before insert or update on public.insurance_policy_insured_people
  for each row
  execute function public.check_insurance_insured_person_consistency();

alter table public.insurance_policy_insured_people enable row level security;

create policy "members can view their household's insured people" on public.insurance_policy_insured_people
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can manage insured people" on public.insurance_policy_insured_people
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can remove insured people" on public.insurance_policy_insured_people
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on public.insurance_policy_insured_people to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. transactions.insurance_policy_id — links a premium-payment expense
--    transaction back to the policy it belongs to. Deliberately only valid
--    for kind = 'expense' (never a new dedicated kind — see migration
--    header comment above).
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column insurance_policy_id uuid references public.insurance_policies (id) on delete set null;

comment on column public.transactions.insurance_policy_id is
  'The insurance_policies row this premium payment belongs to, if any — null for any other transaction. Only valid when kind = expense — see transactions_insurance_policy_id_requires_expense_kind. A premium payment is a real expense (categorized under the household''s protection-classification category), never a dedicated transaction kind. See PROMPT 25.';

create index transactions_insurance_policy_id_idx on public.transactions (insurance_policy_id);

alter table public.transactions
  add constraint transactions_insurance_policy_id_requires_expense_kind
  check (insurance_policy_id is null or kind = 'expense');

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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/lending/liability/insurance-policy/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. attachments.attachable_type grown to include 'insurance_policy' —
--    schema-ready for the "documents" field (PROMPT 25), same
--    "extend with a new branch" follow-up as PROMPT 23's 'lending' branch.
--    "Documents remain private" is already true structurally (household-
--    scoped RLS + private Storage bucket, see docs/security-model.md §5) —
--    this only makes the schema accept the new attachable_type.
-- ---------------------------------------------------------------------------

alter table public.attachments
  drop constraint attachments_attachable_type_check;

alter table public.attachments
  add constraint attachments_attachable_type_check
  check (attachable_type in ('financial_account', 'transaction', 'lending', 'insurance_policy'));

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
-- 5. create_insurance_policy() — inserts a policy and its insured-people
--    rows atomically. Also serves renewal: when p_previous_policy_id is
--    given, the *old* row's status is flipped to 'renewed' in the same
--    transaction — its own period/coverage/premium columns are never
--    touched (PROMPT 25: "renewal does not overwrite the old policy
--    period").
-- ---------------------------------------------------------------------------

create function public.create_insurance_policy(
  p_household_id uuid,
  p_policy_type text,
  p_name text,
  p_insurer_institution_id uuid,
  p_policyholder_person_id uuid,
  p_coverage_amount_minor_units bigint,
  p_currency_code text,
  p_premium_amount_minor_units bigint,
  p_premium_frequency text,
  p_start_date date,
  p_payment_account_id uuid,
  p_insured_person_ids uuid[] default array[]::uuid[],
  p_nominee_person_id uuid default null,
  p_masked_policy_number text default null,
  p_renewal_date date default null,
  p_expiry_date date default null,
  p_agent_name text default null,
  p_agent_contact text default null,
  p_support_contact text default null,
  p_claim_contact text default null,
  p_notes text default null,
  p_previous_policy_id uuid default null,
  p_deductible_minor_units bigint default null,
  p_co_pay_percentage numeric default null,
  p_room_rent_restriction text default null,
  p_pre_existing_conditions_declared text default null,
  p_waiting_periods text default null,
  p_network_hospital_notes text default null,
  p_cashless_availability boolean default null,
  p_restoration_benefit boolean default null,
  p_no_claim_bonus text default null,
  p_opd_cover boolean default null,
  p_consumables_cover boolean default null,
  p_pre_hospitalization_days integer default null,
  p_post_hospitalization_days integer default null,
  p_day_care_treatment boolean default null,
  p_exclusions_summary text default null
)
returns public.insurance_policies
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_policy public.insurance_policies;
  v_person_id uuid;
begin
  insert into public.insurance_policies (
    household_id, policy_type, name, insurer_institution_id, policyholder_person_id,
    nominee_person_id, masked_policy_number, coverage_amount_minor_units, currency_code,
    premium_amount_minor_units, premium_frequency, start_date, renewal_date, expiry_date,
    agent_name, agent_contact, support_contact, claim_contact, notes,
    payment_account_id, previous_policy_id,
    deductible_minor_units, co_pay_percentage, room_rent_restriction,
    pre_existing_conditions_declared, waiting_periods, network_hospital_notes,
    cashless_availability, restoration_benefit, no_claim_bonus, opd_cover,
    consumables_cover, pre_hospitalization_days, post_hospitalization_days,
    day_care_treatment, exclusions_summary
  )
  values (
    p_household_id, p_policy_type, p_name, p_insurer_institution_id, p_policyholder_person_id,
    p_nominee_person_id, p_masked_policy_number, p_coverage_amount_minor_units, p_currency_code,
    p_premium_amount_minor_units, p_premium_frequency, p_start_date, p_renewal_date, p_expiry_date,
    p_agent_name, p_agent_contact, p_support_contact, p_claim_contact, p_notes,
    p_payment_account_id, p_previous_policy_id,
    p_deductible_minor_units, p_co_pay_percentage, p_room_rent_restriction,
    p_pre_existing_conditions_declared, p_waiting_periods, p_network_hospital_notes,
    p_cashless_availability, p_restoration_benefit, p_no_claim_bonus, p_opd_cover,
    p_consumables_cover, p_pre_hospitalization_days, p_post_hospitalization_days,
    p_day_care_treatment, p_exclusions_summary
  )
  returning * into v_policy;

  foreach v_person_id in array p_insured_person_ids loop
    insert into public.insurance_policy_insured_people (household_id, policy_id, person_id)
    values (p_household_id, v_policy.id, v_person_id);
  end loop;

  if p_previous_policy_id is not null then
    update public.insurance_policies
    set status = 'renewed'
    where id = p_previous_policy_id and household_id = p_household_id;
  end if;

  return v_policy;
end;
$$;

comment on function public.create_insurance_policy(uuid, text, text, uuid, uuid, bigint, text, bigint, text, date, uuid, uuid[], uuid, text, date, date, text, text, text, text, text, uuid, bigint, numeric, text, text, text, text, boolean, boolean, text, boolean, boolean, integer, integer, boolean, text) is
  'Atomically creates an insurance policy and its insured-people rows. When p_previous_policy_id is given (a renewal), also flips that older row''s status to renewed in the same call — its period/coverage/premium data is never edited. See PROMPT 25.';

grant execute on function public.create_insurance_policy(uuid, text, text, uuid, uuid, bigint, text, bigint, text, date, uuid, uuid[], uuid, text, date, date, text, text, text, text, text, uuid, bigint, numeric, text, text, text, text, boolean, boolean, text, boolean, boolean, integer, integer, boolean, text) to authenticated, service_role;
