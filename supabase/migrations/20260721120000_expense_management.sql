-- PROMPT 12 — Expense management. Expenses are already `transactions` rows
-- with kind = 'expense' (see docs/financial-domain-model.md §3); this
-- migration adds the two pieces of expense-specific data the generic
-- ledger doesn't already model, plus storage for receipts:
--
--   1. transactions.is_planned — "planned or unplanned" is a
--      budgeting-intent concept, distinct from transactions.status's
--      'planned' lifecycle state (which means "not yet occurred/committed",
--      see PROMPT 10). Nullable-by-default-true so every existing and
--      non-expense row stays sane; the expense feature's own form is what
--      actually asks the question.
--   2. create_transaction_with_splits / update_transaction_with_splits gain
--      a p_is_planned parameter. Postgres treats an appended parameter as a
--      new overload rather than a true replacement (CREATE OR REPLACE
--      requires identical argument types), so both functions are dropped
--      and recreated in full rather than patched in place.
--   3. A private 'documents' Storage bucket + household-scoped RLS on
--      storage.objects, keyed off the household id as the first path
--      segment (`${householdId}/...`) — the first working attachment
--      upload path against the attachments table (PROMPT 9), used here for
--      expense receipts (attachments.attachable_type = 'transaction') and
--      reusable as-is by a future Documents feature.

-- ---------------------------------------------------------------------------
-- 1. transactions.is_planned
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column is_planned boolean not null default true;

comment on column public.transactions.is_planned is
  'Whether this expense was anticipated/budgeted for, as opposed to a surprise — a budgeting-intent flag distinct from status''s planned/pending/cleared lifecycle. Meaningful mainly for kind = expense; left at its default for other kinds. See PROMPT 12.';

-- ---------------------------------------------------------------------------
-- 2. create_transaction_with_splits / update_transaction_with_splits:
--    add p_is_planned. Dropped and recreated (not CREATE OR REPLACE) since
--    an appended parameter changes the argument-type signature.
-- ---------------------------------------------------------------------------

drop function if exists public.create_transaction_with_splits(
  uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb
);
drop function if exists public.update_transaction_with_splits(
  uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb
);

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
  p_splits jsonb default null,
  p_is_planned boolean default true
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
    status, source_type, recurring_rule_id, related_person_id, reverses_transaction_id,
    is_planned
  )
  values (
    p_household_id, p_kind, p_amount_minor_units, p_currency_code, p_transaction_date,
    p_account_id, p_transfer_account_id, p_category_id, p_counterparty, p_description,
    p_status, p_source_type, p_recurring_rule_id, p_related_person_id, p_reverses_transaction_id,
    p_is_planned
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

comment on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean) is
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
  p_splits jsonb default null,
  p_is_planned boolean default true
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
    reverses_transaction_id = p_reverses_transaction_id,
    is_planned = p_is_planned
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

comment on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean) is
  'Atomically updates a transaction and replaces its transaction_splits (when p_splits is provided) — see PROMPT 10 acceptance criterion "Split transaction totals are enforced." SECURITY INVOKER, household-scoped.';

grant execute on function public.create_transaction_with_splits(uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.update_transaction_with_splits(uuid, uuid, text, bigint, text, date, uuid, uuid, uuid, text, text, text, text, uuid, uuid, uuid, jsonb, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Storage: a private 'documents' bucket + household-scoped RLS, for
--    receipts (and reusable later by a Documents feature). Path convention:
--    `${household_id}/${attachable_type}/${attachable_id}/${filename}` —
--    every policy below trusts only the first path segment, cast to uuid.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "members can view their household's documents" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and public.is_household_member((split_part(name, '/', 1))::uuid)
  );

create policy "editors can upload their household's documents" on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and public.household_role((split_part(name, '/', 1))::uuid) in ('owner', 'admin', 'editor')
  );

create policy "editors can update their household's documents" on storage.objects
  for update
  using (
    bucket_id = 'documents'
    and public.household_role((split_part(name, '/', 1))::uuid) in ('owner', 'admin', 'editor')
  )
  with check (
    bucket_id = 'documents'
    and public.household_role((split_part(name, '/', 1))::uuid) in ('owner', 'admin', 'editor')
  );

create policy "editors can delete their household's documents" on storage.objects
  for delete
  using (
    bucket_id = 'documents'
    and public.household_role((split_part(name, '/', 1))::uuid) in ('owner', 'admin', 'editor')
  );
