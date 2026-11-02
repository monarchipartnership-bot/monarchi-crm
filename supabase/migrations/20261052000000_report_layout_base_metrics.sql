-- The standard metrics of a report layout can be removed and replaced: base_metrics = the list of built-in metric keys that replaces the standard set of the report type.
-- null = the standard set. Additive, safe to re-run.
alter table project_report_layouts add column if not exists base_metrics jsonb;
