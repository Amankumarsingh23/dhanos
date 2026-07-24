-- PROMPT 14 — Recurring commitments and schedules. Turns recurring_rules
-- (schema-only since PROMPT 9) into a working feature: a proper lifecycle
-- status, auto-create/reminder configuration, a scheduled-amount-change
-- table (so "amount change from a particular date" never rewrites a
-- past occurrence — it only affects amounts resolved for occurrence
-- dates on or after its effective date), and an append-only event log
-- that is the "recurrence history" feature — created/paused/resumed/
-- skipped/ended/occurrence_generated, each a permanent fact, never
-- edited or deleted.
--
-- Occurrence generation never scans "how many periods have I missed"
-- from scratch: recurring_rules.next_due_date is a single, explicitly
-- advanced pointer (by skip_recurring_rule_occurrence /
-- generate_recurring_rule_occurrence below), each step computed by
-- src/lib/calculations/recurring-schedule.ts's occurrence-index math —
-- the same "anchor every occurrence to start_date, never to the previous
-- occurrence" approach as PROMPT 11's income-schedule.ts, so a clamped
-- short month never drags every later occurrence a day earlier.
--
-- "No duplicate occurrence is generated" (PROMPT 14 acceptance criterion)
-- is enforced structurally, not just by application code discipline: a
-- partial unique index on (recurring_rule_id, transaction_date) makes a
-- second non-cancelled occurrence on the same date for the same rule
-- impossible at the database layer, even under a race or a bug.

-- ---------------------------------------------------------------------------
-- 1. recurring_rules: status (replaces is_active), auto-create/reminder
--    configuration
-- ---------------------------------------------------------------------------

alter table public.recurring_rules add column status text;

update public.recurring_rules
set status = case when is_active then 'active' else 'ended' end;

alter table public.recurring_rules
  alter column status set not null,
  alter column status set default 'active';

alter table public.recurring_rules
  add constraint recurring_rules_status_check
  check (status in ('active', 'paused', 'ended'));

drop index if exists recurring_rules_next_due_date_idx;
alter table public.recurring_rules drop column is_active;

create index recurring_rules_next_due_date_idx
  on public.recurring_rules (next_due_date)
  where status = 'active';

alter table public.recurring_rules
  add column auto_create_mode text not null default 'reminder_only'
    check (auto_create_mode in ('reminder_only', 'planned_transaction')),
  add column reminder_lead_days smallint not null default 3
    check (reminder_lead_days >= 0);

comment on column public.recurring_rules.status is
  'Lifecycle: active (generating/reminding on schedule), paused (frozen — next_due_date does not advance while paused), ended (permanently stopped, history preserved). See PROMPT 14.';
comment on column public.recurring_rules.auto_create_mode is
  'reminder_only: due occurrences surface as upcoming/missed but never write a transaction — the household confirms each one manually. planned_transaction: generateDueOccurrencesAction creates a kind-matching transaction with status = "planned" (never "cleared") for each elapsed occurrence — PROMPT 14: "prefer generating planned occurrences or reminders rather than silently marking money as paid."';
comment on column public.recurring_rules.reminder_lead_days is
  'How many days before next_due_date this rule should surface as an upcoming commitment.';

-- ---------------------------------------------------------------------------
-- 2. recurring_rule_amount_schedules: a scheduled future amount change.
--    recurring_rules.amount_minor_units is the amount effective from
--    start_date; a row here overrides it from effective_date onward.
--    Never edited retroactively to fix history — resolveAmountForDate
--    (src/lib/calculations/recurring-schedule.ts) always resolves "the
--    amount in effect for this occurrence date" at generation time, and a
--    transaction already generated keeps its own independently-stored
--    amount forever regardless of later schedule changes.
-- ---------------------------------------------------------------------------

create table public.recurring_rule_amount_schedules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recurring_rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  effective_date date not null,
  amount_minor_units bigint not null check (amount_minor_units <> 0),
  created_at timestamptz not null default now(),
  unique (recurring_rule_id, effective_date)
);

comment on table public.recurring_rule_amount_schedules is
  'A scheduled amount change for a recurring rule, effective from a future date — PROMPT 14 "amount change from a particular date." Never affects an occurrence already generated as its own transactions row.';

create index recurring_rule_amount_schedules_household_id_idx
  on public.recurring_rule_amount_schedules (household_id);
create index recurring_rule_amount_schedules_rule_id_idx
  on public.recurring_rule_amount_schedules (recurring_rule_id);

create function public.check_recurring_rule_amount_schedule_household()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.recurring_rules
    where id = new.recurring_rule_id and household_id = new.household_id
  ) then
    raise exception 'recurring_rule_amount_schedules.recurring_rule_id must belong to the same household';
  end if;
  return new;
end;
$$;

create trigger check_recurring_rule_amount_schedule_household
  before insert or update on public.recurring_rule_amount_schedules
  for each row
  execute function public.check_recurring_rule_amount_schedule_household();

alter table public.recurring_rule_amount_schedules enable row level security;

create policy "members can view their household's amount schedules" on public.recurring_rule_amount_schedules
  for select
  using (public.is_household_member(household_id));

create policy "owners, admins, and editors can manage amount schedules" on public.recurring_rule_amount_schedules
  for all
  using (public.household_role(household_id) in ('owner', 'admin', 'editor'))
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on public.recurring_rule_amount_schedules to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. recurring_rule_events: append-only recurrence history — PROMPT 14
--    "recurrence history" feature. No update/delete policy or grant at
--    all, same convention as account_balance_snapshots.
-- ---------------------------------------------------------------------------

create table public.recurring_rule_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recurring_rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'amount_scheduled', 'paused', 'resumed', 'skipped', 'ended', 'occurrence_generated')
  ),
  -- The occurrence this event concerns — set for 'skipped' and 'occurrence_generated'.
  occurrence_date date,
  -- When a scheduled amount change takes effect — set for 'amount_scheduled'.
  effective_date date,
  previous_amount_minor_units bigint,
  new_amount_minor_units bigint,
  -- The transaction an 'occurrence_generated' event produced, if any (a
  -- reminder_only manual confirmation and a planned_transaction
  -- auto-generation both log this; a bare reminder with nothing recorded
  -- yet does not get an event at all — there being no fact to log).
  transaction_id uuid references public.transactions (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.recurring_rule_events is
  'Append-only recurrence history for one recurring_rules row — PROMPT 14 "recurrence history." Never updated or deleted; a correction is a new event, never a rewrite.';

create index recurring_rule_events_household_id_idx on public.recurring_rule_events (household_id);
create index recurring_rule_events_rule_id_idx on public.recurring_rule_events (recurring_rule_id, created_at desc);
create index recurring_rule_events_transaction_id_idx on public.recurring_rule_events (transaction_id);

create function public.check_recurring_rule_event_household()
returns trigger
language plpgsql
as $$
declare
  v_transaction_household uuid;
begin
  if not exists (
    select 1 from public.recurring_rules
    where id = new.recurring_rule_id and household_id = new.household_id
  ) then
    raise exception 'recurring_rule_events.recurring_rule_id must belong to the same household';
  end if;

  if new.transaction_id is not null then
    select household_id into v_transaction_household
    from public.transactions where id = new.transaction_id;

    if v_transaction_household is null or v_transaction_household <> new.household_id then
      raise exception 'recurring_rule_events.transaction_id must belong to the same household';
    end if;
  end if;

  return new;
end;
$$;

create trigger check_recurring_rule_event_household
  before insert on public.recurring_rule_events
  for each row
  execute function public.check_recurring_rule_event_household();

alter table public.recurring_rule_events enable row level security;

create policy "members can view their household's recurring rule events" on public.recurring_rule_events
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy at all.
create policy "owners, admins, and editors can log a recurring rule event" on public.recurring_rule_events
  for insert
  with check (public.household_role(household_id) in ('owner', 'admin', 'editor'));

grant select, insert on public.recurring_rule_events to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. No duplicate occurrence, enforced at the database layer regardless
--    of application logic — PROMPT 14 acceptance criterion.
-- ---------------------------------------------------------------------------

create unique index transactions_recurring_rule_occurrence_uidx
  on public.transactions (recurring_rule_id, transaction_date)
  where recurring_rule_id is not null and status <> 'cancelled';

comment on index public.transactions_recurring_rule_occurrence_uidx is
  'At most one non-cancelled transaction per (recurring_rule_id, transaction_date) — a rule can never generate the same occurrence twice, even under a race or a bug. PROMPT 14 acceptance criterion "No duplicate occurrence is generated."';

-- ---------------------------------------------------------------------------
-- 5. RPCs: each is one atomic write spanning recurring_rules +
--    recurring_rule_events (+ transactions for generation) — PostgREST
--    cannot span a client-visible transaction across two REST calls
--    (docs/data-access-patterns.md step 5), so each of these three
--    related writes must happen inside one Postgres function.
-- ---------------------------------------------------------------------------

-- Pauses or resumes a rule: updates status and logs the event together.
create function public.set_recurring_rule_status(
  p_household_id uuid,
  p_recurring_rule_id uuid,
  p_status text,
  p_event_type text,
  p_notes text default null
)
returns public.recurring_rules
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rule public.recurring_rules;
begin
  update public.recurring_rules
  set status = p_status
  where id = p_recurring_rule_id and household_id = p_household_id
  returning * into v_rule;

  if v_rule.id is null then
    raise exception 'Recurring rule not found';
  end if;

  insert into public.recurring_rule_events
    (household_id, recurring_rule_id, event_type, notes)
  values
    (p_household_id, p_recurring_rule_id, p_event_type, p_notes);

  return v_rule;
end;
$$;

comment on function public.set_recurring_rule_status(uuid, uuid, text, text, text) is
  'Atomically updates a recurring rule''s status and logs the transition as a recurring_rule_events row (pause/resume/end). See PROMPT 14.';

-- Skips one occurrence: logs the skip against the rule's current
-- next_due_date, then advances next_due_date to p_next_due_date (computed
-- by the caller via computeNextOccurrenceAfter) — no transaction written.
create function public.skip_recurring_rule_occurrence(
  p_household_id uuid,
  p_recurring_rule_id uuid,
  p_occurrence_date date,
  -- Nullable, matching recurring_rules.next_due_date itself (a rule with
  -- an end_date can run out of future occurrences) — default null so a
  -- caller passing an explicit JS `undefined` for a rule that just ended
  -- omits the key rather than needing a non-null value it doesn't have.
  p_next_due_date date default null,
  p_notes text default null
)
returns public.recurring_rules
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rule public.recurring_rules;
begin
  update public.recurring_rules
  set next_due_date = p_next_due_date
  where id = p_recurring_rule_id and household_id = p_household_id
  returning * into v_rule;

  if v_rule.id is null then
    raise exception 'Recurring rule not found';
  end if;

  insert into public.recurring_rule_events
    (household_id, recurring_rule_id, event_type, occurrence_date, notes)
  values
    (p_household_id, p_recurring_rule_id, 'skipped', p_occurrence_date, p_notes);

  return v_rule;
end;
$$;

comment on function public.skip_recurring_rule_occurrence(uuid, uuid, date, date, text) is
  'Atomically logs a skipped occurrence and advances next_due_date past it — no transaction is written for a skipped occurrence. See PROMPT 14.';

-- Records one occurrence (manual confirmation, or one step of
-- auto-generation): writes the transaction, advances next_due_date, and
-- logs the event together. p_transaction_id is null when p_write_transaction
-- is false — used for the reminder_only "just acknowledge, don't post a
-- number" path only if ever needed; in practice every occurrence this app
-- records does write a transaction, since a bare reminder that nothing
-- happened logs no event at all.
-- Parameter order: every argument without a natural "no value" case comes
-- first; everything that mirrors a nullable recurring_rules/transactions
-- column (next_due_date, transfer_account_id, category_id, counterparty,
-- related_person_id) is grouped at the end with `default null` — Postgres
-- requires defaulted parameters to trail in the declaration, but every
-- call site here uses supabase-js's named-argument RPC calling convention
-- (an object, not positional args), so this order is free to differ from
-- the transactions table's own column order.
create function public.record_recurring_rule_occurrence(
  p_household_id uuid,
  p_recurring_rule_id uuid,
  p_occurrence_date date,
  p_kind text,
  p_amount_minor_units bigint,
  p_currency_code text,
  p_account_id uuid,
  p_description text,
  p_status text,
  p_next_due_date date default null,
  p_transfer_account_id uuid default null,
  p_category_id uuid default null,
  p_counterparty text default null,
  p_related_person_id uuid default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions;
  v_rule public.recurring_rules;
begin
  insert into public.transactions (
    household_id, kind, amount_minor_units, currency_code, transaction_date,
    account_id, transfer_account_id, category_id, counterparty, description,
    status, source_type, recurring_rule_id, related_person_id
  )
  values (
    p_household_id, p_kind, p_amount_minor_units, p_currency_code, p_occurrence_date,
    p_account_id, p_transfer_account_id, p_category_id, p_counterparty, p_description,
    p_status, 'recurring', p_recurring_rule_id, p_related_person_id
  )
  returning * into v_transaction;

  update public.recurring_rules
  set next_due_date = p_next_due_date, last_generated_date = p_occurrence_date
  where id = p_recurring_rule_id and household_id = p_household_id
  returning * into v_rule;

  if v_rule.id is null then
    raise exception 'Recurring rule not found';
  end if;

  insert into public.recurring_rule_events
    (household_id, recurring_rule_id, event_type, occurrence_date, transaction_id)
  values
    (p_household_id, p_recurring_rule_id, 'occurrence_generated', p_occurrence_date, v_transaction.id);

  return v_transaction;
end;
$$;

comment on function public.record_recurring_rule_occurrence(uuid, uuid, date, text, bigint, text, uuid, text, text, date, uuid, uuid, text, uuid) is
  'Atomically writes one occurrence''s transaction, advances the rule''s next_due_date past it, and logs the event — the transactions_recurring_rule_occurrence_uidx unique index is the hard backstop against ever doing this twice for the same date. source_type = "recurring" regardless of whether a human clicked "record" or generateDueOccurrencesAction did it automatically. See PROMPT 14.';

grant execute on function public.set_recurring_rule_status(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.skip_recurring_rule_occurrence(uuid, uuid, date, date, text) to authenticated, service_role;
grant execute on function public.record_recurring_rule_occurrence(uuid, uuid, date, text, bigint, text, uuid, text, text, date, uuid, uuid, text, uuid) to authenticated, service_role;
