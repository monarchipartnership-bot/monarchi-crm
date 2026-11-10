-- «Готові матеріали» and the memory of a client fill themselves (spec 2026-11-02, §1 and §8). Additive: three triggers and a backfill, nothing is dropped.
--   ag_creatives  → ag_deliverables (kind 'creative', its status follows the creative: approved / rejected / draft)
--   ag_tasks      → ag_deliverables (strategy / report / analysis of a campaign agent, 'draft' until a person passes it on; passed → 'approved')
--   ag_cycles     → ag_client_events (kind 'cycle': one line when a cycle is done, waits for the person or has a problem)

create or replace function ag_deliverable_kind(r text) returns text language sql immutable as $$
  select case
    when r in ('marketing_strategist', 'creative_strategist') then 'strategy'
    when r in ('cross_channel_report', 'account_manager') then 'report'
    when r in ('business_research', 'competitor_research', 'audience_research', 'meta_analyst', 'google_analyst', 'creative_performance_analyst', 'tracking_integrity', 'meta_optimizer', 'google_optimizer') then 'analysis'
    else null
  end
$$;

-- ---- creatives
create or replace function ag_mirror_creative() returns trigger language plpgsql security definer set search_path = public as $$
declare
  camp bigint;
  proj bigint;
  cyc bigint;
  who text := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email';
  st text;
  url text := coalesce(nullif(new.final_url, ''), nullif(new.asset_url, ''));
begin
  if url is null then return new; end if;
  select r.campaign_id into camp from ag_creative_requests r where r.id = new.request_id;
  select c.project_id into proj from ag_campaigns c where c.id = camp;
  if proj is null then return new; end if;
  select y.id into cyc from ag_cycles y where y.request_id = new.request_id order by y.id desc limit 1;
  st := case when new.status = 'approved' then 'approved' when new.status = 'rejected' then 'rejected' else 'draft' end;
  insert into ag_deliverables (project_id, campaign_id, cycle_id, kind, title, status, file_url, file_path, source_table, source_id, meta, created_by, approved_by, approved_at)
  values (proj, camp, cyc, 'creative', coalesce(nullif(new.concept_name, ''), new.concept_key, 'Креатив') || ' · ' || coalesce(new.ratio, ''), st, url, coalesce(nullif(new.final_path, ''), new.asset_path),
          'ag_creatives', new.id, jsonb_build_object('ratio', new.ratio, 'request_id', new.request_id, 'concept_key', new.concept_key), who,
          case when st = 'approved' then who end, case when st = 'approved' then now() end)
  on conflict (source_table, source_id) where source_table is not null and source_id is not null do update
    set file_url = excluded.file_url, file_path = excluded.file_path, status = excluded.status, cycle_id = coalesce(ag_deliverables.cycle_id, excluded.cycle_id), updated_at = now(),
        approved_by = case when excluded.status = 'approved' then coalesce(excluded.approved_by, ag_deliverables.approved_by) else null end,
        approved_at = case when excluded.status = 'approved' then coalesce(ag_deliverables.approved_at, now()) else null end;
  return new;
end $$;
drop trigger if exists ag_creatives_mirror on ag_creatives;
create trigger ag_creatives_mirror after insert or update of status, final_url, asset_url on ag_creatives for each row execute function ag_mirror_creative();

-- ---- the results of the campaign agents
create or replace function ag_mirror_task() returns trigger language plpgsql security definer set search_path = public as $$
declare
  ag record;
  camp bigint;
  proj bigint;
  cyc bigint;
  k text;
  passed text := new.output ->> 'passed_by';
  body text := coalesce(new.output ->> 'text', '');
begin
  if new.status is distinct from 'done' or length(trim(body)) < 3 then return new; end if;
  select a.role, a.name, a.team, a.scope_id into ag from ag_agents a where a.id = new.agent_id;
  if ag.team is distinct from 'campaign' then return new; end if;
  k := ag_deliverable_kind(ag.role);
  if k is null then return new; end if;
  camp := coalesce(new.campaign_id, nullif(ag.scope_id, '')::bigint);
  select c.project_id into proj from ag_campaigns c where c.id = camp;
  if proj is null then return new; end if;
  select y.id into cyc from ag_cycles y where y.campaign_id = camp and y.started_at <= coalesce(new.created_at, now()) order by y.number desc limit 1;
  insert into ag_deliverables (project_id, campaign_id, cycle_id, kind, title, status, body, source_table, source_id, meta, created_by, approved_by, approved_at)
  values (proj, camp, cyc, k, ag.name, case when passed is not null then 'approved' else 'draft' end, body, 'ag_tasks', new.id,
          jsonb_build_object('role', ag.role, 'task_id', new.id, 'summary', new.output ->> 'summary'), null, passed, case when passed is not null then now() end)
  on conflict (source_table, source_id) where source_table is not null and source_id is not null do update
    set body = excluded.body, updated_at = now(),
        status = case when ag_deliverables.status = 'rejected' then 'rejected' when excluded.status = 'approved' then 'approved' else ag_deliverables.status end,
        approved_by = coalesce(ag_deliverables.approved_by, excluded.approved_by),
        approved_at = coalesce(ag_deliverables.approved_at, excluded.approved_at);
  return new;
end $$;
drop trigger if exists ag_tasks_mirror on ag_tasks;
create trigger ag_tasks_mirror after insert or update of status, output on ag_tasks for each row execute function ag_mirror_task();

-- ---- one line in the memory when a cycle ends
create or replace function ag_cycle_event() returns trigger language plpgsql security definer set search_path = public as $$
declare
  proj bigint;
  nm text;
  n int;
  cost numeric;
begin
  if new.status is not distinct from old.status or new.status not in ('done', 'review', 'problem') then return new; end if;
  select c.project_id, c.name into proj, nm from ag_campaigns c where c.id = new.campaign_id;
  if proj is null then return new; end if;
  select count(*) filter (where t.status = 'done'), coalesce(sum(t.cost_usd), 0) into n, cost
    from ag_tasks t
   where case when new.request_id is not null then t.request_id = new.request_id else t.campaign_id = new.campaign_id and t.created_at >= coalesce(new.started_at, new.created_at) end;
  insert into ag_client_events (project_id, campaign_id, kind, subject, body, actor, meta)
  values (proj, new.campaign_id, 'cycle', 'Цикл ' || new.number || ' · ' || coalesce(nm, 'операція'),
          case new.status when 'done' then 'Цикл завершено' when 'review' then 'Цикл чекає на рішення менеджера' else 'У циклі є проблема' end || '. Виконано кроків: ' || n || ', витрати: $' || round(cost, 2),
          null, jsonb_build_object('cycle_id', new.id, 'status', new.status, 'steps', n, 'cost_usd', round(cost, 4)));
  return new;
end $$;
drop trigger if exists ag_cycles_memory on ag_cycles;
create trigger ag_cycles_memory after update of status on ag_cycles for each row execute function ag_cycle_event();

-- ---- backfill: what already exists
insert into ag_deliverables (project_id, campaign_id, kind, title, status, body, source_table, source_id, meta, approved_by, approved_at, created_at)
select c.project_id, c.id, ag_deliverable_kind(a.role), a.name,
       case when t.output ->> 'passed_by' is not null then 'approved' else 'draft' end, t.output ->> 'text', 'ag_tasks', t.id,
       jsonb_build_object('role', a.role, 'task_id', t.id, 'summary', t.output ->> 'summary'), t.output ->> 'passed_by', case when t.output ->> 'passed_by' is not null then t.finished_at end, coalesce(t.finished_at, t.created_at)
  from ag_tasks t
  join ag_agents a on a.id = t.agent_id and a.team = 'campaign'
  join ag_campaigns c on c.id = coalesce(t.campaign_id, nullif(a.scope_id, '')::bigint)
 where t.status = 'done' and length(trim(coalesce(t.output ->> 'text', ''))) >= 3 and ag_deliverable_kind(a.role) is not null and c.project_id is not null
on conflict (source_table, source_id) where source_table is not null and source_id is not null do nothing;

insert into ag_deliverables (project_id, campaign_id, cycle_id, kind, title, status, file_url, file_path, source_table, source_id, meta, created_at)
select c.project_id, r.campaign_id, (select y.id from ag_cycles y where y.request_id = r.id order by y.id desc limit 1), 'creative',
       coalesce(nullif(k.concept_name, ''), k.concept_key, 'Креатив') || ' · ' || coalesce(k.ratio, ''),
       case when k.status = 'approved' then 'approved' when k.status = 'rejected' then 'rejected' else 'draft' end,
       coalesce(nullif(k.final_url, ''), k.asset_url), coalesce(nullif(k.final_path, ''), k.asset_path), 'ag_creatives', k.id,
       jsonb_build_object('ratio', k.ratio, 'request_id', k.request_id, 'concept_key', k.concept_key), k.created_at
  from ag_creatives k
  join ag_creative_requests r on r.id = k.request_id
  join ag_campaigns c on c.id = r.campaign_id
 where coalesce(nullif(k.final_url, ''), k.asset_url) is not null and c.project_id is not null
on conflict (source_table, source_id) where source_table is not null and source_id is not null do nothing;
