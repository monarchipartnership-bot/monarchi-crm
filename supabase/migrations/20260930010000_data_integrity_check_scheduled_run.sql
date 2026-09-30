-- Run this once in the Supabase SQL editor for this project.
--
-- "Агент контролю трекінгу та цілісності даних" (tracking-data-integrity-
-- agent, Wave 1, Data & Reporting dept) — the fifth real agent. Its job
-- per aiAgentsData.js's own description: "Перевіряє, чи можна довіряти
-- даним, на яких працюють інші агенти." Three fully deterministic checks,
-- none needs an LLM call, so — same reasoning as run_deal_health_check()
-- — this is plain SQL on pg_cron, not a new serverless round trip:
--
-- 1. RLS regression: re-checks for the exact "<table>_all_anon" /
--    "_all_authenticated" blanket-policy bug found and fixed 2026-09-30
--    (see 20260930000000_drop_redundant_anon_all_policies.sql) — if one
--    ever gets re-added by hand in Supabase Studio again, this catches it
--    automatically instead of relying on another one-off manual audit.
-- 2. Cron health: any of the 3 registered pg_cron jobs (send-task-
--    reminders, cleanup-notifications, deal-health-check-daily) failed a
--    run in the last 48 hours — catches the automation this project now
--    depends on silently breaking.
-- 3. Stale review backlog: ai_agent_conversations rows still flagged
--    needs_review after 3+ days — catches the human-review side of the
--    system breaking down, which matters because two other agents'
--    output (deal-health-check, job-post-analyzer's event trigger) only
--    has value if a person actually looks at it.
--
-- Deliberately no manual "check now" button in this agent's own workspace
-- (unlike deal-health-check) — points 1 and 2 read pg_catalog/cron schema
-- tables that aren't exposed over PostgREST at all, so a browser-side
-- manual re-check isn't possible without either duplicating this logic
-- client-side (defeats the point — the whole reason this exists is to
-- check things the app itself can't see) or granting RPC EXECUTE to
-- authenticated users on a SECURITY DEFINER function (reopens exactly the
-- kind of public-RPC exposure finding #2 of the same-day security fix
-- just closed). The workspace page is read-only: it just surfaces the
-- latest daily result.

create or replace function run_data_integrity_check()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := '';
  v_ok boolean := true;
  v_row record;
  v_conv_id bigint;
  v_blanket_count int;
  v_failed_cron_count int;
  v_stale_review_count int;
begin
  -- Check 1: RLS blanket-policy regression.
  select count(*) into v_blanket_count
  from pg_policies
  where schemaname = 'public'
    and (policyname like '%_all_anon' or policyname like '%_all_authenticated');

  if v_blanket_count > 0 then
    v_ok := false;
    v_body := v_body || '⚠ RLS-регресія: знайдено ' || v_blanket_count || ' застарілу(их) blanket-політику(и) (<table>_all_anon/_all_authenticated) — перевір і видали (див. міграцію 2026-09-30).' || chr(10);
    for v_row in
      select tablename, policyname from pg_policies
      where schemaname = 'public' and (policyname like '%_all_anon' or policyname like '%_all_authenticated')
      order by tablename
    loop
      v_body := v_body || '  - ' || v_row.tablename || '.' || v_row.policyname || chr(10);
    end loop;
  else
    v_body := v_body || '✓ RLS: жодної застарілої blanket-політики не знайдено.' || chr(10);
  end if;

  -- Check 2: cron job health (any failed run in the last 48h).
  select count(*) into v_failed_cron_count
  from cron.job_run_details
  where status = 'failed' and start_time > now() - interval '48 hours';

  if v_failed_cron_count > 0 then
    v_ok := false;
    v_body := v_body || '⚠ Cron: ' || v_failed_cron_count || ' невдалий(их) запуск(ів) запланованих задач за 48 годин.' || chr(10);
  else
    v_body := v_body || '✓ Cron: усі заплановані задачі виконуються без помилок (48 год).' || chr(10);
  end if;

  -- Check 3: stale needs_review backlog (3+ days unreviewed).
  select count(*) into v_stale_review_count
  from ai_agent_conversations
  where needs_review = true and created_at < now() - interval '3 days';

  if v_stale_review_count > 0 then
    v_ok := false;
    v_body := v_body || '⚠ Черга перевірки: ' || v_stale_review_count || ' запис(ів) чекають перегляду людиною вже 3+ дні.' || chr(10);
  else
    v_body := v_body || '✓ Черга перевірки: немає записів, що чекають перегляду довше 3 днів.' || chr(10);
  end if;

  insert into ai_agent_conversations (client_id, agent_key, title, kind, needs_review, created_by)
  values (
    null,
    'tracking-data-integrity-agent',
    case when v_ok then 'Усі перевірки пройдено' else 'Знайдено проблеми з цілісністю даних' end,
    'audit',
    not v_ok,
    'Автоматично (щодня)'
  )
  returning id into v_conv_id;

  insert into ai_agent_messages (conversation_id, role, content, position)
  values (v_conv_id, 'assistant', trim(trailing chr(10) from v_body), 0);
end;
$$;

do $$
declare
  existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'data-integrity-check-daily';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

-- 07:00 UTC — right after deal-health-check-daily's 06:00 slot.
select cron.schedule('data-integrity-check-daily', '0 7 * * *', $$select run_data_integrity_check();$$);
