-- The cycles are removed (owner, 2026-11-11): what a person launches is a creative TASK (a request) or the schedule of an agent; a «cycle» of the work of agents was only bookkeeping
-- (status, progress, number) that nobody needed. The memory of the client now gets one line when a creative request ends (kind 'task'); the old lines of kind 'cycle' stay and are read too.

-- ---- the mirrors of results into «Готові матеріали» no longer name a cycle
create or replace function ag_mirror_creative() returns trigger language plpgsql security definer set search_path = public as $$
declare
  camp bigint;
  proj bigint;
  who text := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email';
  st text;
  url text := coalesce(nullif(new.final_url, ''), nullif(new.asset_url, ''));
begin
  if url is null then return new; end if;
  select r.campaign_id into camp from ag_creative_requests r where r.id = new.request_id;
  select c.project_id into proj from ag_campaigns c where c.id = camp;
  if proj is null then return new; end if;
  st := case when new.status = 'approved' then 'approved' when new.status = 'rejected' then 'rejected' else 'draft' end;
  insert into ag_deliverables (project_id, campaign_id, kind, title, status, file_url, file_path, source_table, source_id, meta, created_by, approved_by, approved_at)
  values (proj, camp, 'creative', coalesce(nullif(new.concept_name, ''), new.concept_key, 'Креатив') || ' · ' || coalesce(new.ratio, ''), st, url, coalesce(nullif(new.final_path, ''), new.asset_path),
          'ag_creatives', new.id, jsonb_build_object('ratio', new.ratio, 'request_id', new.request_id, 'concept_key', new.concept_key), who,
          case when st = 'approved' then who end, case when st = 'approved' then now() end)
  on conflict (source_table, source_id) where source_table is not null and source_id is not null do update
    set file_url = excluded.file_url, file_path = excluded.file_path, status = excluded.status, updated_at = now(),
        approved_by = case when excluded.status = 'approved' then coalesce(excluded.approved_by, ag_deliverables.approved_by) else null end,
        approved_at = case when excluded.status = 'approved' then coalesce(ag_deliverables.approved_at, now()) else null end;
  return new;
end $$;

create or replace function ag_mirror_task() returns trigger language plpgsql security definer set search_path = public as $$
declare
  ag record;
  camp bigint;
  proj bigint;
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
  insert into ag_deliverables (project_id, campaign_id, kind, title, status, body, source_table, source_id, meta, created_by, approved_by, approved_at)
  values (proj, camp, k, ag.name, case when passed is not null then 'approved' else 'draft' end, body, 'ag_tasks', new.id,
          jsonb_build_object('role', ag.role, 'task_id', new.id, 'summary', new.output ->> 'summary'), null, passed, case when passed is not null then now() end)
  on conflict (source_table, source_id) where source_table is not null and source_id is not null do update
    set body = excluded.body, updated_at = now(),
        status = case when ag_deliverables.status = 'rejected' then 'rejected' when excluded.status = 'approved' then 'approved' else ag_deliverables.status end,
        approved_by = coalesce(ag_deliverables.approved_by, excluded.approved_by),
        approved_at = coalesce(ag_deliverables.approved_at, excluded.approved_at);
  return new;
end $$;

-- ---- one line in the memory of the client when a creative request ends (instead of the cycle)
create or replace function ag_request_event() returns trigger language plpgsql security definer set search_path = public as $$
declare
  proj bigint;
  nm text;
  n int;
  cost numeric;
begin
  if new.status is not distinct from old.status or new.status not in ('done', 'review', 'problem') then return new; end if;
  select c.project_id, c.name into proj, nm from ag_campaigns c where c.id = new.campaign_id;
  if proj is null then return new; end if;
  select count(*) filter (where t.status = 'done'), coalesce(sum(t.cost_usd), 0) into n, cost from ag_tasks t where t.request_id = new.id;
  insert into ag_client_events (project_id, campaign_id, kind, subject, body, actor, meta)
  values (proj, new.campaign_id, 'task', 'Завдання · ' || coalesce(nullif(new.title, ''), nm, 'креативи'),
          case new.status when 'done' then 'Завдання виконано' when 'review' then 'Завдання чекає на рішення менеджера' else 'У завданні є проблема' end || '. Виконано кроків: ' || n || ', витрати: $' || round(cost, 2),
          null, jsonb_build_object('request_id', new.id, 'status', new.status, 'steps', n, 'cost_usd', round(cost, 4)));
  return new;
end $$;
drop trigger if exists ag_requests_memory on ag_creative_requests;
create trigger ag_requests_memory after update of status on ag_creative_requests for each row execute function ag_request_event();

-- ---- the cycles themselves
drop trigger if exists ag_cycles_memory on ag_cycles;
drop function if exists ag_cycle_event();
alter table ag_deliverables drop column if exists cycle_id;
drop table if exists ag_cycles;
