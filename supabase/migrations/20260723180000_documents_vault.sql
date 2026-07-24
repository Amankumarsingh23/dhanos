-- documents: the financial documents vault (PROMPT 34) — a household-wide,
-- browsable store of statements, policies, receipts, and other paperwork,
-- distinct from `attachments`. `attachments` stays exactly as it is (a
-- lightweight file reference glued to one specific entity row, e.g. a
-- transaction's receipt or an asset's deed); `documents` is its own table
-- because the vault needs fields attachments was never built to carry —
-- a fixed `category` taxonomy, `document_date`/`expiry_date`, a
-- user-toggleable `status`, and a `checksum` — and because a vault document
-- is often *not* tied to any single entity at all (a PAN card, a will).
--
-- entity_type/entity_id is therefore a *loose*, informational link — unlike
-- attachments' attachable_type/attachable_id, it is not integrity-checked
-- by a trigger against the referenced table. The vault's entity set is
-- open-ended (any household-scoped record a user might want to file a
-- document under) rather than attachments' small, closed set, so a
-- polymorphic FK trigger here would just be a case statement chasing every
-- table in the schema for no real safety gain — RLS on this table already
-- scopes every row to the household regardless of what entity_type/entity_id
-- claim.
--
-- Reuses the existing private 'documents' Storage bucket and its
-- household-scoped RLS policies (supabase/migrations/20260721120000_
-- expense_management.sql) — those policies only ever trust the first path
-- segment (cast to the household id), so they apply unchanged to this
-- table's own path convention:
--   householdId/entityType/entityId/documentId/originalFilename
-- (entityType/entityId are the literal string 'general' and the household
-- id itself for a document with no entity link, so the path shape never
-- needs a conditional). See docs/security-model.md §5: only the storage
-- path is stored here, never file bytes or a public URL.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  original_filename text not null check (char_length(btrim(original_filename)) > 0),
  display_name text not null check (char_length(btrim(display_name)) > 0),
  mime_type text not null check (char_length(btrim(mime_type)) > 0),
  size_bytes bigint not null check (size_bytes >= 0),
  storage_bucket text not null default 'documents' check (char_length(btrim(storage_bucket)) > 0),
  storage_path text not null check (char_length(btrim(storage_path)) > 0),
  category text not null check (
    category in (
      'bank_statement',
      'salary_slip',
      'loan_agreement',
      'education_loan_document',
      'insurance_policy',
      'premium_receipt',
      'claim_document',
      'investment_statement',
      'tax_document',
      'property_paper',
      'valuation_report',
      'lending_agreement',
      'nominee_record',
      'invoice',
      'receipt',
      'identity_document',
      'other'
    )
  ),
  entity_type text,
  entity_id uuid,
  document_date date,
  expiry_date date,
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  -- Both set or both null — never a dangling type with no id or vice versa.
  check ((entity_type is null) = (entity_id is null))
);

comment on table public.documents is
  'The financial documents vault (PROMPT 34) — household-wide document storage with a fixed category taxonomy, independent of the per-entity attachments table. See the file header comment in this migration for why the two are separate.';
comment on column public.documents.storage_path is
  'Path within storage_bucket, not a public URL — resolve to a signed URL at read time, same convention as attachments.storage_path.';
comment on column public.documents.entity_type is
  'A loose, informational link to another household record (e.g. "asset") — NOT integrity-checked against the referenced table, unlike attachments.attachable_type. Null (with entity_id) for a document that stands on its own.';
comment on column public.documents.checksum is
  'SHA-256 hex digest computed client-side before upload, where practical, for integrity verification. Nullable — not every upload path may be able to compute it.';

create index documents_household_id_idx on public.documents (household_id);
create index documents_entity_idx on public.documents (entity_type, entity_id);
create index documents_category_idx on public.documents (household_id, category);
create index documents_status_idx on public.documents (household_id, status);

create trigger set_updated_at
  before update on public.documents
  for each row
  execute function public.set_updated_at();

alter table public.documents enable row level security;

create policy "members can view their household's documents" on public.documents
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add documents" on public.documents
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update documents" on public.documents
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- Deliberately narrower than insert/update: permanently deleting a document
-- (as opposed to archiving it, an ordinary update) is restricted to owners
-- and admins — see "deliberate permanent deletion" in the PROMPT 34 brief,
-- and the same pattern for deleteAssetAction in src/features/assets/actions.ts.
create policy "owners and admins can delete documents" on public.documents
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.documents to authenticated, service_role;
