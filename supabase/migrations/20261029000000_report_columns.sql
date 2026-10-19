-- Extra report columns per project + ad platform (the «Стовпці» of the ad cabinet): which additional metrics a platform tab shows in the
-- period table, the weekly / monthly report and the exports. `columns` holds metric keys of src/lib/metaColumns.js ('mx_add_to_cart', ...).
-- Additive and safe to re-run. Signed-in team members only.
create table if not exists project_report_columns (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  platform text not null,
  columns text[] not null default '{}',
  updated_at timestamptz not null default now(),
  unique (project_id, platform)
);

alter table project_report_columns enable row level security;
drop policy if exists project_report_columns_select on project_report_columns;
drop policy if exists project_report_columns_insert on project_report_columns;
drop policy if exists project_report_columns_update on project_report_columns;
drop policy if exists project_report_columns_delete on project_report_columns;
create policy project_report_columns_select on project_report_columns for select to authenticated using (true);
create policy project_report_columns_insert on project_report_columns for insert to authenticated with check (true);
create policy project_report_columns_update on project_report_columns for update to authenticated using (true) with check (true);
create policy project_report_columns_delete on project_report_columns for delete to authenticated using (true);
