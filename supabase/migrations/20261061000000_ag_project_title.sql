-- The name of a project inside the AI Agents section (owner, 2026-11-11). By default the card shows the name taken from the CRM project; a person may write
-- their own name, up to 100 characters. An empty value means «as in the CRM». Additive: one nullable column, nothing else changes.
alter table ag_projects add column if not exists title text;
alter table ag_projects drop constraint if exists ag_projects_title_len;
alter table ag_projects add constraint ag_projects_title_len check (title is null or char_length(title) <= 100);
