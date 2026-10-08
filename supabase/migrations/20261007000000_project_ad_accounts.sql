-- Projects are created from an ad account (Google / Meta / ...), and a project
-- can carry more than one (e.g. the same client runs Google and Meta).
--
-- 1. projects.client_id links a project to a CRM contact, so the contact card's
--    "Проекти" tab can list it. The existing free-text projects.client stays
--    (dashboards and the registry still read it); the app fills both.
-- 2. project_ad_accounts holds the linked accounts: one per platform per
--    project, and an account can belong to one project only.
--
-- Additive and safe to re-run.

alter table projects add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists projects_client_id_idx on projects (client_id);

create table if not exists project_ad_accounts (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  platform text not null check (platform in ('google', 'meta', 'tiktok', 'other')),
  account_id text not null,          -- digits only, without the "act_" prefix or dashes
  account_name text,
  currency text,
  timezone text,
  account_status text,               -- active | disabled | unsettled | grace | closed | unknown
  synced_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  unique (project_id, platform),
  unique (platform, account_id)
);

create index if not exists project_ad_accounts_project_idx on project_ad_accounts (project_id);

alter table project_ad_accounts enable row level security;

-- Signed-in team members only (no anonymous reads, unlike the older tables).
drop policy if exists project_ad_accounts_select on project_ad_accounts;
drop policy if exists project_ad_accounts_insert on project_ad_accounts;
drop policy if exists project_ad_accounts_update on project_ad_accounts;
drop policy if exists project_ad_accounts_delete on project_ad_accounts;

create policy project_ad_accounts_select on project_ad_accounts for select to authenticated using (true);
create policy project_ad_accounts_insert on project_ad_accounts for insert to authenticated with check (true);
create policy project_ad_accounts_update on project_ad_accounts for update to authenticated using (true) with check (true);
create policy project_ad_accounts_delete on project_ad_accounts for delete to authenticated using (true);
