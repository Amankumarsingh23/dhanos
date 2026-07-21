-- attachments: a file (Supabase Storage object reference) attached to a
-- financial_account or a transaction (see docs/financial-domain-model.md
-- §8, docs/database-plan.md §6 item 2). Postgres has no first-class
-- polymorphic FK, so attachable_type/attachable_id integrity is enforced
-- by trigger rather than a plain foreign key — attachable_type is
-- restricted by CHECK to the entity types that exist today; extending it
-- to future attachable entities (loans, insurance policies, assets) is a
-- small follow-up migration that adds a case branch to the trigger below.
--
-- Only the storage path is stored here, never file bytes or a public
-- URL — resolve to a short-lived signed URL at read time, same pattern as
-- profiles.avatar_path (see docs/security-model.md §5).

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  attachable_type text not null check (attachable_type in ('financial_account', 'transaction')),
  attachable_id uuid not null,
  storage_bucket text not null default 'documents' check (char_length(btrim(storage_bucket)) > 0),
  storage_path text not null check (char_length(btrim(storage_path)) > 0),
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

comment on table public.attachments is
  'A Supabase Storage object reference attached to a financial_account or transaction. attachable_type/attachable_id integrity is trigger-enforced, not a plain FK (Postgres has no polymorphic FK). See docs/financial-domain-model.md §8.';
comment on column public.attachments.storage_path is
  'Path within storage_bucket, not a public URL — resolve to a signed URL at read time.';

create index attachments_household_id_idx on public.attachments (household_id);
create index attachments_attachable_idx on public.attachments (attachable_type, attachable_id);

create trigger set_updated_at
  before update on public.attachments
  for each row
  execute function public.set_updated_at();

-- Validates attachable_id exists, in the table named by attachable_type,
-- and belongs to the same household as the attachment row.
create function public.check_attachment_target()
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

create trigger check_attachment_target
  before insert or update on public.attachments
  for each row
  execute function public.check_attachment_target();

alter table public.attachments enable row level security;

create policy "members can view their household's attachments" on public.attachments
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add attachments" on public.attachments
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update attachments" on public.attachments
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can delete attachments" on public.attachments
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.attachments to authenticated, service_role;
