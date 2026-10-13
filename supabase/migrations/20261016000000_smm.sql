-- Mon'Archi SMM: the internal section for the Monarchi website and social networks.
--
-- smm_brand: ONE row (id = 1) — how Monarchi speaks (voice, audience, pillars, do / don't, formats, free material
--   notes). The content agents read it before writing anything.
-- smm_competitors: who we watch (website, social links, notes). Read by the content strategist now,
--   by the competitor-monitoring agent later.
-- smm_posts: the content plan and the approval queue. A post is written by the agent (source = 'agent') or by a
--   person (source = 'manual') and goes draft -> needs_review -> approved -> published (or rejected).
--   Publishing is manual for now: the person posts it and marks it published (optionally with the link).
--
-- Additive and safe to re-run. Signed-in team members only (same rules as project_agents).

create table if not exists smm_brand (
  id smallint primary key default 1 check (id = 1),
  voice text not null default '',
  audience text not null default '',
  pillars text not null default '',
  dos text not null default '',
  donts text not null default '',
  languages text not null default '',
  formats text not null default '',
  materials text not null default '',
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into smm_brand (id) values (1) on conflict (id) do nothing;

create table if not exists smm_competitors (
  id bigint generated always as identity primary key,
  name text not null,
  website text not null default '',
  socials text not null default '',
  notes text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists smm_posts (
  id bigint generated always as identity primary key,
  platform text not null check (platform in ('instagram', 'facebook', 'threads', 'tiktok', 'linkedin')),
  format text not null default 'text',
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'published')),
  topic text not null default '',
  body text not null default '',
  hashtags text not null default '',
  visual_brief text not null default '',
  fact_check text not null default '',
  language text not null default '',
  scheduled_for timestamptz,
  batch_id uuid,
  source text not null default 'manual' check (source in ('agent', 'manual')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  published_url text,
  published_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smm_posts_status_idx on smm_posts (status, scheduled_for);
create index if not exists smm_posts_batch_idx on smm_posts (batch_id);

alter table smm_brand enable row level security;
alter table smm_competitors enable row level security;
alter table smm_posts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['smm_brand', 'smm_competitors', 'smm_posts'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (true)', t || '_delete', t);
  end loop;
end $$;
