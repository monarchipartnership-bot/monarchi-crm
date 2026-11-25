-- «Налаштування агентів» (owner's rule 2026-11-26: all the settings in one place). Two sparse jsons, only the values that differ from the defaults are stored
-- (the defaults and the limits of every value are in src/lib/workflow/agentConfig.js):
--   wf_settings.config        the settings of ALL projects (schedules, thresholds, notices, reports)
--   wf_project_state.config   the settings of ONE project; they override the ones of all projects
-- Additive and safe to re-run.

alter table public.wf_settings add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.wf_project_state add column if not exists config jsonb not null default '{}'::jsonb;
