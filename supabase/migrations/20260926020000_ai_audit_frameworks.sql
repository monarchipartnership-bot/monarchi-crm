-- Run this once in the Supabase SQL editor for this project.
--
-- A library of reusable audit frameworks for AI agents — the manager
-- writes his own audit structure/checklist once (name + instructions),
-- picks it from the agent's "Фреймворки" tab, and "Провести аудит" runs
-- the full multi-step audit against it instead of him asking one question
-- at a time. Global per agent (not per-client) — one library reused
-- across every client.

create table if not exists ai_audit_frameworks (
  id bigint generated always as identity primary key,
  agent_key text not null default 'ads-insights-analyst',
  name text not null,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_audit_frameworks_agent_idx on ai_audit_frameworks(agent_key);

-- RLS — same read-open/write-authenticated pattern as every other table.
alter table ai_audit_frameworks enable row level security;

drop policy if exists ai_audit_frameworks_select on ai_audit_frameworks;
create policy ai_audit_frameworks_select on ai_audit_frameworks for select using (true);
drop policy if exists ai_audit_frameworks_insert on ai_audit_frameworks;
create policy ai_audit_frameworks_insert on ai_audit_frameworks for insert with check (auth.role() = 'authenticated');
drop policy if exists ai_audit_frameworks_update on ai_audit_frameworks;
create policy ai_audit_frameworks_update on ai_audit_frameworks for update using (auth.role() = 'authenticated');
drop policy if exists ai_audit_frameworks_delete on ai_audit_frameworks;
create policy ai_audit_frameworks_delete on ai_audit_frameworks for delete using (auth.role() = 'authenticated');
