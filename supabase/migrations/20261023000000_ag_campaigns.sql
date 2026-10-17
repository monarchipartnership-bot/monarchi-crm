-- Campaign teams: for one project (a client with ad accounts in the CRM) a team of agents works on the client's campaigns
-- (Meta Ads, Google Ads, TikTok Ads, or several). The agents of a campaign are ordinary framework agents (ag_agents) with
-- team = 'campaign', scope_type = 'client' and scope_id = the campaign id, linked in the same chain tables.
--   ag_campaigns   one row per campaign team: the project, the platforms, the status and the shared brief
-- Additive and safe to re-run. Signed-in team members only.

create table if not exists ag_campaigns (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  name text not null,
  platforms text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  config jsonb not null default '{}'::jsonb,   -- { brief, goals, language, tiktokData }
  created_by text,
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists ag_campaigns_project_idx on ag_campaigns (project_id);
create index if not exists ag_campaigns_status_idx on ag_campaigns (status);

alter table ag_campaigns enable row level security;
drop policy if exists ag_campaigns_select on ag_campaigns;
drop policy if exists ag_campaigns_insert on ag_campaigns;
drop policy if exists ag_campaigns_update on ag_campaigns;
drop policy if exists ag_campaigns_delete on ag_campaigns;
create policy ag_campaigns_select on ag_campaigns for select to authenticated using (true);
create policy ag_campaigns_insert on ag_campaigns for insert to authenticated with check (true);
create policy ag_campaigns_update on ag_campaigns for update to authenticated using (true) with check (true);
create policy ag_campaigns_delete on ag_campaigns for delete to authenticated using (true);
