-- One agent = one worker of a department with a QUEUE OF CLIENTS (not a copy per campaign): see docs/agent-model-spec.md.
--   ag_agent_clients  the link agent ↔ client (campaign): on/off, mode (auto | manual | paused), priority, confirm-before-pass, the client's own
--                     settings, and the schedule state of the agent FOR THIS CLIENT (a weekly agent runs per client)
--   ag_tasks.campaign_id  whose task it is
-- The creative department's agents (team 'creative') are ordinary ag_agents rows, one per role, scope internal.
-- Additive and safe to re-run. Signed-in team members only.

create table if not exists ag_agent_clients (
  id bigint generated always as identity primary key,
  agent_id bigint not null references ag_agents(id) on delete cascade,
  campaign_id bigint not null references ag_campaigns(id) on delete cascade,
  enabled boolean not null default true,
  mode text not null default 'auto' check (mode in ('auto', 'manual', 'paused')),
  priority integer not null default 100,
  confirm_before_pass boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_scheduled date,
  attempts smallint not null default 0,
  last_attempt_at timestamptz,
  last_status text check (last_status in ('ok', 'problem')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, campaign_id)
);
create index if not exists ag_agent_clients_campaign_idx on ag_agent_clients (campaign_id);

alter table ag_tasks add column if not exists campaign_id bigint references ag_campaigns(id) on delete cascade;
create index if not exists ag_tasks_campaign_idx on ag_tasks (campaign_id, agent_id, status);

alter table ag_agent_clients enable row level security;
drop policy if exists ag_agent_clients_all on ag_agent_clients;
create policy ag_agent_clients_all on ag_agent_clients for all to authenticated using (true) with check (true);
