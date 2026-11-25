-- «Швидкий старт» (the quick entry: a link is enough to begin; owner's decision 2026-11-25). Two flags in the state of a project:
--   brief_pending   the brief was drafted from the website by the Researcher; the process does not start until a person confirms it
--   launch_paused   the first launch creates everything switched OFF (PAUSED) in the ad cabinet, so a manager looks at it there before anything spends money
-- Additive and safe to re-run.

alter table public.wf_project_state add column if not exists brief_pending boolean not null default false;
alter table public.wf_project_state add column if not exists launch_paused boolean not null default false;
