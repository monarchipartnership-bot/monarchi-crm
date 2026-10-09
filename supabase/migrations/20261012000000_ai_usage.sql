-- Usage log and spending limits of every model call made by the server.
--
-- ai_calls: one row per model call (agent, project, model, exact tokens, estimated dollars, retries,
-- duration, outcome). Written by the shared model client (api/_lib/modelClient.js); the AI Agents section
-- reads it for the «Витрати» view. Rows are never edited or deleted from the app.
-- ai_budgets: spending limits. scope = 'global' (all agents) or 'agent:<agent_key>'; period = 'day' or
-- 'month' (Kyiv time). A call is refused when the period's spending has reached the limit.
-- ai_spent_since(): the sum behind that check.
--
-- Additive and safe to re-run. Signed-in team members only (same rules as the other project tables).

create table if not exists ai_calls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  agent_key text not null,
  project_id bigint references projects(id) on delete set null,
  run_id text,
  trigger text not null default 'user',
  actor text,
  model text,
  status text not null check (status in ('ok', 'empty', 'error', 'budget_stopped')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  retries integer not null default 0,
  duration_ms integer,
  stop_reason text,
  error text
);
create index if not exists ai_calls_created_idx on ai_calls (created_at desc);
create index if not exists ai_calls_agent_idx on ai_calls (agent_key, created_at desc);
create index if not exists ai_calls_project_idx on ai_calls (project_id, created_at desc);

create table if not exists ai_budgets (
  id bigint generated always as identity primary key,
  scope text not null,
  period text not null check (period in ('day', 'month')),
  limit_usd numeric(10, 2) not null check (limit_usd >= 0),
  enabled boolean not null default true,
  updated_by text,
  updated_at timestamptz not null default now(),
  unique (scope, period)
);

-- A safety net until the team sets its own numbers: $15 a day and $100 a month for all agents together.
insert into ai_budgets (scope, period, limit_usd) values ('global', 'day', 15), ('global', 'month', 100)
on conflict (scope, period) do nothing;

create or replace function ai_spent_since(since timestamptz, agent text default null)
returns numeric language sql stable as $$
  select coalesce(sum(cost_usd), 0) from ai_calls where created_at >= since and (agent is null or agent_key = agent)
$$;

alter table ai_calls enable row level security;
alter table ai_budgets enable row level security;

drop policy if exists ai_calls_select on ai_calls;
drop policy if exists ai_calls_insert on ai_calls;
create policy ai_calls_select on ai_calls for select to authenticated using (true);
create policy ai_calls_insert on ai_calls for insert to authenticated with check (true);

drop policy if exists ai_budgets_select on ai_budgets;
drop policy if exists ai_budgets_insert on ai_budgets;
drop policy if exists ai_budgets_update on ai_budgets;
create policy ai_budgets_select on ai_budgets for select to authenticated using (true);
create policy ai_budgets_insert on ai_budgets for insert to authenticated with check (true);
create policy ai_budgets_update on ai_budgets for update to authenticated using (true) with check (true);
