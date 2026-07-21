-- institutions: a bank, wallet provider, investment platform, insurer,
-- lender, employer, business, government body, or staking platform a
-- household deals with (see docs/financial-domain-model.md §2).

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  institution_type text not null check (
    institution_type in (
      'bank', 'wallet', 'investment_platform', 'insurer', 'lender',
      'employer', 'business', 'government', 'staking_platform', 'other'
    )
  ),
  website text,
  -- Free-text support info (phone/email/hours) rather than structured
  -- contact fields — no product requirement yet for anything richer.
  support_info text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.institutions is
  'A bank, wallet, investment platform, insurer, lender, employer, business, government body, or staking platform. See docs/financial-domain-model.md §2.';

create index institutions_household_id_idx on public.institutions (household_id);

create unique index institutions_household_name_idx
  on public.institutions (household_id, lower(name));

create trigger set_updated_at
  before update on public.institutions
  for each row
  execute function public.set_updated_at();

alter table public.institutions enable row level security;

create policy "members can view their household's institutions" on public.institutions
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add institutions" on public.institutions
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update institutions" on public.institutions
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners and admins can delete institutions" on public.institutions
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.institutions to authenticated, service_role;
