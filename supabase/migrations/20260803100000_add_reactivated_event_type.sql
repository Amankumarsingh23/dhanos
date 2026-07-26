-- Found live: a household member accidentally clicked "Mark completed" on
-- an active SIP (its dropdown menu item sits directly above "Cancel", and
-- easy to hit while repeatedly opening the menu to record a backlog of
-- contributions — see the new catch-up actions added alongside this
-- migration, which exist precisely to remove that repetition). Once a SIP
-- is 'completed'/'cancelled', or a recurring rule is 'ended', there was no
-- way back to 'active' — set_investment_sip_status/set_recurring_rule_status
-- already allow any status transition at the SQL layer (PROMPT
-- 17/14 intentionally left them generic), the only gap is that
-- 'reactivated' isn't yet in either table's event_type whitelist, so
-- logging the transition (required by every status-change action) would
-- fail its CHECK constraint. This migration only widens that whitelist —
-- the reactivate Server Actions themselves are plain application code,
-- no other schema change needed.
--
-- Both event_type CHECK constraints were already applied to production
-- before this gap was found (see docs/production-supabase.md's "never
-- edit an already-applied migration" rule) — a corrective migration, not
-- an edit to 20260721140000_recurring_commitments.sql or
-- 20260722120000_investment_sips.sql.
alter table public.recurring_rule_events
  drop constraint recurring_rule_events_event_type_check;

alter table public.recurring_rule_events
  add constraint recurring_rule_events_event_type_check check (
    event_type in (
      'created', 'amount_scheduled', 'paused', 'resumed', 'skipped',
      'ended', 'occurrence_generated', 'reactivated'
    )
  );

alter table public.investment_sip_events
  drop constraint investment_sip_events_event_type_check;

alter table public.investment_sip_events
  add constraint investment_sip_events_event_type_check check (
    event_type in (
      'created', 'activated', 'paused', 'resumed', 'completed',
      'cancelled', 'contribution_recorded', 'reactivated'
    )
  );
