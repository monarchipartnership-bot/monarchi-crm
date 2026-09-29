-- Run this once in the Supabase SQL editor for this project.
-- Requires 2026-09-29_ai_agent_conversations_client_id_nullable.sql applied first.
--
-- Phase 3 of docs/ai-agents-roadmap.md (§4.5) — the first scheduled agent
-- run. deal-health-check's own logic (findStaleDeals/runDealHealthCheck in
-- src/lib/api/dealHealthCheck.js: open deals — stage neither is_won nor
-- is_lost — with updated_at older than N days) is fully deterministic and
-- needs no LLM call, so it's ported here as plain SQL running on pg_cron
-- (already used in this project — see
-- 2026-09-17_notifications_weekly_cleanup.sql) rather than adding a new
-- Vercel cron + serverless round trip for zero benefit.
--
-- Writes one ai_agent_conversations row per run (client_id null — this
-- scan is cross-client, see the nullable-client_id migration) with
-- kind:'audit', needs_review only when it actually found something — so a
-- quiet day doesn't pile into the human review queue. This is what
-- finally makes deal-health-check's own aiAgentsData.js ladder line true
-- ("Агент сам формує список «потребують уваги» щодня") instead of only
-- being true when a human happens to open the tool and click refresh.

create or replace function run_deal_health_check(p_min_days int default 7)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_conv_id bigint;
  v_body text;
  v_row record;
begin
  select count(*) into v_count
  from deals d
  join deal_stages ds on ds.id = d.stage_id
  where ds.is_won = false and ds.is_lost = false
    and d.updated_at < now() - (p_min_days || ' days')::interval;

  insert into ai_agent_conversations (client_id, agent_key, title, kind, needs_review, created_by)
  values (
    null,
    'deal-health-check',
    case when v_count > 0
      then v_count || ' ' || (case when v_count = 1 then 'угода потребує' else 'угод потребують' end) || ' уваги'
      else 'Жодної застоялої угоди'
    end,
    'audit',
    v_count > 0,
    'Автоматично (щодня)'
  )
  returning id into v_conv_id;

  v_body := 'Автоматична щоденна перевірка угод (поріг: ' || p_min_days || '+ днів без активності).' || chr(10) || chr(10);

  if v_count = 0 then
    v_body := v_body || 'Усі відкриті угоди мали активність за останні ' || p_min_days || ' днів. Гарна робота!';
  else
    for v_row in
      select
        d.id,
        coalesce(nullif(d.title, ''), c.company, c.name, 'Без назви') as label,
        ds.label as stage_label,
        floor(extract(epoch from (now() - d.updated_at)) / 86400)::int as days_stale
      from deals d
      join deal_stages ds on ds.id = d.stage_id
      left join clients c on c.id = d.client_id
      where ds.is_won = false and ds.is_lost = false
        and d.updated_at < now() - (p_min_days || ' days')::interval
      order by d.updated_at asc
    loop
      v_body := v_body || '- ' || v_row.label || ' — ' || v_row.days_stale || ' днів без оновлення на етапі «' || v_row.stage_label || '». /reports/deals?open=' || v_row.id || chr(10);
    end loop;
  end if;

  insert into ai_agent_messages (conversation_id, role, content, position)
  values (v_conv_id, 'assistant', v_body, 0);
end;
$$;

do $$
declare
  existing_id bigint;
begin
  select jobid into existing_id from cron.job where jobname = 'deal-health-check-daily';
  if existing_id is not null then
    perform cron.unschedule(existing_id);
  end if;
end $$;

-- 06:00 UTC ≈ 08:00-09:00 Kyiv depending on DST — a daily digest doesn't
-- need minute-level precision the way the weekly cleanup job does.
select cron.schedule('deal-health-check-daily', '0 6 * * *', $$select run_deal_health_check(7);$$);
