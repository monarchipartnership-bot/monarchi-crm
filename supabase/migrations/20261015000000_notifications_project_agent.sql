-- The bell (общий раздел уведомлений) learns a generic kind of notification: a title, a text and a link.
-- The project AI agent uses it to say "the report is ready for review" or "the agent hit a problem".
-- type values used: 'project_report', 'project_agent_problem' (the column has no CHECK, as for the existing kinds).
-- Additive and safe to re-run.
alter table notifications add column if not exists title text;
alter table notifications add column if not exists body text;
alter table notifications add column if not exists link text;
alter table notifications add column if not exists project_id bigint references projects(id) on delete cascade;
create index if not exists notifications_project_idx on notifications (project_id, type, created_at desc);
