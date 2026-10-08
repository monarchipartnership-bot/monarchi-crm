-- Project Managers' reports, redesigned (see the reports plan agreed 2026-10-08).
--
-- 1. project_reports: ONE table for weekly and monthly reports (replaces the
--    three per-period tables project_daily/weekly/monthly_reports, which are left
--    in place untouched). One row per project + period. `data` holds the numbers
--    per platform (a snapshot taken when the report was built), the previous
--    period for comparison, the campaign-group breakdown and the three English
--    text blocks. `source` says whether a person or the AI agent made it and
--    `status` where it is in review.
-- 2. project_campaign_groups: how a project's campaigns are bundled into the
--    columns of its report ("Kinky Bang RTS", "CATALOG RTS"...), by keywords in
--    the campaign name.
-- 3. report_custom_metrics: user-defined metrics (A op B), for one project or
--    for every project (project_id null).
--
-- Additive and safe to re-run. Signed-in team members only.

create table if not exists project_reports (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  source text not null default 'manual' check (source in ('manual', 'agent')),
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'final')),
  data jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, period_type, period_start)
);
create index if not exists project_reports_project_idx on project_reports (project_id, period_type, period_start desc);

create table if not exists project_campaign_groups (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  name text not null,
  keywords text[] not null default '{}',
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_campaign_groups_project_idx on project_campaign_groups (project_id, sort);

create table if not exists report_custom_metrics (
  id bigint generated always as identity primary key,
  project_id bigint references projects(id) on delete cascade,  -- null = available in every project
  name text not null,
  key text not null,
  formula jsonb not null,        -- { "a": "revenue", "op": "/", "b": "purchases" } (a / b: metric key or number)
  format text not null default 'number' check (format in ('number', 'money', 'percent', 'ratio')),
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists report_custom_metrics_project_idx on report_custom_metrics (project_id);

alter table project_reports enable row level security;
alter table project_campaign_groups enable row level security;
alter table report_custom_metrics enable row level security;

do $$
declare t text;
begin
  foreach t in array array['project_reports', 'project_campaign_groups', 'report_custom_metrics'] loop
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
