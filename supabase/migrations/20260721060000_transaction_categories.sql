-- transaction_categories: household-defined labels for transactions and
-- transaction_splits (see docs/financial-domain-model.md §3).
--
-- Self-referential parent_category_id gives a shallow hierarchy (e.g.
-- "Food" -> "Groceries", "Dining Out") without a separate category-group
-- table. category_kind mirrors the transactions.kind families a category is
-- meant for, so the UI can filter the picker by transaction kind.

create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  category_kind text not null check (
    category_kind in ('income', 'expense', 'transfer', 'investment', 'debt', 'other')
  ),
  parent_category_id uuid references public.transaction_categories (id) on delete set null,
  icon text,
  color text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A parent must belong to the same household — cross-household category
  -- hierarchies would let one household's taxonomy leak into another's.
  constraint transaction_categories_no_self_parent check (id <> parent_category_id)
);

comment on table public.transaction_categories is
  'Household-defined, optionally hierarchical labels applied to transactions and transaction_splits. See docs/financial-domain-model.md §3.';

create index transaction_categories_household_id_idx on public.transaction_categories (household_id);
create index transaction_categories_parent_category_id_idx on public.transaction_categories (parent_category_id);

-- Case-insensitive uniqueness per household + parent (top-level categories
-- share the null-parent bucket); avoids "Groceries" and "groceries"
-- coexisting as separate rows in the same place in the tree.
create unique index transaction_categories_household_parent_name_idx
  on public.transaction_categories (household_id, coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'), lower(name));

create trigger set_updated_at
  before update on public.transaction_categories
  for each row
  execute function public.set_updated_at();

-- A category's parent must be in the same household as the category
-- itself — a plain FK can't express that, so it's a trigger.
create function public.check_transaction_category_parent_household()
returns trigger
language plpgsql
as $$
begin
  if new.parent_category_id is not null then
    if not exists (
      select 1 from public.transaction_categories
      where id = new.parent_category_id
        and household_id = new.household_id
    ) then
      raise exception 'transaction_categories.parent_category_id must belong to the same household';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.check_transaction_category_parent_household() is
  'Trigger: rejects a transaction_categories row whose parent_category_id belongs to a different household.';

create trigger check_transaction_category_parent_household
  before insert or update on public.transaction_categories
  for each row
  execute function public.check_transaction_category_parent_household();

alter table public.transaction_categories enable row level security;

create policy "members can view their household's categories" on public.transaction_categories
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can create categories" on public.transaction_categories
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update categories" on public.transaction_categories
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can delete categories" on public.transaction_categories
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.transaction_categories to authenticated, service_role;
