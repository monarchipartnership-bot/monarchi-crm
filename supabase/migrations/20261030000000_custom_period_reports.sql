-- The reports archive also holds reports of an arbitrary period (saved by hand from «Показники за період»): period_type 'custom'.
-- A custom period is identified by both its dates, so the report key now includes period_end. Weekly / monthly rows are unaffected
-- (their end follows from their start). Additive and safe to re-run.
alter table project_reports drop constraint if exists project_reports_period_type_check;
alter table project_reports add constraint project_reports_period_type_check check (period_type in ('weekly', 'monthly', 'custom'));

drop index if exists project_reports_scope_uniq;
create unique index if not exists project_reports_scope_uniq on project_reports (project_id, period_type, period_start, period_end, platform);
