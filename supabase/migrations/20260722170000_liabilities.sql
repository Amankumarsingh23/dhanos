-- PROMPT 24 — Informal borrowing and general liabilities. Two related but
-- distinct real-world concepts, kept as **one table** (unlike loans vs
-- lending in PROMPT 21/23, which are genuinely different lifecycles) since
-- both share the same shape — an obligation, optionally with a
-- counterparty, tracked to zero via append-only payments — and PROMPT 24
-- itself asks to "integrate with total debt" as one register:
--
--   - **Informal borrowing** (`liability_source = 'informal_borrowing'`):
--     money borrowed from family/a friend, an employer advance, an unpaid
--     obligation, private business borrowing, a pending personal
--     settlement — economically a small, non-institutional loan. Unlike
--     `loans` (PROMPT 21, which already has 'family'/'informal' loan
--     types for a *formal* lifecycle with EMI/maturity), this is the
--     lightweight path: a `documentation_status` instead of a contract,
--     and receiving the money is optional-at-creation (see
--     `create_liability` below) since not every example above involves an
--     actual cash inflow (an "unpaid obligation" for services already
--     consumed never credited an account here).
--   - **General obligation** (`liability_source = 'general_obligation'`):
--     unpaid taxes, pending bills, contractual commitments, guarantees,
--     maintenance obligations, recurring draining commitments — never has
--     a cash-received side at all, just an obligation recognized and,
--     later, paid down.
--
-- **"Do not mix estimates with legally confirmed obligations without
-- labels"** (PROMPT 24 acceptance criterion) is the `certainty` column —
-- every liability is explicitly 'confirmed' or 'estimated', never
-- ambiguous, and every read surfaces it as a visible badge (never folded
-- silently into a total without the distinction).
--
-- **Outstanding is derived, never stored** — same rule as
-- `loans`/`lendings`: `amount_minor_units - totalPrincipalPaid`, floored at
-- zero — see `src/lib/calculations/liability-outstanding.ts`.

-- ---------------------------------------------------------------------------
-- 1. liabilities
-- ---------------------------------------------------------------------------

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  liability_source text not null check (liability_source in ('informal_borrowing', 'general_obligation')),
  -- Cross-validated against liability_source below (liabilities_category_matches_source)
  -- rather than a single shared enum, so an informal-borrowing row can
  -- never accidentally carry a general-obligation category or vice versa.
  category text not null check (
    category in (
      'family', 'friend', 'employer_advance', 'unpaid_obligation', 'business_borrowing', 'personal_settlement', 'other_informal',
      'unpaid_tax', 'pending_bill', 'contractual_commitment', 'guarantee', 'maintenance_obligation', 'recurring_commitment', 'other_general'
    )
  ),
  -- Counterparty ("lender" for informal borrowing, a payee/authority for a
  -- general obligation) — deliberately both nullable with no "at least
  -- one" CHECK (unlike loans/lendings' lender/borrower), since a general
  -- obligation like "unpaid property tax" often has no tracked
  -- institution row at all.
  counterparty_person_id uuid references public.people (id) on delete restrict,
  counterparty_institution_id uuid references public.institutions (id) on delete restrict,
  amount_minor_units bigint not null check (amount_minor_units > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  start_date date not null,
  due_date date check (due_date is null or due_date >= start_date),
  charges_interest boolean not null default false,
  annual_interest_rate numeric check (annual_interest_rate is null or (annual_interest_rate > -1 and annual_interest_rate <= 10)),
  interest_type text check (interest_type is null or interest_type in ('simple', 'compound')),
  repayment_schedule_type text not null default 'lump_sum' check (
    repayment_schedule_type in ('lump_sum', 'installments', 'on_demand', 'flexible')
  ),
  installment_amount_minor_units bigint check (installment_amount_minor_units is null or installment_amount_minor_units > 0),
  installment_frequency text check (installment_frequency is null or installment_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  documentation_status text not null default 'none' check (
    documentation_status in ('none', 'verbal_agreement', 'written_note', 'formal_agreement', 'legal_document')
  ),
  -- PROMPT 24: "do not mix estimates with legally confirmed obligations
  -- without labels" — every liability is explicitly one or the other.
  certainty text not null default 'confirmed' check (certainty in ('confirmed', 'estimated')),
  -- Where a payment would come from — always required, same as
  -- loans.payment_account_id, even for a liability with no payment
  -- recorded yet.
  payment_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  -- Only set for informal_borrowing that actually received cash into an
  -- account (family/friend/employer advance/business borrowing) — null
  -- for a general_obligation, and null for informal borrowing recognized
  -- with no cash movement (e.g. an unpaid obligation for services already
  -- consumed). See create_liability below.
  receiving_account_id uuid references public.financial_accounts (id) on delete restrict,
  received_date date,
  incurred_transaction_id uuid references public.transactions (id) on delete set null,
  status text not null default 'active' check (
    status in ('active', 'partially_paid', 'paid', 'disputed', 'waived')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liabilities_category_matches_source check (
    (liability_source = 'informal_borrowing' and category in (
      'family', 'friend', 'employer_advance', 'unpaid_obligation', 'business_borrowing', 'personal_settlement', 'other_informal'
    ))
    or
    (liability_source = 'general_obligation' and category in (
      'unpaid_tax', 'pending_bill', 'contractual_commitment', 'guarantee', 'maintenance_obligation', 'recurring_commitment', 'other_general'
    ))
  ),
  constraint liabilities_interest_rate_requires_charges check (not charges_interest or annual_interest_rate is not null),
  constraint liabilities_installments_require_amount check (
    repayment_schedule_type <> 'installments'
    or (installment_amount_minor_units is not null and installment_frequency is not null)
  ),
  constraint liabilities_receiving_account_requires_date check (
    (receiving_account_id is null) = (received_date is null)
  ),
  constraint liabilities_receiving_account_requires_informal check (
    receiving_account_id is null or liability_source = 'informal_borrowing'
  )
);

comment on table public.liabilities is
  'Non-bank liabilities (PROMPT 24): informal borrowing (family/friend/employer advance/unpaid obligation/business borrowing/personal settlement) and general obligations (unpaid tax/pending bill/contractual commitment/guarantee/maintenance obligation/recurring commitment) in one register, distinguished by liability_source. Outstanding is never stored — see src/lib/calculations/liability-outstanding.ts.';
comment on column public.liabilities.certainty is
  'confirmed vs estimated — PROMPT 24: "do not mix estimates with legally confirmed obligations without labels." Always shown as a visible badge, never silently folded into a total.';
comment on column public.liabilities.receiving_account_id is
  'Only set when this liability actually credited an account (create_liability writes the matching liability_incurred transaction atomically) — null for a general_obligation, and null for informal borrowing recognized with no cash movement (e.g. an unpaid obligation for services already consumed).';

create index liabilities_household_id_idx on public.liabilities (household_id);
create index liabilities_counterparty_person_id_idx on public.liabilities (counterparty_person_id);
create index liabilities_counterparty_institution_id_idx on public.liabilities (counterparty_institution_id);
create index liabilities_payment_account_id_idx on public.liabilities (payment_account_id);
create index liabilities_receiving_account_id_idx on public.liabilities (receiving_account_id);

create trigger set_updated_at
  before update on public.liabilities
  for each row
  execute function public.set_updated_at();

create function public.check_liability_consistency()
returns trigger
language plpgsql
as $$
declare
  v_payment_account_household uuid;
  v_payment_account_currency text;
  v_receiving_account_household uuid;
  v_receiving_account_currency text;
begin
  select household_id, currency_code into v_payment_account_household, v_payment_account_currency
  from public.financial_accounts where id = new.payment_account_id;

  if v_payment_account_household is null or v_payment_account_household <> new.household_id then
    raise exception 'liabilities.payment_account_id must belong to the same household';
  end if;

  if new.currency_code <> v_payment_account_currency then
    raise exception 'liabilities.currency_code must match payment_account_id''s currency';
  end if;

  if new.receiving_account_id is not null then
    select household_id, currency_code into v_receiving_account_household, v_receiving_account_currency
    from public.financial_accounts where id = new.receiving_account_id;

    if v_receiving_account_household is null or v_receiving_account_household <> new.household_id then
      raise exception 'liabilities.receiving_account_id must belong to the same household';
    end if;

    if new.currency_code <> v_receiving_account_currency then
      raise exception 'liabilities.currency_code must match receiving_account_id''s currency';
    end if;
  end if;

  if new.counterparty_person_id is not null and not exists (
    select 1 from public.people
    where id = new.counterparty_person_id and household_id = new.household_id
  ) then
    raise exception 'liabilities.counterparty_person_id must belong to the same household';
  end if;

  if new.counterparty_institution_id is not null and not exists (
    select 1 from public.institutions
    where id = new.counterparty_institution_id and household_id = new.household_id
  ) then
    raise exception 'liabilities.counterparty_institution_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_liability_consistency() is
  'Trigger: enforces liabilities.payment_account_id/receiving_account_id/counterparty_person_id/counterparty_institution_id belong to the same household, and currency_code matches both account references.';

create trigger check_liability_consistency
  before insert or update on public.liabilities
  for each row
  execute function public.check_liability_consistency();

alter table public.liabilities enable row level security;

create policy "members can view their household's liabilities" on public.liabilities
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add liabilities" on public.liabilities
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update liabilities" on public.liabilities
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete liabilities" on public.liabilities
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.liabilities to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. liability_payments — append-only, same shape as loan_payments/
--    lending_repayments. "Payment history remains auditable" (PROMPT 24
--    acceptance criterion) is this table: never updated or deleted, a
--    correction is a new row referencing the original via
--    reverses_payment_id.
-- ---------------------------------------------------------------------------

create table public.liability_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  liability_id uuid not null references public.liabilities (id) on delete restrict,
  payment_date date not null,
  principal_component_minor_units bigint not null default 0 check (principal_component_minor_units >= 0),
  interest_component_minor_units bigint not null default 0 check (interest_component_minor_units >= 0),
  total_payment_minor_units bigint not null check (total_payment_minor_units > 0),
  excess_amount_minor_units bigint not null default 0 check (excess_amount_minor_units >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  linked_transaction_id uuid references public.transactions (id) on delete set null,
  reverses_payment_id uuid references public.liability_payments (id) on delete set null,
  reversal_reason text,
  notes text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint liability_payments_total_balances check (
    total_payment_minor_units = principal_component_minor_units + interest_component_minor_units
  ),
  constraint liability_payments_reversal_requires_reason check (
    reverses_payment_id is null or (reversal_reason is not null and char_length(btrim(reversal_reason)) > 0)
  )
);

comment on table public.liability_payments is
  'Append-only liability payment record. Never updated or deleted; a correction is a new row referencing the original via reverses_payment_id. See PROMPT 24.';

create index liability_payments_household_id_idx on public.liability_payments (household_id);
create index liability_payments_liability_id_idx on public.liability_payments (liability_id, payment_date desc);
create index liability_payments_linked_transaction_id_idx on public.liability_payments (linked_transaction_id);
create index liability_payments_reverses_payment_id_idx on public.liability_payments (reverses_payment_id);

create function public.check_liability_payment_consistency()
returns trigger
language plpgsql
as $$
declare
  v_liability_household uuid;
  v_liability_currency text;
  v_reversed_liability_id uuid;
  v_reversed_household uuid;
begin
  select household_id, currency_code into v_liability_household, v_liability_currency
  from public.liabilities where id = new.liability_id;

  if v_liability_household is null or v_liability_household <> new.household_id then
    raise exception 'liability_payments.liability_id must belong to the same household';
  end if;

  if new.currency_code <> v_liability_currency then
    raise exception 'liability_payments.currency_code must match the liability''s currency';
  end if;

  if new.reverses_payment_id is not null then
    select liability_id, household_id into v_reversed_liability_id, v_reversed_household
    from public.liability_payments where id = new.reverses_payment_id;

    if v_reversed_household is null or v_reversed_household <> new.household_id then
      raise exception 'liability_payments.reverses_payment_id must belong to the same household';
    end if;

    if v_reversed_liability_id <> new.liability_id then
      raise exception 'liability_payments.reverses_payment_id must reference a payment on the same liability';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.check_liability_payment_consistency() is
  'Trigger: enforces liability_payments.liability_id belongs to the same household, currency_code matches the liability''s currency, and a reversed payment (if any) belongs to the same liability and household.';

create trigger check_liability_payment_consistency
  before insert on public.liability_payments
  for each row
  execute function public.check_liability_payment_consistency();

alter table public.liability_payments enable row level security;

create policy "members can view their household's liability payments" on public.liability_payments
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can record a liability payment" on public.liability_payments
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert on public.liability_payments to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. transactions.kind grown with 'liability_incurred'/'liability_payment',
--    plus transactions.liability_id — same pattern as loan_id/lending_id.
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check check (
    kind in (
      'income', 'expense', 'transfer', 'investment_contribution', 'investment_withdrawal',
      'loan_disbursement', 'loan_payment', 'lending_disbursement', 'lending_repayment',
      'liability_incurred', 'liability_payment',
      'refund', 'adjustment'
    )
  );

alter table public.transactions
  add column liability_id uuid references public.liabilities (id) on delete set null;

comment on column public.transactions.liability_id is
  'The liabilities row this receipt or payment belongs to, if any — null for any other kind. Only valid when kind in (liability_incurred, liability_payment) — see transactions_liability_id_requires_liability_kind. See PROMPT 24.';

create index transactions_liability_id_idx on public.transactions (liability_id);

alter table public.transactions
  add constraint transactions_liability_id_requires_liability_kind
  check (liability_id is null or kind in ('liability_incurred', 'liability_payment'));

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
  'Trigger: enforces household + currency consistency across a transaction''s account/category/recurring-rule/person/income-source/loan/lending/liability/reversed-transaction references. See docs/database-plan.md §4.';

-- ---------------------------------------------------------------------------
-- 4. create_liability() — inserts the liability row and, only when
--    p_receiving_account_id is provided (informal borrowing that actually
--    received cash), atomically writes the matching liability_incurred
--    transaction alongside it. A general_obligation, or an informal
--    liability recognized with no cash movement, gets no transaction at
--    all — never a fabricated "money received" event.
-- ---------------------------------------------------------------------------

create function public.create_liability(
  p_household_id uuid,
  p_name text,
  p_liability_source text,
  p_category text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_start_date date,
  p_payment_account_id uuid,
  p_counterparty_person_id uuid default null,
  p_counterparty_institution_id uuid default null,
  p_due_date date default null,
  p_charges_interest boolean default false,
  p_annual_interest_rate numeric default null,
  p_interest_type text default null,
  p_repayment_schedule_type text default 'lump_sum',
  p_installment_amount_minor_units bigint default null,
  p_installment_frequency text default null,
  p_documentation_status text default 'none',
  p_certainty text default 'confirmed',
  p_receiving_account_id uuid default null,
  p_received_date date default null,
  p_notes text default null
)
returns public.liabilities
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_liability public.liabilities;
  v_transaction public.transactions;
begin
  insert into public.liabilities (
    household_id, name, liability_source, category,
    counterparty_person_id, counterparty_institution_id,
    amount_minor_units, currency_code, start_date, due_date,
    charges_interest, annual_interest_rate, interest_type,
    repayment_schedule_type, installment_amount_minor_units, installment_frequency,
    documentation_status, certainty, payment_account_id,
    receiving_account_id, received_date, notes
  )
  values (
    p_household_id, p_name, p_liability_source, p_category,
    p_counterparty_person_id, p_counterparty_institution_id,
    p_amount_minor_units, p_currency_code, p_start_date, p_due_date,
    p_charges_interest, p_annual_interest_rate, p_interest_type,
    p_repayment_schedule_type, p_installment_amount_minor_units, p_installment_frequency,
    p_documentation_status, p_certainty, p_payment_account_id,
    p_receiving_account_id, p_received_date, p_notes
  )
  returning * into v_liability;

  if p_receiving_account_id is not null then
    insert into public.transactions (
      household_id, kind, amount_minor_units, currency_code, transaction_date,
      account_id, liability_id, status, source_type, description
    )
    values (
      p_household_id, 'liability_incurred', p_amount_minor_units, p_currency_code, p_received_date,
      p_receiving_account_id, v_liability.id, 'cleared', 'manual', coalesce(p_notes, 'Liability incurred: ' || p_name)
    )
    returning * into v_transaction;

    update public.liabilities
    set incurred_transaction_id = v_transaction.id
    where id = v_liability.id
    returning * into v_liability;
  end if;

  return v_liability;
end;
$$;

comment on function public.create_liability(uuid, text, text, text, bigint, text, date, uuid, uuid, uuid, date, boolean, numeric, text, text, bigint, text, text, text, uuid, date, text) is
  'Creates a liability, and — only when p_receiving_account_id is given — atomically writes the matching liability_incurred transaction (never income). A general_obligation, or informal borrowing with no cash movement, gets no transaction. See PROMPT 24.';

grant execute on function public.create_liability(uuid, text, text, text, bigint, text, date, uuid, uuid, uuid, date, boolean, numeric, text, text, bigint, text, text, text, uuid, date, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. record_liability_payment() — mirrors record_lending_repayment: writes
--    the linked transaction (kind = liability_payment — never expense,
--    same "the spend was already recognized when the liability was
--    incurred" reasoning as a loan payment) and the liability_payments row
--    together, then auto-advances status as principal is paid down.
-- ---------------------------------------------------------------------------

create function public.record_liability_payment(
  p_household_id uuid,
  p_liability_id uuid,
  p_payment_date date,
  p_principal_component_minor_units bigint,
  p_interest_component_minor_units bigint,
  p_excess_amount_minor_units bigint default 0,
  p_notes text default null
)
returns public.liability_payments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_liability public.liabilities;
  v_total bigint;
  v_transaction public.transactions;
  v_payment public.liability_payments;
  v_remaining_outstanding bigint;
begin
  select * into v_liability from public.liabilities
  where id = p_liability_id and household_id = p_household_id;

  if v_liability.id is null then
    raise exception 'Liability not found';
  end if;

  v_total := p_principal_component_minor_units + p_interest_component_minor_units;

  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, liability_id, status, source_type, description
  )
  values (
    p_household_id, 'liability_payment', v_total, v_liability.currency_code, p_payment_date,
    v_liability.payment_account_id, p_liability_id, 'cleared', 'manual', coalesce(p_notes, 'Liability payment')
  )
  returning * into v_transaction;

  insert into public.liability_payments (
    household_id, liability_id, payment_date, principal_component_minor_units,
    interest_component_minor_units, total_payment_minor_units, excess_amount_minor_units,
    currency_code, linked_transaction_id, notes
  )
  values (
    p_household_id, p_liability_id, p_payment_date, p_principal_component_minor_units,
    p_interest_component_minor_units, v_total, p_excess_amount_minor_units,
    v_liability.currency_code, v_transaction.id, p_notes
  )
  returning * into v_payment;

  select greatest(
    0,
    v_liability.amount_minor_units - coalesce(sum(lp.principal_component_minor_units), 0)
  )
  into v_remaining_outstanding
  from public.liability_payments lp
  where lp.liability_id = p_liability_id
    and lp.reverses_payment_id is null
    and lp.id not in (
      select reverses_payment_id from public.liability_payments
      where liability_id = p_liability_id and reverses_payment_id is not null
    );

  if v_liability.status in ('active', 'partially_paid', 'disputed') then
    if v_remaining_outstanding = 0 then
      update public.liabilities set status = 'paid' where id = p_liability_id and household_id = p_household_id;
    elsif v_remaining_outstanding < v_liability.amount_minor_units then
      update public.liabilities set status = 'partially_paid' where id = p_liability_id and household_id = p_household_id;
    end if;
  end if;

  return v_payment;
end;
$$;

comment on function public.record_liability_payment(uuid, uuid, date, bigint, bigint, bigint, text) is
  'Atomically writes one liability payment''s cash-flow transaction (kind = liability_payment — never expense) and liability_payments row, then auto-advances status toward paid as principal is paid down. excess_amount_minor_units must already be confirmed by the caller. See PROMPT 24.';

grant execute on function public.record_liability_payment(uuid, uuid, date, bigint, bigint, bigint, text) to authenticated, service_role;
