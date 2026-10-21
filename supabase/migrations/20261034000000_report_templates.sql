-- The report template of a project: its text blocks (titles, periods, the agent's instruction for each), how many creatives, which metrics the tables show.
-- One row per project. A report keeps a snapshot of the template it was made with (project_reports.data.template), so changing this never changes a report
-- that already exists. Additive and safe to re-run. Signed-in team members only.
create table if not exists project_report_templates (
  project_id bigint primary key references projects(id) on delete cascade,
  blocks jsonb not null default '[]'::jsonb,
  creatives jsonb not null default '{"weekly":3,"monthly":4}'::jsonb,
  metrics jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table project_report_templates enable row level security;
drop policy if exists project_report_templates_select on project_report_templates;
drop policy if exists project_report_templates_insert on project_report_templates;
drop policy if exists project_report_templates_update on project_report_templates;
drop policy if exists project_report_templates_delete on project_report_templates;
create policy project_report_templates_select on project_report_templates for select to authenticated using (true);
create policy project_report_templates_insert on project_report_templates for insert to authenticated with check (true);
create policy project_report_templates_update on project_report_templates for update to authenticated using (true) with check (true);
create policy project_report_templates_delete on project_report_templates for delete to authenticated using (true);
