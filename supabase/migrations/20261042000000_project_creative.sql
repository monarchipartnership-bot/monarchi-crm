-- Креативи in the project: what the creative department needs to know about a client, kept ON THE PROJECT (not in the AI Agents section), because it
-- is about the client and other departments reuse it.
--   project_creative         one row per project: Figma link, the call-to-action rule, the client's restrictions, and `inputs`: the data other
--                            departments' agents deliver for the creative strategist. inputs = { <key>: { body, source: 'agent'|'manual',
--                            by: 'agent name or person', filled_at } } with the keys business, competitors, audience, strategy, cabinet, tracking.
--   project_creative_assets  the library of the client's materials (logo, product photos, style examples); the files are in the public
--                            storage bucket `creative-assets` under projects/<project id>/.
-- Additive and safe to re-run. Signed-in team members only (same as the other agent tables).

create table if not exists project_creative (
  project_id bigint primary key references projects(id) on delete cascade,
  figma_url text not null default '',
  cta_mode text not null default 'always' check (cta_mode in ('always', 'none')),
  cta_text text not null default '',
  restrictions text not null default '',
  inputs jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

create table if not exists project_creative_assets (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  kind text not null default 'other' check (kind in ('logo', 'product', 'style', 'other')),
  name text not null default '',
  url text not null,
  path text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists project_creative_assets_project_idx on project_creative_assets (project_id, id);

alter table project_creative enable row level security;
alter table project_creative_assets enable row level security;
drop policy if exists project_creative_all on project_creative;
drop policy if exists project_creative_assets_all on project_creative_assets;
create policy project_creative_all on project_creative for all to authenticated using (true) with check (true);
create policy project_creative_assets_all on project_creative_assets for all to authenticated using (true) with check (true);
