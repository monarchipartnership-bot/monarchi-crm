-- The three per-period report tables of the first project reports (daily / weekly / monthly) were
-- replaced by project_reports (20261008000000); the app no longer reads or writes them. Each held one
-- empty test row (all numbers 0, project "Test pr"). projects.crm_link was never filled and is no
-- longer shown anywhere.
drop table if exists public.project_daily_reports;
drop table if exists public.project_weekly_reports;
drop table if exists public.project_monthly_reports;
alter table public.projects drop column if exists crm_link;
