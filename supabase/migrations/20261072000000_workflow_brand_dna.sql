-- One more section of the dossier of a project: «ДНК бренду» (brand_dna), written by the Researcher from the client's website (colours, fonts, style, tone, banned words) and checked by the manager.
-- The Creator reads it for the picture prompts and the code checks the texts of the creatives against its banned words.
-- Additive and safe to re-run: the constraint is replaced by a wider one.

alter table public.wf_sections drop constraint if exists wf_sections_key_check;
alter table public.wf_sections add constraint wf_sections_key_check
  check (key in ('brief','audit','site','audience','unit_economy','competitors','materials','ideas','strategy','creatives','launch','monthly_plan','brand_dna'));
