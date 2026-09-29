-- The bell panel now colors a task/call notification purple vs red by the
-- underlying activity — 'reminder_call' already implies a call, but
-- 'assigned' covers both, so the activity itself needs to travel with the
-- notification row (snapshotted, same as deal_title/client_label already
-- are) rather than being inferred from `type` alone.
-- Run this once in the Supabase SQL editor, after the earlier
-- 2026-09-17_task_notifications*.sql migrations.

alter table notifications
  add column if not exists activity_type text;

create or replace function send_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt, deal_title, client_label, task_scheduled_at, activity_type)
  select
    coalesce(t.assignee_email, t.created_by_email), null, 'reminder_due', t.deal_id, t.id::text, t.text,
    coalesce(d.title, c.company, c.name, 'Угода'), coalesce(c.name, c.company), t.scheduled_at, t.activity_type
  from tasks t
  left join deals d on d.id = t.deal_id
  left join clients c on c.id = d.client_id
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type <> 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_due_sent_at is null
    and (t.scheduled_at at time zone 'Europe/Kyiv')::date = (now() at time zone 'Europe/Kyiv')::date
    and (t.created_at at time zone 'Europe/Kyiv')::date <> (t.scheduled_at at time zone 'Europe/Kyiv')::date
    and (now() at time zone 'Europe/Kyiv')::time >= time '10:00';

  update tasks t set reminder_due_sent_at = now()
  where t.department = 'sales'
    and t.status = 'pending'
    and t.activity_type <> 'call'
    and t.scheduled_at is not null
    and coalesce(t.assignee_email, t.created_by_email) is not null
    and t.reminder_due_sent_at is null
    and (t.scheduled_at at time zone 'Europe/Kyiv')::date = (now() at time zone 'Europe/Kyiv')::date
    and (t.created_at at time zone 'Europe/Kyiv')::date <> (t.scheduled_at at time zone 'Europe/Kyiv')::date
    and (now() at time zone 'Europe/Kyiv')::time >= time '10:00';

  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt, deal_title, client_label, task_scheduled_at, activity_type)
  select
    coalesce(t.assignee_email, t.created_by_email), null, 'reminder_call', t.deal_id, t.id::text, t.text,
    coalesce(d.title, c.company, c.name, 'Угода'), coalesce(c.name, c.company), t.scheduled_at, t.activity_type
  from tasks t
  left join deals d on d.id = t.deal_id
  left join clients c on c.id = d.client_id
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
