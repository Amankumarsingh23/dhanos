-- recurring_rules.next_due_date becomes nullable: once a rule's last
-- occurrence before its end_date has been recorded or skipped, there is
-- no next occurrence to schedule — null means exactly that ("no further
-- occurrences"), rather than forcing an arbitrary placeholder date. Rules
-- with no end_date (the common case) never see this.

alter table public.recurring_rules
  alter column next_due_date drop not null;

comment on column public.recurring_rules.next_due_date is
  'The next occurrence not yet generated or skipped. Null once the rule has passed its end_date with nothing left to schedule.';

drop index if exists recurring_rules_next_due_date_idx;
create index recurring_rules_next_due_date_idx
  on public.recurring_rules (next_due_date)
  where status = 'active' and next_due_date is not null;
