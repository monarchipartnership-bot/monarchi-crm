-- The funnel of a report layout (product view → cart → checkout → sale as one picture for the client): { enabled, stages: [metric keys] }. Additive, safe to re-run.
alter table project_report_layouts add column if not exists funnel jsonb not null default '{}'::jsonb;
