-- PROMPT 26 — Insurance dashboard and claims. Adds claim records against an
-- existing insurance_policies row, plus structured (dated) waiting-period
-- tracking to replace the freeform waiting_periods text as a source of
-- "milestone" dates on the dashboard.
--
-- **"Claim payment is not treated as normal income unless reporting
-- deliberately categorizes it"** (PROMPT 26 acceptance criterion): a claim
-- settlement is recorded as its own transaction kind,
-- `insurance_claim_settlement` — never `income` — the same "structurally
-- never income" idiom `loan_disbursement`/`lending_repayment` already
-- established (see supabase/migrations/20260722150000_loans.sql,
-- 20260722160000_lending.sql). `public.cash_flow_transactions` stays
-- `kind in ('income', 'expense')` unchanged, so the new kind is excluded
-- from every income figure by construction, with zero changes required
-- there.
--
-- **"Policy history remains intact"**: `insurance_claims.policy_id` uses
-- `on delete restrict` (unlike `insurance_policy_insured_people`'s
-- `on delete cascade`) — a policy with claims filed against it can never be
-- hard-deleted out from under its own claim history.
--
-- **"Claim documents are authorized"**: satisfied the same structural way
-- as PROMPT 25's "documents remain private" — `attachments.attachable_type`
-- grows an `'insurance_claim'` branch (private Storage bucket,
-- household-scoped RLS, signed-URL-only reads). Unlike PROMPT 25, this
-- prompt's own claim field list explicitly asks for "documents" as a first
-- -class part of filing a claim, so this migration is paired with a real
-- upload widget in the UI (see src/features/insurance/claim-dialog.tsx),
-- not left schema-only.

-- ---------------------------------------------------------------------------
-- 1. insurance_claims
-- ---------------------------------------------------------------------------

create table public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  insured_person_id uuid not null references public.people (id) on delete restrict,
  incident_date date not null,
  claim_date date not null check (claim_date >= incident_date),
  claimed_amount_minor_units bigint not null check (claimed_amount_minor_units > 0),
  approved_amount_minor_units bigint check (approved_amount_minor_units is null or approved_amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'preparing' check (
    status in (
      'preparing', 'submitted', 'information_requested', 'approved',
      'partially_approved', 'rejected', 'paid', 'closed'
    )
  ),
  hospital_provider text,
  reference_number text,
  notes text,
  -- Settlement fields — only ever written together, atomically, by
  -- record_insurance_claim_settlement() below, never by a plain UPDATE.
  -- See insurance_claims_settlement_shape.
  settled_amount_minor_units bigint check (settled_amount_minor_units is null or settled_amount_minor_units >= 0),
  settled_date date,
  settled_account_id uuid references public.financial_accounts (id) on delete restrict,
  settlement_transaction_id uuid references public.transactions (id) on delete restrict,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_claims_settlement_shape check (
    (
      status = 'paid'
      and settled_amount_minor_units is not null
      and settled_date is not null
      and settled_account_id is not null
      and settlement_transaction_id is not null
    ) or (
      status <> 'paid'
      and settled_amount_minor_units is null
      and settled_date is null
      and settled_account_id is null
      and settlement_transaction_id is null
    )
  )
);

comment on table public.insurance_claims is
  'A claim filed against an insurance_policies row (PROMPT 26). status = paid is only ever set by record_insurance_claim_settlement(), atomically alongside the settled_*/settlement_transaction_id fields and the real kind = insurance_claim_settlement transaction — never a bare status UPDATE. policy_id is ON DELETE RESTRICT so a policy with claim history can never be hard-deleted out from under it.';
comment on column public.insurance_claims.status is
  'preparing/submitted/information_requested/approved/partially_approved/rejected/closed are set manually via setClaimStatusAction. paid is set automatically, only by record_insurance_claim_settlement().';
comment on column public.insurance_claims.approved_amount_minor_units is
  'The insurer''s approved amount, if decided — may differ from both claimed_amount_minor_units and the eventually-settled amount (e.g. a co-pay or deductible deduction applied at payout).';

create index insurance_claims_household_id_idx on public.insurance_claims (household_id);
create index insurance_claims_policy_id_idx on public.insurance_claims (policy_id);
create index insurance_claims_insured_person_id_idx on public.insurance_claims (insured_person_id);
create index insurance_claims_settled_account_id_idx on public.insurance_claims (settled_account_id);
create index insurance_claims_settlement_transaction_id_idx on public.insurance_claims (settlement_transaction_id);
create index insurance_claims_status_idx on public.insurance_claims (household_id, status);

create trigger set_updated_at
  before update on public.insurance_claims
  for each row
  execute function public.set_updated_at();

create function public.check_insurance_claim_consistency()
returns trigger
language plpgsql
as $$
declare
  v_policy_household uuid;
  v_policy_currency text;
begin
  select household_id, currency_code into v_policy_household, v_policy_currency
  from public.insurance_policies where id = new.policy_id;

  if v_policy_household is null or v_policy_household <> new.household_id then
    raise exception 'insurance_claims.policy_id must belong to the same household';
  end if;

  if new.currency_code <> v_policy_currency then
    raise exception 'insurance_claims.currency_code must match policy_id''s currency';
  end if;

  if not exists (
    select 1 from public.people
    where id = new.insured_person_id and household_id = new.household_id
  ) then
    raise exception 'insurance_claims.insured_person_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.insurance_policy_insured_people
    where policy_id = new.policy_id and person_id = new.insured_person_id
  ) then
    raise exception 'insurance_claims.insured_person_id must be one of policy_id''s insured people';
  end if;

  if new.settled_account_id is not null and not exists (
    select 1 from public.financial_accounts
    where id = new.settled_account_id and household_id = new.household_id
  ) then
    raise exception 'insurance_claims.settled_account_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_insurance_claim_consistency() is
  'Trigger: enforces insurance_claims.policy_id/insured_person_id/settled_account_id belong to the same household, currency_code matches the policy''s currency, and insured_person_id is actually one of the policy''s insured people.';

create trigger check_insurance_claim_consistency
  before insert or update on public.insurance_claims
  for each row
  execute function public.check_insurance_claim_consistency();

alter table public.insurance_claims enable row level security;

create policy "members can view their household's insurance claims" on public.insurance_claims
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add insurance claims" on public.insurance_claims
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update insurance claims" on public.insurance_claims
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete insurance claims" on public.insurance_claims
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.insurance_claims to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. insurance_policy_waiting_periods — structured (dated) waiting-period
--    entries, so "waiting-period milestones" (PROMPT 26 dashboard
--    requirement) can be a computed end date rather than parsed out of the
--    existing freeform insurance_policies.waiting_periods text (which stays
--    exactly as-is, for narrative notes). A health policy commonly carries
--    several distinct waiting periods (initial, pre-existing conditions,
--    specific illnesses, maternity), hence its own table rather than a
--    single column.
-- ---------------------------------------------------------------------------

create table public.insurance_policy_waiting_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  label text not null check (char_length(btrim(label)) > 0),
  duration_months integer not null check (duration_months > 0),
  starts_from date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.insurance_policy_waiting_periods is
  'A structured, dated waiting period on a health policy (PROMPT 26) — e.g. "Pre-existing conditions", 48 months, starting from the policy start date. Its milestone end date (starts_from + duration_months) is always computed, never stored — see src/lib/calculations/insurance.ts. Cascades with its policy (pure descriptive metadata, unlike insurance_claims which restricts).';

create index insurance_policy_waiting_periods_household_id_idx on public.insurance_policy_waiting_periods (household_id);
create index insurance_policy_waiting_periods_policy_id_idx on public.insurance_policy_waiting_periods (policy_id);

create trigger set_updated_at
  before update on public.insurance_policy_waiting_periods
  for each row
  execute function public.set_updated_at();

create function public.check_insurance_waiting_period_consistency()
returns trigger
language plpgsql
as $$
declare
  v_policy_household uuid;
begin
  select household_id into v_policy_household
  from public.insurance_policies where id = new.policy_id;

  if v_policy_household is null or v_policy_household <> new.household_id then
    raise exception 'insurance_policy_waiting_periods.policy_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_insurance_waiting_period_consistency() is
  'Trigger: enforces insurance_policy_waiting_periods.policy_id belongs to the same household.';

create trigger check_insurance_waiting_period_consistency
  before insert or update on public.insurance_policy_waiting_periods
  for each row
  execute function public.check_insurance_waiting_period_consistency();

alter table public.insurance_policy_waiting_periods enable row level security;

create policy "members can view their household's waiting periods" on public.insurance_policy_waiting_periods
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add waiting periods" on public.insurance_policy_waiting_periods
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can remove waiting periods" on public.insurance_policy_waiting_periods
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on public.insurance_policy_waiting_periods to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. transactions.kind grown with 'insurance_claim_settlement', plus
--    transactions.insurance_claim_id — same pattern as loan_id/lending_id/
--    liability_id.
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check check (
    kind in (
      'income', 'expense', 'transfer', 'investment_contribution', 'investment_withdrawal',
      'loan_disbursement', 'loan_payment', 'lending_disbursement', 'lending_repayment',
      'liability_incurred', 'liability_payment', 'insurance_claim_settlement',
      'refund', 'adjustment'
    )
  );

alter table public.transactions
  add column insurance_claim_id uuid references public.insurance_claims (id) on delete restrict;

comment on column public.transactions.insurance_claim_id is
  'The insurance_claims row this settlement receipt belongs to, if any — null for any other kind. Only valid when kind = insurance_claim_settlement — see transactions_insurance_claim_id_requires_claim_kind. ON DELETE RESTRICT: the linked transaction is the "claim payment is not income" record and must survive as long as the claim row references it. See PROMPT 26.';

create index transactions_insurance_claim_id_idx on public.transactions (insurance_claim_id);

alter table public.transactions
  add constraint transactions_insurance_claim_id_requires_claim_kind
  check (insurance_claim_id is null or kind = 'insurance_claim_settlement');

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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/lending/liability/insurance-policy/insurance-claim/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. attachments.attachable_type grown to include 'insurance_claim' —
--    "claim documents are authorized" (PROMPT 26 acceptance criterion) is
--    the same structural private-bucket + household-scoped-RLS guarantee
--    every other attachable type already has.
-- ---------------------------------------------------------------------------

alter table public.attachments
  drop constraint attachments_attachable_type_check;

alter table public.attachments
  add constraint attachments_attachable_type_check
  check (attachable_type in ('financial_account', 'transaction', 'lending', 'insurance_policy', 'insurance_claim'));

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
-- 5. record_insurance_claim_settlement() — atomically writes the settlement
--    transaction (kind = insurance_claim_settlement, never income) and
--    marks the claim paid, mirroring record_loan_payment/
--    record_lending_repayment's "pair a status change with its transaction"
--    shape. A claim's settlement is a single one-time receipt (unlike a
--    loan/lending's incremental payments) — approved_amount_minor_units
--    already carries the insurer's decision; this records what was
--    actually received.
-- ---------------------------------------------------------------------------

create function public.record_insurance_claim_settlement(
  p_household_id uuid,
  p_claim_id uuid,
  p_settled_account_id uuid,
  p_settled_amount_minor_units bigint,
  p_settled_date date,
  p_description text default null
)
returns public.insurance_claims
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim public.insurance_claims;
  v_transaction_id uuid;
begin
  select * into v_claim
  from public.insurance_claims
  where id = p_claim_id and household_id = p_household_id
  for update;

  if v_claim.id is null then
    raise exception 'insurance claim not found';
  end if;

  if v_claim.status = 'paid' then
    raise exception 'this claim has already been marked paid';
  end if;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, related_person_id, insurance_claim_id, status, source_type, description
  )
  values (
    p_household_id, 'insurance_claim_settlement', p_settled_amount_minor_units, v_claim.currency_code,
    p_settled_date, p_settled_account_id, v_claim.insured_person_id, p_claim_id, 'cleared', 'manual',
    p_description
  )
  returning id into v_transaction_id;

  update public.insurance_claims
  set
    status = 'paid',
    settled_amount_minor_units = p_settled_amount_minor_units,
    settled_date = p_settled_date,
    settled_account_id = p_settled_account_id,
    settlement_transaction_id = v_transaction_id
  where id = p_claim_id and household_id = p_household_id
  returning * into v_claim;

  return v_claim;
end;
$$;

comment on function public.record_insurance_claim_settlement(uuid, uuid, uuid, bigint, date, text) is
  'Atomically records a claim settlement: writes the kind = insurance_claim_settlement transaction (never income — see migration header) and marks the claim paid with the settled_*/settlement_transaction_id fields in the same call. Rejects a claim that is already paid. See PROMPT 26.';

grant execute on function public.record_insurance_claim_settlement(uuid, uuid, uuid, bigint, date, text) to authenticated, service_role;
