-- decision_journal_entries: the financial decision journal (PROMPT 37) —
-- one row per significant financial decision (starting a SIP, lending
-- money, taking a loan, buying insurance, purchasing an asset, pausing an
-- investment, a loan prepayment, ...), capturing the reasoning *at the
-- time the decision was made*, not just its outcome.
--
-- "Original rationale remains preserved" (PROMPT 37 acceptance criterion)
-- is enforced structurally, not just by convention: the trigger below
-- rejects any UPDATE that touches title/decision_date/amount/currency/
-- entity link/context/choice/alternatives/rationale/expected_result/risks
-- once a row exists — only status, review_date, actual_outcome, and
-- lessons_learned may ever change after creation. A household that wants
-- to revise its original thinking records a *new* entry (optionally
-- superseding this one via create_decision_journal_entry below), it never
-- edits the old one's stated reasoning in hindsight.
--
-- entity_type/entity_id is a closed, trigger-verified set (like
-- attachments/reminders, not documents' looser pair) — every decision
-- example in the PROMPT 37 brief maps to one of these seven real entity
-- tables, so verifying the link exists and belongs to the household is
-- cheap and worth doing. Nullable as a pair: a decision need not be tied
-- to one specific existing record.

create table public.decision_journal_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  decision_date date not null,
  amount_minor_units bigint check (amount_minor_units is null or amount_minor_units >= 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  entity_type text check (
    entity_type in (
      'financial_account',
      'investment_sip',
      'loan',
      'lending',
      'asset',
      'goal',
      'insurance_policy'
    )
  ),
  entity_id uuid,
  context text,
  choice text not null check (char_length(btrim(choice)) > 0),
  alternatives text,
  rationale text not null check (char_length(btrim(rationale)) > 0),
  expected_result text,
  risks text,
  review_date date,
  actual_outcome text,
  lessons_learned text,
  status text not null default 'open' check (
    status in ('open', 'decided', 'under_review', 'reversed', 'superseded')
  ),
  -- Points at the *older* entry this one replaces — the older row's
  -- status is flipped to 'superseded' atomically by
  -- create_decision_journal_entry() below, same "new row links back,
  -- create call flips the old row's status" shape as
  -- insurance_policies.previous_policy_id / create_insurance_policy().
  supersedes_entry_id uuid references public.decision_journal_entries (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((entity_type is null) = (entity_id is null)),
  check ((amount_minor_units is null) = (currency_code is null))
);

comment on table public.decision_journal_entries is
  'The financial decision journal (PROMPT 37) — title/context/choice/alternatives/rationale/expected_result/risks are write-once (see enforce_decision_journal_immutability below); only status/review_date/actual_outcome/lessons_learned may change after creation.';
comment on column public.decision_journal_entries.entity_type is
  'A closed, trigger-verified link to the real record this decision was about (unlike documents.entity_type, which is a loose, open-ended pair) — see check_decision_journal_target below.';
comment on column public.decision_journal_entries.supersedes_entry_id is
  'The older decision this one replaces, if any. The older row is never edited or deleted — only its status flips to ''superseded'', atomically, by create_decision_journal_entry(). "Superseding does not erase history."';

create index decision_journal_entries_household_id_idx on public.decision_journal_entries (household_id);
create index decision_journal_entries_entity_idx on public.decision_journal_entries (entity_type, entity_id);
create index decision_journal_entries_status_idx on public.decision_journal_entries (household_id, status);
create index decision_journal_entries_review_date_idx
  on public.decision_journal_entries (review_date)
  where review_date is not null;

-- At most one entry may claim to supersede a given older entry — keeps the
-- supersession chain a clean linked list, never a fork.
create unique index decision_journal_entries_supersedes_uidx
  on public.decision_journal_entries (supersedes_entry_id)
  where supersedes_entry_id is not null;

create trigger set_updated_at
  before update on public.decision_journal_entries
  for each row
  execute function public.set_updated_at();

-- "Original rationale remains preserved": rejects any update that touches
-- a write-once field. Only status/review_date/actual_outcome/
-- lessons_learned (plus updated_at, maintained by the trigger above) may
-- ever differ from the row as first inserted.
create function public.enforce_decision_journal_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.household_id is distinct from old.household_id
    or new.title is distinct from old.title
    or new.decision_date is distinct from old.decision_date
    or new.amount_minor_units is distinct from old.amount_minor_units
    or new.currency_code is distinct from old.currency_code
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.context is distinct from old.context
    or new.choice is distinct from old.choice
    or new.alternatives is distinct from old.alternatives
    or new.rationale is distinct from old.rationale
    or new.expected_result is distinct from old.expected_result
    or new.risks is distinct from old.risks
    or new.supersedes_entry_id is distinct from old.supersedes_entry_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception
      'decision_journal_entries: title/decision_date/amount/entity link/context/choice/alternatives/rationale/expected_result/risks cannot be changed once recorded — record a new entry (optionally superseding this one) instead of editing the original.';
  end if;
  return new;
end;
$$;

comment on function public.enforce_decision_journal_immutability() is
  'Trigger: rejects any update to decision_journal_entries'' write-once fields. Only status/review_date/actual_outcome/lessons_learned may change after a row is created — "original rationale remains preserved" (PROMPT 37).';

create trigger enforce_decision_journal_immutability
  before update on public.decision_journal_entries
  for each row
  execute function public.enforce_decision_journal_immutability();

-- Validates entity_id (when set) exists, in the table named by
-- entity_type, and belongs to the same household — same shape as
-- check_attachment_target()/check_reminder_target().
create function public.check_decision_journal_target()
returns trigger
language plpgsql
as $$
begin
  if new.entity_type is null then
    return new;
  elsif new.entity_type = 'financial_account' then
    if not exists (
      select 1 from public.financial_accounts
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference a financial_accounts row in the same household';
    end if;
  elsif new.entity_type = 'investment_sip' then
    if not exists (
      select 1 from public.investment_sips
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference an investment_sips row in the same household';
    end if;
  elsif new.entity_type = 'loan' then
    if not exists (
      select 1 from public.loans
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference a loans row in the same household';
    end if;
  elsif new.entity_type = 'lending' then
    if not exists (
      select 1 from public.lendings
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference a lendings row in the same household';
    end if;
  elsif new.entity_type = 'asset' then
    if not exists (
      select 1 from public.assets
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference an assets row in the same household';
    end if;
  elsif new.entity_type = 'goal' then
    if not exists (
      select 1 from public.goals
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference a goals row in the same household';
    end if;
  elsif new.entity_type = 'insurance_policy' then
    if not exists (
      select 1 from public.insurance_policies
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'decision_journal_entries.entity_id must reference an insurance_policies row in the same household';
    end if;
  else
    raise exception 'unsupported decision_journal_entries.entity_type: %', new.entity_type;
  end if;

  return new;
end;
$$;

comment on function public.check_decision_journal_target() is
  'Trigger: validates decision_journal_entries.entity_id exists in the table named by entity_type and belongs to the same household, when entity_type is set. Extend with a new branch when a new entity_type is added.';

create trigger check_decision_journal_target
  before insert on public.decision_journal_entries
  for each row
  execute function public.check_decision_journal_target();

alter table public.decision_journal_entries enable row level security;

create policy "members can view their household's decisions" on public.decision_journal_entries
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add decisions" on public.decision_journal_entries
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update decisions" on public.decision_journal_entries
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

-- Narrower than insert/update, same "deliberate permanent deletion"
-- reasoning as documents/assets — in practice the UI only ever offers
-- deletion for a still-'open' draft entry that was never finalized;
-- anything decided/reversed/superseded is never deleted, only superseded.
create policy "owners and admins can delete decisions" on public.decision_journal_entries
  for delete
  using (public.household_role(household_id) in ('owner', 'admin'));

grant select, insert, update, delete on public.decision_journal_entries to authenticated, service_role;

-- Atomically creates a decision entry and, when p_supersedes_entry_id is
-- given, flips that older entry's status to 'superseded' in the same
-- call — same shape as create_insurance_policy()'s renewal handling. The
-- older row's own content is never touched by this (or any) UPDATE, only
-- its status column.
create function public.create_decision_journal_entry(
  p_household_id uuid,
  p_title text,
  p_decision_date date,
  p_choice text,
  p_rationale text,
  p_status text default 'decided',
  p_amount_minor_units bigint default null,
  p_currency_code text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_context text default null,
  p_alternatives text default null,
  p_expected_result text default null,
  p_risks text default null,
  p_review_date date default null,
  p_supersedes_entry_id uuid default null
)
returns public.decision_journal_entries
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_entry public.decision_journal_entries;
begin
  insert into public.decision_journal_entries (
    household_id, title, decision_date, choice, rationale, status,
    amount_minor_units, currency_code, entity_type, entity_id,
    context, alternatives, expected_result, risks, review_date,
    supersedes_entry_id
  )
  values (
    p_household_id, p_title, p_decision_date, p_choice, p_rationale, p_status,
    p_amount_minor_units, p_currency_code, p_entity_type, p_entity_id,
    p_context, p_alternatives, p_expected_result, p_risks, p_review_date,
    p_supersedes_entry_id
  )
  returning * into v_entry;

  if p_supersedes_entry_id is not null then
    update public.decision_journal_entries
    set status = 'superseded'
    where id = p_supersedes_entry_id and household_id = p_household_id;

    if not found then
      raise exception 'decision_journal_entries.supersedes_entry_id must reference a decision in the same household';
    end if;
  end if;

  return v_entry;
end;
$$;

comment on function public.create_decision_journal_entry(uuid, text, date, text, text, text, bigint, text, text, uuid, text, text, text, text, date, uuid) is
  'Atomically creates a decision journal entry and, when p_supersedes_entry_id is given, flips that older entry''s status to superseded in the same call — its own content is never edited. See PROMPT 37.';

grant execute on function public.create_decision_journal_entry(uuid, text, date, text, text, text, bigint, text, text, uuid, text, text, text, text, date, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Reminders integration: "review date creates a reminder" (PROMPT 37
-- acceptance criterion). Widens reminders' reminder_type/entity_type
-- CHECK constraints the same way attachments.attachable_type has been
-- extended four times before (drop + re-add under the same
-- auto-generated constraint name) — see e.g.
-- supabase/migrations/20260723110000_assets.sql.
-- ---------------------------------------------------------------------

alter table public.reminders
  drop constraint reminders_reminder_type_check;

alter table public.reminders
  add constraint reminders_reminder_type_check
  check (
    reminder_type in (
      'sip_due',
      'emi_due',
      'insurance_premium',
      'policy_renewal',
      'loan_review',
      'expected_income',
      'lending_repayment',
      'document_expiry',
      'fixed_deposit_maturity',
      'goal_review',
      'monthly_closing',
      'asset_valuation_review',
      'decision_review'
    )
  );

alter table public.reminders
  drop constraint reminders_entity_type_check;

alter table public.reminders
  add constraint reminders_entity_type_check
  check (
    entity_type in (
      'investment_sip',
      'loan',
      'insurance_policy',
      'income_source',
      'lending',
      'document',
      'financial_account',
      'goal',
      'asset',
      'household',
      'decision_journal_entry'
    )
  );

-- Extends check_reminder_target() with the new entity_type branch — same
-- CREATE OR REPLACE convention as every prior extension of this function
-- (its signature is unchanged, only the body grows a branch).
create or replace function public.check_reminder_target()
returns trigger
language plpgsql
as $$
begin
  if new.entity_type = 'household' then
    if new.entity_id <> new.household_id then
      raise exception 'reminders.entity_id must equal household_id when entity_type is ''household''';
    end if;
  elsif new.entity_type = 'investment_sip' then
    if not exists (
      select 1 from public.investment_sips
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference an investment_sips row in the same household';
    end if;
  elsif new.entity_type = 'loan' then
    if not exists (
      select 1 from public.loans
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a loans row in the same household';
    end if;
  elsif new.entity_type = 'insurance_policy' then
    if not exists (
      select 1 from public.insurance_policies
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference an insurance_policies row in the same household';
    end if;
  elsif new.entity_type = 'income_source' then
    if not exists (
      select 1 from public.income_sources
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference an income_sources row in the same household';
    end if;
  elsif new.entity_type = 'lending' then
    if not exists (
      select 1 from public.lendings
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a lendings row in the same household';
    end if;
  elsif new.entity_type = 'document' then
    if not exists (
      select 1 from public.documents
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a documents row in the same household';
    end if;
  elsif new.entity_type = 'financial_account' then
    if not exists (
      select 1 from public.financial_accounts
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a financial_accounts row in the same household';
    end if;
  elsif new.entity_type = 'goal' then
    if not exists (
      select 1 from public.goals
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a goals row in the same household';
    end if;
  elsif new.entity_type = 'asset' then
    if not exists (
      select 1 from public.assets
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference an assets row in the same household';
    end if;
  elsif new.entity_type = 'decision_journal_entry' then
    if not exists (
      select 1 from public.decision_journal_entries
      where id = new.entity_id and household_id = new.household_id
    ) then
      raise exception 'reminders.entity_id must reference a decision_journal_entries row in the same household';
    end if;
  else
    raise exception 'unsupported reminders.entity_type: %', new.entity_type;
  end if;

  return new;
end;
$$;
