-- people: anyone relevant to a household's financial picture, whether or
-- not they ever sign in — the household member themself, a parent,
-- sibling, spouse, dependant, lender, borrower, nominee, or co-owner (see
-- docs/financial-domain-model.md §1-2). Resolves the "member with no
-- login" gap noted in the earlier domain-model draft: a dependant child or
-- a private lender is a people row with user_id null.
--
-- Deliberately minimal (see docs/product-scope.md and the PROMPT 6 brief,
-- "avoid unnecessarily sensitive information in v1") — no government IDs,
-- no contact details beyond what the relationship_type itself implies.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) > 0),
  relationship_type text not null check (
    relationship_type in (
      'self', 'parent', 'sibling', 'spouse', 'dependant',
      'lender', 'borrower', 'nominee', 'co_owner', 'other'
    )
  ),
  -- The auth.users identity this person corresponds to, if any. Nullable:
  -- most relationship types (a dependant, an external lender) never have
  -- one. ON DELETE SET NULL: if the linked account is removed, the person
  -- row (and anything owned by it) persists.
  user_id uuid references auth.users (id) on delete set null,
  birth_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.people is
  'Anyone relevant to a household''s finances, with or without a login. See docs/financial-domain-model.md §2.';
comment on column public.people.user_id is
  'The auth.users row this person corresponds to, if they have a login. Most rows (dependants, external lenders) leave this null.';

create index people_household_id_idx on public.people (household_id);
create index people_user_id_idx on public.people (user_id);

-- One people row per (household, linked user) — a logged-in member should
-- not be representable twice in the same household's people list.
create unique index people_household_user_idx
  on public.people (household_id, user_id)
  where user_id is not null;

create trigger set_updated_at
  before update on public.people
  for each row
  execute function public.set_updated_at();

alter table public.people enable row level security;

create policy "members can view their household's people" on public.people
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add people" on public.people
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update people" on public.people
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete people" on public.people
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.people to authenticated, service_role;
