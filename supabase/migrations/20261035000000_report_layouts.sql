-- The report layout of a project, one per ad platform (Meta, Google, ...): the base of every report of that platform. It is set up once in the
-- «Конструктор звіту» of the project card and then used by the manual report pages, the AI agent and the client's page.
--   kind           'ecom' | 'leadgen' (null: taken from the project's «Тип бізнесу»)
--   blocks         the text blocks (key, title, weekly / monthly, whether the client sees it, the agent's instruction)
--   creatives      how many «Most effective creatives» a weekly / monthly report has
--   hidden_metrics metrics the client does not see (the team always sees the full report)
-- A report keeps a snapshot of the layout it was made with (project_reports.data.template), so a change never touches a report that exists.
-- The platform columns of a layout stay in project_report_columns and the project's own metrics in report_custom_metrics.
-- Replaces project_report_templates (20261034000000), which was one per project and was never used (verified empty).
-- Additive and safe to re-run. Signed-in team members only.
drop table if exists project_report_templates;

create table if not exists project_report_layouts (
  project_id bigint not null references projects(id) on delete cascade,
  platform text not null,
  kind text check (kind in ('ecom', 'leadgen')),
  blocks jsonb not null default '[]'::jsonb,
  creatives jsonb not null default '{"weekly":3,"monthly":4}'::jsonb,
  hidden_metrics jsonb not null default '[]'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (project_id, platform)
);

alter table project_report_layouts enable row level security;
drop policy if exists project_report_layouts_select on project_report_layouts;
drop policy if exists project_report_layouts_insert on project_report_layouts;
drop policy if exists project_report_layouts_update on project_report_layouts;
drop policy if exists project_report_layouts_delete on project_report_layouts;
create policy project_report_layouts_select on project_report_layouts for select to authenticated using (true);
create policy project_report_layouts_insert on project_report_layouts for insert to authenticated with check (true);
create policy project_report_layouts_update on project_report_layouts for update to authenticated using (true) with check (true);
create policy project_report_layouts_delete on project_report_layouts for delete to authenticated using (true);
