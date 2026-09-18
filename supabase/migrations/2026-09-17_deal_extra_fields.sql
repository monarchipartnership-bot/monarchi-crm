-- New deal fields: Сервіс (tags), Прогрів ліда, Ніша бізнесу, Країна, MQL/SQL.
-- Run this once in the Supabase SQL editor for this project.

alter table deals
  add column if not exists lead_warmth text,
  add column if not exists niche text,
  add column if not exists country text,
  add column if not exists qualification text,
  add column if not exists service_tag_ids uuid[] not null default '{}';

create table if not exists deal_service_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  color text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table deal_service_tags enable row level security;

drop policy if exists "deal_service_tags_select" on deal_service_tags;
create policy "deal_service_tags_select" on deal_service_tags for select using (true);

drop policy if exists "deal_service_tags_insert" on deal_service_tags;
create policy "deal_service_tags_insert" on deal_service_tags for insert with check (auth.role() = 'authenticated');

drop policy if exists "deal_service_tags_update" on deal_service_tags;
create policy "deal_service_tags_update" on deal_service_tags for update using (auth.role() = 'authenticated');

drop policy if exists "deal_service_tags_delete" on deal_service_tags;
create policy "deal_service_tags_delete" on deal_service_tags for delete using (auth.role() = 'authenticated');

insert into deal_service_tags (label, color, position) values
  ('Meta Ads', '#1877F2', 0),
  ('Google Ads', '#34A853', 1),
  ('TikTok Ads', '#000000', 2),
  ('SEO', '#16A34A', 3),
  ('Email Marketing', '#D97706', 4),
  ('Pinterest Ads', '#E60023', 5)
on conflict (label) do nothing;
