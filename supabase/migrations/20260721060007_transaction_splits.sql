-- transaction_splits: divides one transaction across multiple categories.
-- When splits exist for a transaction, they must sum exactly to that
-- transaction's amount_minor_units — enforced here with a DEFERRABLE
-- constraint trigger (checked at end of statement/transaction, so
-- multi-row inserts building up a full split set don't fail mid-way), not
-- left to application code alone (see PROMPT 6, "Split totals must equal
-- transaction total. Implement database or application-level integrity
-- with tests.").
--
-- A transaction with zero split rows is unaffected by any of this — it is
-- categorized singly via transactions.category_id.

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  category_id uuid not null references public.transaction_categories (id) on delete restrict,
  amount_minor_units bigint not null check (amount_minor_units <> 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.transaction_splits is
  'Divides one transaction across multiple categories. Sum of a transaction''s splits must equal its amount_minor_units whenever any splits exist — enforced by a deferred constraint trigger. See docs/financial-domain-model.md §3.';

create index transaction_splits_household_id_idx on public.transaction_splits (household_id);
create index transaction_splits_transaction_id_idx on public.transaction_splits (transaction_id);
create index transaction_splits_category_id_idx on public.transaction_splits (category_id);

create trigger set_updated_at
  before update on public.transaction_splits
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Household consistency (immediate, not deferred): transaction_id and
-- category_id must belong to the same household as the split row itself.
-- ---------------------------------------------------------------------------

create function public.check_transaction_split_household_consistency()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.transactions
    where id = new.transaction_id and household_id = new.household_id
  ) then
    raise exception 'transaction_splits.transaction_id must belong to the same household';
  end if;

  if not exists (
    select 1 from public.transaction_categories
    where id = new.category_id and household_id = new.household_id
  ) then
    raise exception 'transaction_splits.category_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_transaction_split_household_consistency() is
  'Trigger: rejects a transaction_splits row whose transaction_id or category_id belongs to a different household.';

create trigger check_transaction_split_household_consistency
  before insert or update on public.transaction_splits
  for each row
  execute function public.check_transaction_split_household_consistency();

-- ---------------------------------------------------------------------------
-- Split-total integrity (deferred): the core "splits sum to the parent
-- transaction's amount" invariant.
-- ---------------------------------------------------------------------------

create function public.transaction_amount_matches_splits(p_transaction_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select sum(ts.amount_minor_units) = t.amount_minor_units
      from public.transactions t
      left join public.transaction_splits ts on ts.transaction_id = t.id
      where t.id = p_transaction_id
      group by t.amount_minor_units
      having count(ts.id) > 0
    ),
    true
  );
$$;

comment on function public.transaction_amount_matches_splits(uuid) is
  'True if transaction p_transaction_id has no splits, or its splits sum exactly to its amount_minor_units.';

create function public.check_transaction_split_totals()
returns trigger
language plpgsql
as $$
declare
  v_id uuid;
begin
  foreach v_id in array array_remove(array[
    case when tg_op in ('UPDATE', 'DELETE') then old.transaction_id end,
    case when tg_op in ('UPDATE', 'INSERT') then new.transaction_id end
  ], null)
  loop
    if not public.transaction_amount_matches_splits(v_id) then
      raise exception 'transaction_splits for transaction % must sum to the transaction''s amount_minor_units', v_id;
    end if;
  end loop;
  return null;
end;
$$;

comment on function public.check_transaction_split_totals() is
  'Deferred constraint trigger function: re-validates split-sum integrity for the affected transaction(s) at end of statement/transaction.';

create constraint trigger check_transaction_split_totals
  after insert or update or delete on public.transaction_splits
  deferrable initially deferred
  for each row
  execute function public.check_transaction_split_totals();

-- A transaction's own amount can change after splits already exist (e.g. a
-- correction to the total) — re-check the same invariant from that side too.
create function public.check_transaction_amount_matches_splits()
returns trigger
language plpgsql
as $$
begin
  if not public.transaction_amount_matches_splits(new.id) then
    raise exception 'transaction % amount_minor_units must equal the sum of its transaction_splits', new.id;
  end if;
  return null;
end;
$$;

comment on function public.check_transaction_amount_matches_splits() is
  'Deferred constraint trigger function on transactions: re-validates split-sum integrity when a split-having transaction''s own amount_minor_units changes.';

create constraint trigger check_transaction_amount_matches_splits
  after update of amount_minor_units on public.transactions
  deferrable initially deferred
  for each row
  execute function public.check_transaction_amount_matches_splits();

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.transaction_splits enable row level security;

create policy "members can view their household's transaction splits" on public.transaction_splits
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add transaction splits" on public.transaction_splits
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update transaction splits" on public.transaction_splits
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can delete transaction splits" on public.transaction_splits
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.transaction_splits to authenticated, service_role;
