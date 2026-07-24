-- investment_documents: PROMPT 16 — a Supabase Storage object reference
-- for investment-specific documents (a broker/registrar statement, a
-- contract note, a certificate, a tax document) — kept as its own table
-- per PROMPT 16's explicit table list, rather than extending the generic
-- public.attachments table's attachable_type (see docs/database-plan.md §6
-- open question 2 and docs/financial-domain-model.md §8 for why that
-- table's polymorphic pattern was left for a "small follow-up migration"
-- rather than assumed here).
--
-- Unlike attachments' polymorphic attachable_type/attachable_id pair, this
-- table links via three plain, explicit nullable FKs — the investing
-- domain has exactly three sensible link targets (a whole platform
-- account, one holding, or the valuation snapshot a statement backs up),
-- known up front, so a plain-FK-plus-CHECK shape is simpler here than the
-- trigger-validated polymorphic pattern attachments needs for its more
-- open-ended, growing set of attachable entities.

create table public.investment_documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  investment_account_id uuid references public.investment_accounts (id) on delete cascade,
  investment_holding_id uuid references public.investment_holdings (id) on delete cascade,
  investment_valuation_snapshot_id uuid references public.investment_valuation_snapshots (id) on delete cascade,
  document_type text not null check (
    document_type in ('statement', 'contract_note', 'certificate', 'tax_document', 'other')
  ),
  storage_bucket text not null default 'documents' check (char_length(btrim(storage_bucket)) > 0),
  storage_path text not null check (char_length(btrim(storage_path)) > 0),
  file_name text not null check (char_length(btrim(file_name)) > 0),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  -- The statement/document's own date (issue date, period-end date) —
  -- distinct from created_at (when it was uploaded to DhanOS).
  document_date date,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  constraint investment_documents_has_a_target check (
    investment_account_id is not null
    or investment_holding_id is not null
    or investment_valuation_snapshot_id is not null
  )
);

comment on table public.investment_documents is
  'A Supabase Storage object reference for an investment-specific document (statement/contract note/certificate/tax document), linked to a platform account, a holding, and/or the valuation snapshot it backs. Only the storage path is stored, never file bytes or a public URL — resolve to a short-lived signed URL at read time, same pattern as public.attachments. See PROMPT 16.';

create index investment_documents_household_id_idx on public.investment_documents (household_id);
create index investment_documents_investment_account_id_idx on public.investment_documents (investment_account_id);
create index investment_documents_investment_holding_id_idx on public.investment_documents (investment_holding_id);
create index investment_documents_investment_valuation_snapshot_id_idx on public.investment_documents (investment_valuation_snapshot_id);

create trigger set_updated_at
  before update on public.investment_documents
  for each row
  execute function public.set_updated_at();

create function public.check_investment_document_household_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.investment_account_id is not null and not exists (
    select 1 from public.investment_accounts
    where id = new.investment_account_id and household_id = new.household_id
  ) then
    raise exception 'investment_documents.investment_account_id must belong to the same household';
  end if;

  if new.investment_holding_id is not null and not exists (
    select 1 from public.investment_holdings
    where id = new.investment_holding_id and household_id = new.household_id
  ) then
    raise exception 'investment_documents.investment_holding_id must belong to the same household';
  end if;

  if new.investment_valuation_snapshot_id is not null and not exists (
    select 1 from public.investment_valuation_snapshots
    where id = new.investment_valuation_snapshot_id and household_id = new.household_id
  ) then
    raise exception 'investment_documents.investment_valuation_snapshot_id must belong to the same household';
  end if;

  return new;
end;
$$;

comment on function public.check_investment_document_household_consistency() is
  'Trigger: rejects an investment_documents row whose investment_account_id/investment_holding_id/investment_valuation_snapshot_id belongs to a different household.';

create trigger check_investment_document_household_consistency
  before insert or update on public.investment_documents
  for each row
  execute function public.check_investment_document_household_consistency();

alter table public.investment_documents enable row level security;

create policy "members can view their household's investment documents" on public.investment_documents
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add investment documents" on public.investment_documents
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update investment documents" on public.investment_documents
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can delete investment documents" on public.investment_documents
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.investment_documents to authenticated, service_role;
