-- Two more sections of the dossier of a project (document «Робочий процес клієнта», the list of the documents of the dossier):
--   creatives  «Креативи (готові)»  written by the Creator: texts and pictures with tags (step A6.2)
--   launch     «Знімок запуску»      written by the Media buyer: what was launched, when, with which settings, creatives and target CPAs (step A8)
-- The first migration of the dossier (20261068) allowed only ten keys; without this one the agents of steps A6.2 and A8 cannot write their sections.
-- Additive and safe to re-run: the constraint is replaced by a wider one.

alter table public.wf_sections drop constraint if exists wf_sections_key_check;
alter table public.wf_sections add constraint wf_sections_key_check
  check (key in ('brief','audit','site','audience','unit_economy','competitors','materials','ideas','strategy','creatives','launch','monthly_plan'));
