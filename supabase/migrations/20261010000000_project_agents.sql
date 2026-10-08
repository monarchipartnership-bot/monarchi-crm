-- AI agent of a project ("AI Агент" tab of the project card).
--
-- project_agents: at most one agent connection per project. `enabled` is the on/off switch,
-- `run_state` what it is doing right now, `health` whether its last work went fine (the agent
-- itself will set run_state / health / last_run_at / last_error; people set enabled and config).
-- `config` holds what the agent should do for the project (which reports and decks, platforms,
-- deck style and language, schedule, note for the agent).
--
-- project_agent_events: the history of actions, written by people (connected, switched off,
-- settings changed) and later by the agent (run started, report made, deck made, problem).
--
-- Additive and safe to re-run. Signed-in team members only (same rules as project_reports).

create table if not exists project_agents (
  id bigint generated always as identity primary key,
  project_id bigint not null unique references projects(id) on delete cascade,
  enabled boolean not null default false,
  run_state text not null default 'idle' check (run_state in ('idle', 'running')),
  health text not null default 'unknown' check (health in ('unknown', 'ok', 'problem')),
  last_run_at timestamptz,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_agent_events (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  actor text not null default 'user' check (actor in ('user', 'agent')),
  kind text not null,
  status text not null default 'info' check (status in ('info', 'ok', 'problem')),
  message text not null,
  details jsonb,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists project_agent_events_project_idx on project_agent_events (project_id, created_at desc);

alter table project_agents enable row level security;
alter table project_agent_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['project_agents', 'project_agent_events'] loop
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
