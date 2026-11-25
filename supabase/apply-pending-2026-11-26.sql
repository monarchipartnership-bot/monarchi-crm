-- The four pending migrations in one file (all additive and safe to run again): 20261072 brand_dna, 20261073 quick start, 20261074 small actions, 20261075 agent settings.
-- Paste into the Supabase SQL editor and run, or: supabase db query --linked -f supabase/apply-pending-2026-11-26.sql

-- ===== 20261072000000_workflow_brand_dna.sql =====
-- One more section of the dossier of a project: «ДНК бренду» (brand_dna), written by the Researcher from the client's website (colours, fonts, style, tone, banned words) and checked by the manager.
-- The Creator reads it for the picture prompts and the code checks the texts of the creatives against its banned words.
-- Additive and safe to re-run: the constraint is replaced by a wider one.

alter table public.wf_sections drop constraint if exists wf_sections_key_check;
alter table public.wf_sections add constraint wf_sections_key_check
  check (key in ('brief','audit','site','audience','unit_economy','competitors','materials','ideas','strategy','creatives','launch','monthly_plan','brand_dna'));

-- ===== 20261073000000_workflow_quick_start.sql =====
-- «Швидкий старт» (the quick entry: a link is enough to begin; owner's decision 2026-11-25). Two flags in the state of a project:
--   brief_pending   the brief was drafted from the website by the Researcher; the process does not start until a person confirms it
--   launch_paused   the first launch creates everything switched OFF (PAUSED) in the ad cabinet, so a manager looks at it there before anything spends money
-- Additive and safe to re-run.

alter table public.wf_project_state add column if not exists brief_pending boolean not null default false;
alter table public.wf_project_state add column if not exists launch_paused boolean not null default false;

-- ===== 20261074000000_workflow_small_actions.sql =====
-- «Дрібні дії» оптимізатора (owner's queue, 2026-11-25): a project may allow the Media buyer to make a closed list of SMALL actions in the ad cabinet itself
-- (pause one weak ad, raise the budget of a good ad group by the agreed step). OFF by default: a project does nothing by itself until a person switches it on.
-- Additive and safe to re-run.

alter table public.wf_project_state add column if not exists auto_small_actions boolean not null default false;

-- ===== 20261075000000_workflow_config.sql =====
-- «Налаштування агентів» (owner's rule 2026-11-26: all the settings in one place). Two sparse jsons, only the values that differ from the defaults are stored
-- (the defaults and the limits of every value are in src/lib/workflow/agentConfig.js):
--   wf_settings.config        the settings of ALL projects (schedules, thresholds, notices, reports)
--   wf_project_state.config   the settings of ONE project; they override the ones of all projects
-- Additive and safe to re-run.

alter table public.wf_settings add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.wf_project_state add column if not exists config jsonb not null default '{}'::jsonb;
