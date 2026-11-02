-- The order of the metric rows in a report layout (the «Конструктор звіту»): a list of metric keys; metrics that are not listed follow in their usual order. Additive, safe to re-run.
alter table project_report_layouts add column if not exists metric_order jsonb not null default '[]'::jsonb;
