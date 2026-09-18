-- Skip the 10:00 day-of reminder when a task was created on the same day
-- it's due — if you set yourself a task for today, you already know about
-- it (you just made it); the reminder is only useful for a task set up in
-- advance for a *different*, later day. Calls keep their own 1-hour-before
-- reminder unchanged (that's already just a precise time-based nudge, not a
-- whole-day one).
-- Run this once in the Supabase SQL editor, after the two earlier
-- 2026-09-17_task_notifications*.sql migrations.

create or replace function send_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt, deal_title, client_label, task_scheduled_at)
  select
    coalesce(t.assignee_email, t.created_by_email), null, 'reminder_due', t.deal_id, t.id::text, t.text,
    coalesce(d.title, c.company, c.name, 'Угода'), coalesce(c.name, c.company), t.scheduled_at
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

  insert into notifications (recipient_email, sender_email, type, deal_id, task_id, note_excerpt, deal_title, client_label, task_scheduled_at)
  select
    coalesce(t.assignee_email, t.created_by_email), null, 'reminder_call', t.deal_id, t.id::text, t.text,
    coalesce(d.title, c.company, c.name, 'Угода'), coalesce(c.name, c.company), t.scheduled_at
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
