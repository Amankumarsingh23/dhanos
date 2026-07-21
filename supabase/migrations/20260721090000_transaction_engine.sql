-- PROMPT 10 — Categories and transaction engine. Three independent pieces:
--
--   1. transactions.status grows from (pending, cleared, void) to the full
--      lifecycle (planned, pending, cleared, cancelled, reconciled) —
--      "archiving" a transaction in the UI means moving it to 'cancelled'
--      rather than a separate delete/soft-delete column, and reporting
--      logic defaults to status = 'cleared' (see docs/money-calculation-rules.md).
--   2. transaction_categories grows classification (need/want/obligation/
--      protection/investment), sort_order (manual reordering), and
--      is_system_default (distinguishes the seeded default taxonomy from a
--      household's own custom categories — see PROMPT 10 "Category
--      behavior").
--   3. A default category taxonomy (Income / Essential expenses / Lifestyle
--      / Wealth-building, each with the subcategories PROMPT 10
--      specifies) is seeded automatically for every household — via a
--      trigger on households insert (alongside create_owner_membership)
--      for new households, and a one-time backfill below for any household
--      that predates this migration.
--   4. create_transaction_with_splits / update_transaction_with_splits:
--      SECURITY INVOKER RPCs that write a transaction row and its
--      transaction_splits atomically in one statement — PostgREST cannot
--      span a client-visible transaction across two separate REST calls
--      (docs/data-access-patterns.md step 5), and split-total integrity
--      ("Split transaction totals are enforced") deserves real atomicity,
--      not "insert the transaction, then hope the splits insert also
--      succeeds."

-- ---------------------------------------------------------------------------
-- 1. transactions.status
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint transactions_status_check;

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('planned', 'pending', 'cleared', 'cancelled', 'reconciled'));

comment on column public.transactions.status is
  'Lifecycle state: planned (not yet occurred/committed), pending (occurred, not yet settled), cleared (settled — the default for reporting), cancelled (archived/voided, never deleted), reconciled (matched against an external statement). See docs/money-calculation-rules.md, "Reports use cleared transactions by default."';

-- ---------------------------------------------------------------------------
-- 2. transaction_categories: classification, sort_order, is_system_default
-- ---------------------------------------------------------------------------

alter table public.transaction_categories
  add column classification text check (
    classification in ('need', 'want', 'obligation', 'protection', 'investment')
  ),
  add column sort_order integer not null default 0,
  add column is_system_default boolean not null default false;

comment on column public.transaction_categories.classification is
  'Optional need/want/obligation/protection/investment tag for spending-discipline reporting — meaningful mainly for expense/investment categories, left null for income and group headers.';
comment on column public.transaction_categories.sort_order is
  'Manual display order within a household''s category list (or within a parent''s children) — see reorderCategoriesAction in src/features/transaction-categories/actions.ts.';
comment on column public.transaction_categories.is_system_default is
  'True for a category from the seeded default taxonomy (see seed_default_transaction_categories below); false for a household''s own custom category. System defaults can be archived like any other category, but are never auto-deleted.';

-- ---------------------------------------------------------------------------
-- 3. Default category taxonomy
-- ---------------------------------------------------------------------------

create function public.seed_default_transaction_categories(p_household_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_income_id uuid;
  v_essential_id uuid;
  v_lifestyle_id uuid;
  v_wealth_id uuid;
begin
  -- Idempotent: a household that already has system-default categories
  -- (already seeded, or seeded then some were archived/edited) is left
  -- alone — this is a one-time bootstrap, not a "reset to defaults."
  if exists (
    select 1 from public.transaction_categories
    where household_id = p_household_id and is_system_default
  ) then
    return;
  end if;

  insert into public.transaction_categories (household_id, name, category_kind, is_system_default, sort_order)
  values (p_household_id, 'Income', 'income', true, 0)
  returning id into v_income_id;

  insert into public.transaction_categories (household_id, name, category_kind, parent_category_id, is_system_default, sort_order)
  values
    (p_household_id, 'Salary', 'income', v_income_id, true, 0),
    (p_household_id, 'Internship', 'income', v_income_id, true, 1),
    (p_household_id, 'Business', 'income', v_income_id, true, 2),
    (p_household_id, 'Freelance', 'income', v_income_id, true, 3),
    (p_household_id, 'Part-time', 'income', v_income_id, true, 4),
    (p_household_id, 'Interest', 'income', v_income_id, true, 5),
    (p_household_id, 'Dividend', 'income', v_income_id, true, 6),
    (p_household_id, 'Rent', 'income', v_income_id, true, 7),
    (p_household_id, 'Refund', 'income', v_income_id, true, 8),
    (p_household_id, 'Gift', 'income', v_income_id, true, 9),
    (p_household_id, 'Asset sale', 'income', v_income_id, true, 10),
    (p_household_id, 'Other income', 'income', v_income_id, true, 11);

  insert into public.transaction_categories (household_id, name, category_kind, is_system_default, sort_order)
  values (p_household_id, 'Essential expenses', 'expense', true, 1)
  returning id into v_essential_id;

  insert into public.transaction_categories (household_id, name, category_kind, parent_category_id, classification, is_system_default, sort_order)
  values
    (p_household_id, 'Housing', 'expense', v_essential_id, 'need', true, 0),
    (p_household_id, 'Groceries', 'expense', v_essential_id, 'need', true, 1),
    (p_household_id, 'Utilities', 'expense', v_essential_id, 'need', true, 2),
    (p_household_id, 'Transport', 'expense', v_essential_id, 'need', true, 3),
    (p_household_id, 'Education', 'expense', v_essential_id, 'need', true, 4),
    (p_household_id, 'Healthcare', 'expense', v_essential_id, 'need', true, 5),
    (p_household_id, 'Family support', 'expense', v_essential_id, 'obligation', true, 6),
    (p_household_id, 'Insurance', 'expense', v_essential_id, 'protection', true, 7),
    (p_household_id, 'Debt payment', 'expense', v_essential_id, 'obligation', true, 8);

  insert into public.transaction_categories (household_id, name, category_kind, is_system_default, sort_order)
  values (p_household_id, 'Lifestyle', 'expense', true, 2)
  returning id into v_lifestyle_id;

  insert into public.transaction_categories (household_id, name, category_kind, parent_category_id, classification, is_system_default, sort_order)
  values
    (p_household_id, 'Eating out', 'expense', v_lifestyle_id, 'want', true, 0),
    (p_household_id, 'Entertainment', 'expense', v_lifestyle_id, 'want', true, 1),
    (p_household_id, 'Subscriptions', 'expense', v_lifestyle_id, 'want', true, 2),
    (p_household_id, 'Shopping', 'expense', v_lifestyle_id, 'want', true, 3),
    (p_household_id, 'Travel', 'expense', v_lifestyle_id, 'want', true, 4),
    (p_household_id, 'Gadgets', 'expense', v_lifestyle_id, 'want', true, 5),
    (p_household_id, 'Hobbies', 'expense', v_lifestyle_id, 'want', true, 6);

  -- category_kind = 'investment': PROMPT 10 is explicit that investment
  -- activity itself uses dedicated transaction kinds
  -- (investment_contribution/investment_withdrawal), not these categories
  -- directly — these exist for households that still want to label *which*
  -- investment an income/expense-shaped entry relates to before the
  -- Investments module (PROMPT 12+) exists.
  insert into public.transaction_categories (household_id, name, category_kind, is_system_default, sort_order)
  values (p_household_id, 'Wealth building', 'investment', true, 3)
  returning id into v_wealth_id;

  insert into public.transaction_categories (household_id, name, category_kind, parent_category_id, classification, is_system_default, sort_order)
  values
    (p_household_id, 'Mutual funds', 'investment', v_wealth_id, 'investment', true, 0),
    (p_household_id, 'Gold', 'investment', v_wealth_id, 'investment', true, 1),
    (p_household_id, 'Fixed deposit', 'investment', v_wealth_id, 'investment', true, 2),
    (p_household_id, 'Retirement', 'investment', v_wealth_id, 'investment', true, 3),
    (p_household_id, 'Business investment', 'investment', v_wealth_id, 'investment', true, 4);
end;
$$;

comment on function public.seed_default_transaction_categories(uuid) is
  'Seeds the PROMPT 10 default category taxonomy (Income / Essential expenses / Lifestyle / Wealth building, each with its subcategories) for one household. Idempotent — a no-op if the household already has any is_system_default category.';

create function public._seed_default_transaction_categories_trigger()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.seed_default_transaction_categories(new.id);
  return new;
end;
$$;

-- Named to sort after "create_owner_membership" (tenancy_households
-- migration): Postgres fires same-event triggers in name order, and
-- seeding categories needs the owner membership row to already exist so
-- the categories insert's own RLS check (household_role(household_id) in
-- owner/admin/editor) passes.
create trigger seed_default_transaction_categories
  after insert on public.households
  for each row
  execute function public._seed_default_transaction_categories_trigger();

-- One-time backfill for any household created before this migration
-- (local dev's seeded demo household, or any onboarded test household).
-- Runs as the migration role, which bypasses RLS entirely, so this needs
-- no auth.uid() session.
do $$
declare
  v_household record;
begin
  for v_household in select id from public.households loop
    perform public.seed_default_transaction_categories(v_household.id);
  end loop;
end;
$$;

grant execute on function public.seed_default_transaction_categories(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_transaction_with_splits / update_transaction_with_splits
--
-- p_splits is a jsonb array of {"category_id": uuid, "amount_minor_units":
-- bigint, "notes": text|null}, or null to mean "no splits" (create) / "leave
-- existing splits untouched" (update). An empty array on update clears all
-- splits, returning the transaction to single-category mode. The
-- transactions table's own triggers (check_transaction_consistency,
-- transactions_transfer_shape, transactions_refund_shape) and
-- transaction_splits' deferred split-total trigger still fire and enforce
-- their invariants inside this same statement — this RPC does not
-- duplicate that validation, only makes the two inserts atomic.
-- ---------------------------------------------------------------------------

create function public.create_transaction_with_splits(
  p_household_id uuid,
  p_kind text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_transaction_date date,
  p_account_id uuid,
  p_transfer_account_id uuid default null,
  p_category_id uuid default null,
  p_counterparty text default null,
  p_description text default null,
  p_status text default 'cleared',
  p_source_type text default 'manual',
  p_recurring_rule_id uuid default null,
  p_related_person_id uuid default null,
  p_reverses_transaction_id uuid default null,
  p_splits jsonb default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
  v_split jsonb;
begin
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, transfer_account_id, category_id, counterparty, description,
    status, source_type, recurring_rule_id, related_person_id, reverses_transaction_id
  )
  values (
    p_household_id, p_kind, p_amount_minor_units, p_currency_code, p_transaction_date,
    p_account_id, p_transfer_account_id, p_category_id, p_counterparty, p_description,
    p_status, p_source_type, p_recurring_rule_id, p_related_person_id, p_reverses_transaction_id
  )
  returning * into v_transaction;

  if p_splits is not null then
    for v_split in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.transaction_splits (household_id, transaction_id, category_id, amount_minor_units, notes)
      values (
        p_household_id,
        v_transaction.id,
        (v_split ->> 'category_id')::uuid,
        (v_split ->> 'amount_minor_units')::bigint,
        v_split ->> 'notes'
      );
    end loop;
  end if;

  return v_transaction;
end;
$$;

comment on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb) is
  'Atomically creates a transaction and (optionally) its transaction_splits — see PROMPT 10 acceptance criterion "Split transaction totals are enforced." SECURITY INVOKER: runs under the caller''s session, so the normal transactions/transaction_splits RLS policies apply exactly as if the client had issued each insert directly.';

create function public.update_transaction_with_splits(
  p_household_id uuid,
  p_transaction_id uuid,
  p_kind text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_transaction_date date,
  p_account_id uuid,
  p_transfer_account_id uuid default null,
  p_category_id uuid default null,
  p_counterparty text default null,
  p_description text default null,
  p_status text default 'cleared',
  p_source_type text default 'manual',
  p_recurring_rule_id uuid default null,
  p_related_person_id uuid default null,
  p_reverses_transaction_id uuid default null,
  p_splits jsonb default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
  v_split jsonb;
begin
  update public.transactions set
    kind = p_kind,
    amount_minor_units = p_amount_minor_units,
    currency_code = p_currency_code,
    transaction_date = p_transaction_date,
    account_id = p_account_id,
    transfer_account_id = p_transfer_account_id,
    category_id = p_category_id,
    counterparty = p_counterparty,
    description = p_description,
    status = p_status,
    source_type = p_source_type,
    recurring_rule_id = p_recurring_rule_id,
    related_person_id = p_related_person_id,
    reverses_transaction_id = p_reverses_transaction_id
  where id = p_transaction_id and household_id = p_household_id
  returning * into v_transaction;

  if v_transaction.id is null then
    raise exception 'Transaction not found';
  end if;

  if p_splits is not null then
    delete from public.transaction_splits
    where transaction_id = v_transaction.id and household_id = p_household_id;

    for v_split in select * from jsonb_array_elements(p_splits)
    loop
      insert into public.transaction_splits (household_id, transaction_id, category_id, amount_minor_units, notes)
      values (
        p_household_id,
        v_transaction.id,
        (v_split ->> 'category_id')::uuid,
        (v_split ->> 'amount_minor_units')::bigint,
        v_split ->> 'notes'
      );
    end loop;
  end if;

  return v_transaction;
end;
$$;

comment on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb) is
  'Atomically updates a transaction and replaces its transaction_splits (when p_splits is provided) — see PROMPT 10 acceptance criterion "Split transaction totals are enforced." SECURITY INVOKER, household-scoped.';

grant execute on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb) to authenticated, service_role;
