-- One row per run of the project AI agent (one report period of one project), plus a lock on the agent.
--
-- agent_runs: what the run was for (project, period), how it started (manual / cron), how it ended
-- (running / ok / problem / skipped), what it made (report, decks), what it cost, and its step log.
-- project_agents.lease_until: while an agent is running its run_state is 'running' and lease_until says
-- until when that claim holds; after that a new run may take over (a crashed run never blocks a project).
--
-- Additive and safe to re-run. Signed-in team members only (same rules as project_agents).

create table if not exists agent_runs (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  agent_key text not null default 'project-report',
  trigger text not null default 'manual' check (trigger in ('manual', 'cron')),
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date,
  period_end date,
  status text not null default 'running' check (status in ('running', 'ok', 'problem', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  report_id bigint,
  deck_ids bigint[] not null default '{}',
  cost_usd numeric(12, 6) not null default 0,
  summary jsonb,
  error text,
  started_by text
);
create index if not exists agent_runs_project_idx on agent_runs (project_id, started_at desc);

alter table project_agents add column if not exists lease_until timestamptz;

alter table agent_runs enable row level security;
drop policy if exists agent_runs_select on agent_runs;
drop policy if exists agent_runs_insert on agent_runs;
drop policy if exists agent_runs_update on agent_runs;
create policy agent_runs_select on agent_runs for select to authenticated using (true);
create policy agent_runs_insert on agent_runs for insert to authenticated with check (true);
create policy agent_runs_update on agent_runs for update to authenticated using (true) with check (true);
