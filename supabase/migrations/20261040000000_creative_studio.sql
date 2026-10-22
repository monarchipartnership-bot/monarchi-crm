-- Creative studio (AI Agents → «Кампанії»): a client's requirements go through a chain of agents (client analyst + competitor analyst ->
-- brief writer -> copywriter + producer) and the finished creatives wait for a person's approval.
--   ag_creative_requests  one request = one pass of the chain: the requirements, the materials (logo, product photos), the state
--   ag_creatives          one row per creative the brief asks for (concept x format): the prompt for Higgsfield, the picture, the checks
--   ag_tasks.request_id   a task of the chain belongs to its request
-- Additive and safe to re-run. Signed-in team members only (same as the other agent tables).

create table if not exists ag_creative_requests (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references ag_campaigns(id) on delete cascade,
  title text not null default '',
  brief jsonb not null default '{}'::jsonb,
  materials jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'running', 'review', 'done', 'problem', 'cancelled')),
  error text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists ag_creative_requests_campaign_idx on ag_creative_requests (campaign_id, created_at desc);

alter table ag_tasks add column if not exists request_id bigint references ag_creative_requests(id) on delete cascade;
create index if not exists ag_tasks_request_idx on ag_tasks (request_id);

create table if not exists ag_creatives (
  id bigint generated always as identity primary key,
  request_id bigint not null references ag_creative_requests(id) on delete cascade,
  concept_key text not null default '',
  concept_name text not null default '',
  ratio text not null default '1:1',
  prompt text not null default '',
  negative_prompt text not null default '',
  copy jsonb not null default '{}'::jsonb,
  status text not null default 'planned' check (status in ('planned', 'producing', 'qc', 'review', 'approved', 'rejected', 'failed')),
  asset_url text,
  asset_path text,
  hf jsonb,
  qc jsonb,
  rounds smallint not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ag_creatives_request_idx on ag_creatives (request_id, id);

alter table ag_creative_requests enable row level security;
alter table ag_creatives enable row level security;
drop policy if exists ag_creative_requests_all on ag_creative_requests;
drop policy if exists ag_creatives_all on ag_creatives;
create policy ag_creative_requests_all on ag_creative_requests for all to authenticated using (true) with check (true);
create policy ag_creatives_all on ag_creatives for all to authenticated using (true) with check (true);

-- The materials of a request (logo, product photos, style examples) and the finished pictures. Public bucket, unguessable paths: Higgsfield
-- must be able to read a reference by its address.
insert into storage.buckets (id, name, public) values ('creative-assets', 'creative-assets', true) on conflict (id) do nothing;
drop policy if exists creative_assets_insert on storage.objects;
drop policy if exists creative_assets_update on storage.objects;
drop policy if exists creative_assets_select on storage.objects;
drop policy if exists creative_assets_delete on storage.objects;
create policy creative_assets_insert on storage.objects for insert to authenticated with check (bucket_id = 'creative-assets');
create policy creative_assets_update on storage.objects for update to authenticated using (bucket_id = 'creative-assets') with check (bucket_id = 'creative-assets');
create policy creative_assets_select on storage.objects for select to authenticated using (bucket_id = 'creative-assets');
create policy creative_assets_delete on storage.objects for delete to authenticated using (bucket_id = 'creative-assets');
