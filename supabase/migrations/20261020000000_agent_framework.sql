-- Agent framework: every agent of a team is an object of its own (settings, prompts with versions, tasks, history, on/off),
-- and the agents are linked into one chain through TASKS (one agent creates a task for the next). The same tables will serve the
-- client teams later: the same roles are instantiated per client (scope_type = 'client', scope_id = the client).
--   ag_agents          one row per agent of a team (team 'smm', role 'strategist', ...). enabled = the switch, config = its settings,
--                      schedule = when it starts on its own (Kyiv time), last_scheduled/attempts/... drive the scheduler (as for the project agent)
--   ag_links           the chain: from_agent -> to_agent. required = if the upstream agent is switched off the downstream one stops too
--   ag_prompts         the prompt library of an agent (several named prompts, one is the default); ag_prompt_versions keeps every edit
--   ag_tasks           what one agent asks another (or the schedule / a person asks an agent) to do: brief, status, prompt used, result
--   ag_runs            the log of every model call a task made: the EXACT prompt that was sent, the answer, tokens, cost
-- Content of the SMM team: smm_plans (the week plan, waits for the person's OK) and smm_posts (one row per piece of content, now with the
-- stages of production: planned -> producing -> qc -> needs_review -> approved -> published).
-- Additive and safe to re-run. Signed-in team members only.

create table if not exists ag_agents (
  id bigint generated always as identity primary key,
  team text not null,
  scope_type text not null default 'internal' check (scope_type in ('internal', 'client')),
  scope_id text not null default '',
  role text not null,
  name text not null,
  description text not null default '',
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  schedule jsonb,
  model text,
  sort smallint not null default 0,
  last_scheduled date,
  attempts smallint not null default 0,
  last_attempt_at timestamptz,
  last_run_at timestamptz,
  last_status text check (last_status in ('ok', 'problem')),
  last_message text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team, scope_type, scope_id, role)
);

create table if not exists ag_links (
  id bigint generated always as identity primary key,
  from_agent_id bigint not null references ag_agents(id) on delete cascade,
  to_agent_id bigint not null references ag_agents(id) on delete cascade,
  required boolean not null default false,
  unique (from_agent_id, to_agent_id)
);

create table if not exists ag_prompts (
  id bigint generated always as identity primary key,
  agent_id bigint not null references ag_agents(id) on delete cascade,
  name text not null,
  body text not null default '',
  is_default boolean not null default false,
  current_version integer not null default 1,
  note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ag_prompts_agent_idx on ag_prompts (agent_id);

create table if not exists ag_prompt_versions (
  id bigint generated always as identity primary key,
  prompt_id bigint not null references ag_prompts(id) on delete cascade,
  version integer not null,
  body text not null,
  note text not null default '',
  created_by text,
  created_at timestamptz not null default now(),
  unique (prompt_id, version)
);

create table if not exists smm_plans (
  id bigint generated always as identity primary key,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'awaiting_approval', 'approved', 'rejected')),
  summary text not null default '',
  language text not null default 'en',
  note text,
  task_id bigint,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ag_tasks (
  id bigint generated always as identity primary key,
  agent_id bigint not null references ag_agents(id) on delete cascade,
  type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  brief jsonb not null default '{}'::jsonb,
  created_by_agent_id bigint references ag_agents(id) on delete set null,
  created_by text,
  parent_task_id bigint references ag_tasks(id) on delete set null,
  post_id bigint,
  plan_id bigint references smm_plans(id) on delete set null,
  prompt_id bigint references ag_prompts(id) on delete set null,
  prompt_version integer,
  attempt smallint not null default 1,
  output jsonb,
  error text,
  cost_usd numeric(10, 6) not null default 0,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists ag_tasks_queue_idx on ag_tasks (status, agent_id, created_at);
create index if not exists ag_tasks_post_idx on ag_tasks (post_id);

create table if not exists ag_runs (
  id bigint generated always as identity primary key,
  task_id bigint references ag_tasks(id) on delete cascade,
  agent_id bigint not null references ag_agents(id) on delete cascade,
  prompt_id bigint,
  prompt_version integer,
  model text,
  system_prompt text,
  user_prompt text,
  response text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  duration_ms integer,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ag_runs_agent_idx on ag_runs (agent_id, created_at desc);

-- the content of the SMM team goes through production stages
alter table smm_posts add column if not exists plan_id bigint references smm_plans(id) on delete set null;
alter table smm_posts add column if not exists brief jsonb;
alter table smm_posts add column if not exists needs_visual boolean not null default false;
alter table smm_posts add column if not exists visual_prompt jsonb;
alter table smm_posts add column if not exists asset_url text;
alter table smm_posts add column if not exists asset_kind text;
alter table smm_posts add column if not exists asset_status text not null default 'none' check (asset_status in ('none', 'pending', 'ready', 'failed'));
alter table smm_posts add column if not exists qc jsonb;
alter table smm_posts add column if not exists rounds smallint not null default 0;
alter table smm_posts drop constraint if exists smm_posts_status_check;
alter table smm_posts add constraint smm_posts_status_check check (status in ('planned', 'producing', 'qc', 'draft', 'needs_review', 'approved', 'rejected', 'published'));
create index if not exists smm_posts_plan_idx on smm_posts (plan_id);

alter table ag_agents enable row level security;
alter table ag_links enable row level security;
alter table ag_prompts enable row level security;
alter table ag_prompt_versions enable row level security;
alter table ag_tasks enable row level security;
alter table ag_runs enable row level security;
alter table smm_plans enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ag_agents', 'ag_links', 'ag_prompts', 'ag_prompt_versions', 'ag_tasks', 'ag_runs', 'smm_plans'] loop
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
