-- «Розвідник» of the creative team and the live steps of the agents (owner, 2026-11-12).
--   ag_task_steps   what an agent is doing right now, one short line per real event of the code («читаю сторінку 4 з 9», «Higgsfield: картинка 1 з 2, очікую результат»);
--                   the card of the operation shows them as they come. Lines are written by the server while a task runs and only read by the page.
--   ag_project_intel  what the scout learned about the client before the first creative: the site (products, tone, style), the ads that already ran in the cabinet,
--                   a summary the other agents read, and the pictures taken from the site that the maker may use as references. One row per project.
create table if not exists ag_task_steps (
  id bigint generated always as identity primary key,
  task_id bigint references ag_tasks(id) on delete cascade,
  campaign_id bigint,
  request_id bigint,
  role text,
  text text not null,
  state text not null default 'info' check (state in ('running', 'done', 'info', 'failed')),
  created_at timestamptz not null default now()
);
create index if not exists ag_task_steps_task_idx on ag_task_steps (task_id, id);
create index if not exists ag_task_steps_request_idx on ag_task_steps (request_id, id);
create index if not exists ag_task_steps_campaign_idx on ag_task_steps (campaign_id, id);

create table if not exists ag_project_intel (
  project_id bigint primary key references projects(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'ready', 'partial', 'failed')),
  summary text not null default '',
  profile jsonb not null default '{}'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  site_url text,
  task_id bigint,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ag_task_steps enable row level security;
alter table ag_project_intel enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ag_task_steps', 'ag_project_intel'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (true)', t || '_delete', t);
  end loop;
end $$;
