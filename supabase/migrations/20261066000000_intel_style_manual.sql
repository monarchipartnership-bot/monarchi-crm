-- The style of a project's creatives (owner, 2026-11-12, step 3.1c): the scout decides it from the site and the past ads (ag_project_intel.profile.style), a person corrects it afterwards
-- (this column). A manual correction wins field by field and is never erased when the scout makes the profile again (the scout writes profile, photos and sources, never this column).
alter table ag_project_intel add column if not exists style_manual jsonb not null default '{}'::jsonb;
