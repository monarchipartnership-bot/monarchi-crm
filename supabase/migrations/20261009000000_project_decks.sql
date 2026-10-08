-- Client presentations ("Презентація"), saved with the project report they are built from.
--
-- project_decks: one deck per project + period + platform. `slides` holds the whole
-- deck as JSON (slide list, text with formatting, tables); `platform` and `style`
-- choose the cover background and the visual style. `report_id` links the report the
-- numbers came from (kept when the report is later edited; the deck is a snapshot).
-- `source` says whether a person or the AI agent made it.
--
-- Additive and safe to re-run. Signed-in team members only (same rules as project_reports).

create table if not exists project_decks (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  report_id bigint references project_reports(id) on delete set null,
  period_type text not null check (period_type in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  platform text not null default 'meta' check (platform in ('meta', 'google')),
  style text not null default 'brand-pulse' check (style in ('brand-pulse', 'monarchi-impact', 'plum-editorial')),
  lang text not null default 'en' check (lang in ('en', 'uk')),
  source text not null default 'manual' check (source in ('manual', 'agent')),
  status text not null default 'draft' check (status in ('draft', 'final')),
  deck jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, period_type, period_start, platform)
);
create index if not exists project_decks_project_idx on project_decks (project_id, period_type, period_start desc);

alter table project_decks enable row level security;

drop policy if exists project_decks_select on project_decks;
drop policy if exists project_decks_insert on project_decks;
drop policy if exists project_decks_update on project_decks;
drop policy if exists project_decks_delete on project_decks;
create policy project_decks_select on project_decks for select to authenticated using (true);
create policy project_decks_insert on project_decks for insert to authenticated with check (true);
create policy project_decks_update on project_decks for update to authenticated using (true) with check (true);
create policy project_decks_delete on project_decks for delete to authenticated using (true);
