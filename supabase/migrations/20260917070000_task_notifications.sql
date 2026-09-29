-- Task assignment + scheduled reminder notifications.
-- Run this once in the Supabase SQL editor for this project.
--
-- What this adds:
--   1. notifications.task_id — lets a notification point at a specific task
--      (declared `text` rather than matching tasks.id's own type, since the
--      client already sends it as a plain value and this avoids having to
--      pin down that type here).
--   2. tasks.reminder_due_sent_at / reminder_call_sent_at — one-shot guards
--      so the cron job below never re-notifies the same task twice.
--   3. send_task_reminders() — inserts the two reminder notification types:
--        - 'reminder_due': once, at/after 10:00 Europe/Kyiv time, on the
--          calendar day a pending task/email activity is scheduled for.
--        - 'reminder_call': once, when a pending call's scheduled_at is
--          within the next hour.
--      Scoped to department = 'sales' (deal tasks/calls only — the
--      Задачі/Угоди flows this was asked for, not the separate Automation
--      department task engine).
--   4. A pg_cron job that calls it every 5 minutes.

alter table notifications
  add column if not exists task_id text;

alter table tasks
  add column if not exists reminder_due_sent_at timestamptz,
  add column if not exists reminder_call_sent_at timestamptz;

create or replace function send_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Day-of, 10:00 Europe/Kyiv reminder — tasks/emails, not calls (calls get
  -- the more precise 1-hour-before reminder instead, see below).
  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt)
  select coalesce(t.assignee_email, t.created_by_email), null, 'reminder_due', t.deal_id, t.id::text, t.text
  from tasks t
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type <> 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_due_sent_at is null
    and (t.scheduled_at at time zone 'Europe/Kyiv')::date = (now() at time zone 'Europe/Kyiv')::date
    and (now() at time zone 'Europe/Kyiv')::time >= time '10:00';

  update tasks t set reminder_due_sent_at = now()
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type <> 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_due_sent_at is null
    and (t.scheduled_at at time zone 'Europe/Kyiv')::date = (now() at time zone 'Europe/Kyiv')::date
    and (now() at time zone 'Europe/Kyiv')::time >= time '10:00';

  -- 1-hour-before reminder — calls only.
  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt)
  select coalesce(t.assignee_email, t.created_by_email), null, 'reminder_call', t.deal_id, t.id::text, t.text
  from tasks t
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type = 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_call_sent_at is null
    and t.scheduled_at > now()
    and t.scheduled_at <= now() + interval '1 hour';

  update tasks t set reminder_call_sent_at = now()
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type = 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_call_sent_at is null
    and t.scheduled_at > now()
    and t.scheduled_at <= now() + interval '1 hour';
end;
$$;

create extension if not exists pg_cron;

do $$
declare
  existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'send-task-reminders';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

-- pg_cron supports sub-minute schedules via this "N seconds" form (N from
-- 1-59) alongside standard cron syntax — used here instead of e.g. '*/5 * * * *'
-- so a reminder fires within ~10s of its trigger condition becoming true,
-- not up to several minutes late.
select cron.schedule('send-task-reminders', '10 seconds', $$select send_task_reminders();$$);
