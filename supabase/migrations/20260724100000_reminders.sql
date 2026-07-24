-- reminders: the financial calendar (PROMPT 35) — one row per dated
-- obligation *occurrence* a household should act on: an SIP contribution,
-- an EMI, an insurance premium or renewal, a periodic review, a document
-- expiring, an FD maturing, and so on. A reminder is never itself a
-- financial fact — it is a household-visible nudge, generated from other
-- tables' own dates and *only ever* tracks whether the household
-- acknowledged the nudge (completed/skipped/snoozed), never whether the
-- underlying obligation was actually paid. "Do not mark an obligation paid
-- merely because its reminder was completed" (PROMPT 35 brief) is therefore
-- true structurally: completing a reminder is a single-column UPDATE on
-- this table alone (see completeReminderAction,
-- src/features/reminders/actions.ts) — it never writes to loans,
-- investment_sips, insurance_policies, or any other source table.
--
-- Generation (src/features/reminders/sync.ts) is idempotent: it computes
-- candidate (reminder_type, entity_type, entity_id, due_date) tuples from
-- each source table's own dates within a bounded window and upserts them
-- with `ignoreDuplicates`, relying on the unique constraint below —
-- exactly the "no duplicate occurrence" role
-- transactions_recurring_rule_occurrence_uidx plays for recurring_rules
-- (see supabase/migrations/20260721140000_recurring_commitments.sql).
-- "Recurring reminders do not duplicate" (PROMPT 35 acceptance criterion)
-- rests on this constraint, not on application-layer care alone.
--
-- entity_type/entity_id is a *closed*, trigger-verified set (like
-- attachments.attachable_type/attachable_id), not a loose informational
-- pair (like documents.entity_type/entity_id) — every reminder row
-- genuinely originates from one specific real row, so verifying it exists
-- and belongs to the same household is both cheap (ten known entity types)
-- and worth doing. One entity_type, 'household', has no real per-row
-- target (a monthly-closing reminder exists precisely because the closing
-- row does *not* yet exist) — its convention is entity_id = household_id,
-- a legitimate always-valid self-reference, so entity_id can stay NOT NULL
-- universally and the dedup unique constraint never has to special-case a
-- NULL column (NULLs are pairwise distinct in a unique constraint, which
-- would silently defeat dedup for that one entity_type otherwise).

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  reminder_type text not null check (
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
      'asset_valuation_review'
    )
  ),
  entity_type text not null check (
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
      'household'
    )
  ),
  entity_id uuid not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  -- While set and >= today, an otherwise-active reminder is excluded from
  -- the upcoming/overdue views — no separate 'snoozed' status value, so
  -- there is only one place ("is this date still in the future") that can
  -- disagree with itself.
  snoozed_until date,
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, reminder_type, entity_type, entity_id, due_date)
);

comment on table public.reminders is
  'The financial calendar (PROMPT 35) — generated occurrences of dated obligations across every other module. Tracks only acknowledgement (pending/completed/skipped/snoozed_until), never payment. See this migration''s header comment.';
comment on column public.reminders.entity_id is
  'For entity_type = ''household'', always equals household_id (a self-reference — monthly-closing reminders have no real per-row target since the closing does not exist yet). Otherwise the real id of the row named by entity_type, trigger-verified below.';
comment on column public.reminders.status is
  'pending (default) / completed / skipped — all three are exclusively user-initiated. Never set by anything that also writes to a source table.';

create index reminders_household_id_idx on public.reminders (household_id);
create index reminders_household_status_due_idx on public.reminders (household_id, status, due_date);
create index reminders_entity_idx on public.reminders (entity_type, entity_id);

create trigger set_updated_at
  before update on public.reminders
  for each row
  execute function public.set_updated_at();

-- Validates entity_id exists, in the table named by entity_type, and
-- belongs to the same household as the reminder row — same shape as
-- public.check_attachment_target(), extended with the 'household'
-- self-reference case described above.
create function public.check_reminder_target()
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
  else
    -- Unreachable given the entity_type CHECK constraint; guards against
    -- the check and this trigger drifting apart in a future edit.
    raise exception 'unsupported reminders.entity_type: %', new.entity_type;
  end if;

  return new;
end;
$$;

comment on function public.check_reminder_target() is
  'Trigger: validates reminders.entity_id exists in the table named by entity_type (or equals household_id for entity_type = household) and belongs to the same household. Extend with a new branch when a new entity_type is added.';

create trigger check_reminder_target
  before insert or update on public.reminders
  for each row
  execute function public.check_reminder_target();

alter table public.reminders enable row level security;

create policy "members can view their household's reminders" on public.reminders
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can add reminders" on public.reminders
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can update reminders" on public.reminders
  for update
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

create policy "owners, admins, and editors can delete reminders" on public.reminders
  for delete
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.reminders to authenticated, service_role;

-- financial_accounts.maturity_date: needed for the fixed-deposit-maturity
-- reminder type — no existing column anywhere in the schema captures this
-- (fixed deposits are also modelable as investment_assets.asset_class =
-- 'fixed_deposit', which likewise has no maturity field; financial_accounts
-- is the more natural home since a maturing FD returns cash to an account).
-- Nullable and meaningful regardless of account_type at the schema layer,
-- UI-gated to 'fixed_deposit'/'recurring_deposit' — same "nullable
-- regardless of type, UI decides" convention as loans' education fields.
alter table public.financial_accounts
  add column maturity_date date;

comment on column public.financial_accounts.maturity_date is
  'For fixed_deposit/recurring_deposit accounts: when the deposit matures. Nullable and unused for every other account_type. Added PROMPT 35 for the fixed-deposit-maturity reminder.';
