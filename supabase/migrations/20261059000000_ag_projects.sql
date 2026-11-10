-- The projects of the AI Agents section (owner, 2026-11-11): ONE per client project of the CRM, an addition to its card. The operations run inside it.
--   status 'active'   the project is worked on in the section
--          'done'     «Завершити»: finished successfully, it gets the mark and moves to the archive of the section; the history stays in the CRM card
--          'removed'  «Видалити»: taken out of the section only; everything that was made (materials, memory, operations) stays in the CRM card
-- Additive: a new table, a trigger that journals every change, and a backfill for the projects that already have operations.

create table if not exists ag_projects (
  project_id bigint primary key references projects(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'done', 'removed')),
  created_by text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  finished_by text,
  removed_at timestamptz,
  removed_by text,
  updated_at timestamptz not null default now()
);

alter table ag_projects enable row level security;
drop policy if exists ag_projects_all on ag_projects;
create policy ag_projects_all on ag_projects for all to authenticated using (true) with check (true);

-- every change of the status is written to the journal of the section and to the memory of the client (the history in the CRM card)
create or replace function ag_project_status_log() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := ag_actor();
  nm text;
  what text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select coalesce(nullif(p.client, ''), p.name) into nm from projects p where p.id = new.project_id;
  what := case
    when tg_op = 'INSERT' then 'Проєкт додано в AI Agents'
    when new.status = 'done' then 'Проєкт в AI Agents успішно завершено'
    when new.status = 'removed' then 'Проєкт прибрано з розділу AI Agents (зроблена робота збережена)'
    else 'Проєкт повернуто в роботу в AI Agents' end;
  insert into ag_audit_log (actor, action, project_id, subject, summary, meta)
  values (who, 'project_status', new.project_id, coalesce(nm, 'Проєкт'), what, jsonb_build_object('status', new.status, 'from', case when tg_op = 'UPDATE' then old.status end));
  insert into ag_client_events (project_id, kind, subject, body, actor, meta)
  values (new.project_id, 'decision', what, '', who, jsonb_build_object('status', new.status));
  return new;
end $$;
drop trigger if exists ag_projects_log on ag_projects;
create trigger ag_projects_log after insert or update of status on ag_projects for each row execute function ag_project_status_log();

-- the projects that already have operations are projects of the section (the trigger is switched off for the backfill: nobody «added» them today)
alter table ag_projects disable trigger ag_projects_log;
insert into ag_projects (project_id, status, created_by, created_at)
select c.project_id, 'active', min(c.created_by), min(c.created_at)
  from ag_campaigns c
 where c.project_id is not null and c.status <> 'archived'
 group by c.project_id
on conflict (project_id) do nothing;
alter table ag_projects enable trigger ag_projects_log;
