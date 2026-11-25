-- «Дрібні дії» оптимізатора (owner's queue, 2026-11-25): a project may allow the Media buyer to make a closed list of SMALL actions in the ad cabinet itself
-- (pause one weak ad, raise the budget of a good ad group by the agreed step). OFF by default: a project does nothing by itself until a person switches it on.
-- Additive and safe to re-run.

alter table public.wf_project_state add column if not exists auto_small_actions boolean not null default false;
