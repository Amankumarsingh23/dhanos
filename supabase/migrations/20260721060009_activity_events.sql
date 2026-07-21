-- activity_events: an append-only, household-scoped log of notable
-- actions — the foundation of the audit trail called for in
-- docs/security-model.md §5 ("consider a dedicated lightweight audit_log
-- table for security-relevant events ... distinct from financial
-- history"). No automatic cross-table instrumentation exists yet; this
-- migration only provisions the table and its RLS — application code
-- writes to it explicitly wherever a module chooses to record an event.

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- Who performed the action, if attributable to a signed-in user. Null is
  -- valid (a system/scheduled job).
  actor_user_id uuid references auth.users (id) on delete set null,
  -- Free-text dotted event name, e.g. 'transaction.created',
  -- 'account.closed', 'membership.role_changed' — not an enum, since the
  -- set of loggable events will grow with every future module without
  -- needing a migration each time.
  event_type text not null check (char_length(btrim(event_type)) > 0),
  entity_type text not null check (char_length(btrim(entity_type)) > 0),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.activity_events is
  'Append-only, household-scoped activity/audit log. Never updated in place. See docs/security-model.md §5, docs/financial-domain-model.md §8.';
comment on column public.activity_events.event_type is
  'Free-text dotted event name (e.g. "transaction.created"), not an enum — the loggable event set grows without a schema change.';

create index activity_events_household_id_idx on public.activity_events (household_id, created_at desc);
create index activity_events_entity_idx on public.activity_events (entity_type, entity_id);

alter table public.activity_events enable row level security;

create policy "members can view their household's activity events" on public.activity_events
  for select
  using (public.is_household_member(household_id));

-- Append-only: insert only, no update/delete policy — a logged event is
-- never edited or removed after the fact.
create policy "members can record an activity event" on public.activity_events
  for insert
  with check (public.is_household_member(household_id));

-- No update/delete grant either — see docs/database-plan.md §4.
grant select, insert on public.activity_events to authenticated, service_role;
