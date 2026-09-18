-- Clears the whole notifications table every Sunday at 23:59 (Europe/Kyiv)
-- so it doesn't just keep growing forever.
-- Run this once in the Supabase SQL editor.
--
-- Scheduled as a plain once-a-minute pg_cron job (not the 10-second form the
-- reminder job uses) — a once-a-week check doesn't need that precision, and
-- checking the exact Kyiv minute inside the function means the job only
-- ever actually deletes anything during that one minute, with no separate
-- "already ran" guard needed.

create or replace function cleanup_old_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(isodow from (now() at time zone 'Europe/Kyiv')) = 7
     and (now() at time zone 'Europe/Kyiv')::time >= time '23:59'
  then
    delete from notifications;
  end if;
end;
$$;

do $$
declare
  existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'cleanup-notifications';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

select cron.schedule('cleanup-notifications', '* * * * *', $$select cleanup_old_notifications();$$);
