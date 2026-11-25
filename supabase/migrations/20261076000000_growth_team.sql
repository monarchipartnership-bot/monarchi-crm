-- The internal growth team of Mon'Archi (own sales, site SEO and socials), docs/growth-workflow.md. SEPARATE from the agents of the client projects: own tables (gr_*), own settings, own budget.
-- Step 1: sales. gr_leads is the journey of a lead (the score is counted by code, the Analyst only describes), gr_drafts the letters of the Author that wait for the person,
-- gr_runs the journal and the spend of the month, gr_settings the stop, the budget and the level of automation of every kind of action.
-- Additive and safe to re-run. Signed-in users read and write; nobody deletes; the anon role has no rights at all.

create table if not exists public.gr_settings (
  id smallint primary key default 1 check (id = 1),
  stopped boolean not null default false,
  stopped_reason text,
  stopped_by text,
  stopped_at timestamptz,
  monthly_budget_usd numeric(10,2) not null default 30 check (monthly_budget_usd >= 0),
  autonomy jsonb not null default '{}'::jsonb,  -- { "<action key>": { "level": 0|1|2, "streak": n, "unlockedAuto": bool } }, see src/lib/growth/autonomy.js
  updated_at timestamptz not null default now()
);
insert into public.gr_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.gr_leads (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,          -- the deal of the CRM, created when the person says «писати»
  name text not null,
  source text not null default 'manual' check (source in ('site', 'linkedin', 'upwork', 'manual')),
  source_url text,
  website text,
  raw_text text not null default '',
  contact_name text,
  contact_email text,
  country text,
  niche text,
  subniche text,
  pays_ads text,
  budget_usd numeric(12,2),
  channel text,
  language text,
  has_site boolean not null default false,
  has_checkout boolean not null default false,
  problem_named boolean not null default false,
  findings jsonb not null default '[]'::jsonb,                           -- what the code read on the site; the Author may quote only one of them
  finding_id text,
  case_key text,
  status text not null default 'new' check (status in ('new', 'scored', 'drafting', 'draft', 'ready', 'sent', 'replied', 'won', 'rejected', 'skipped', 'failed')),
  verdict text check (verdict in ('ok', 'ask', 'no')),
  score integer,
  score_parts jsonb not null default '[]'::jsonb,
  reject_reason text,
  flags jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  error text,
  sent_at timestamptz,
  replied_at timestamptz,
  decided_by text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gr_leads_status_idx on public.gr_leads (status, created_at desc);

create table if not exists public.gr_drafts (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.gr_leads(id) on delete cascade,
  kind text not null default 'letter' check (kind in ('letter', 'followup', 'reply')),
  channel text not null default 'email',
  lang text not null default 'en',
  subject text,
  body text not null,
  words integer not null default 0,
  case_key text,
  issues jsonb not null default '[]'::jsonb,                             -- the rules of the code the text still breaks (the person edits it or rejects it)
  status text not null default 'pending' check (status in ('pending', 'approved', 'sent', 'skipped')),
  edited boolean not null default false,
  model text,
  cost_usd numeric(10,4) not null default 0,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gr_drafts_lead_idx on public.gr_drafts (lead_id, created_at desc);

create table if not exists public.gr_runs (
  id bigint generated always as identity primary key,
  lead_id uuid references public.gr_leads(id) on delete set null,
  kind text not null,                                                    -- 'analyst' | 'author'
  status text not null default 'ok' check (status in ('ok', 'failed')),
  cost_usd numeric(10,4) not null default 0,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists gr_runs_month_idx on public.gr_runs (created_at desc);

alter table public.gr_settings enable row level security;
alter table public.gr_leads enable row level security;
alter table public.gr_drafts enable row level security;
alter table public.gr_runs enable row level security;

revoke all on public.gr_settings, public.gr_leads, public.gr_drafts, public.gr_runs from anon, public, authenticated;
grant select, update on public.gr_settings to authenticated;
grant select, insert, update on public.gr_leads to authenticated;
grant select, insert, update on public.gr_drafts to authenticated;
grant select, insert on public.gr_runs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists gr_settings_select on public.gr_settings;
create policy gr_settings_select on public.gr_settings for select to authenticated using (true);
drop policy if exists gr_settings_update on public.gr_settings;
create policy gr_settings_update on public.gr_settings for update to authenticated using (id = 1) with check (id = 1);
drop policy if exists gr_leads_select on public.gr_leads;
create policy gr_leads_select on public.gr_leads for select to authenticated using (true);
drop policy if exists gr_leads_insert on public.gr_leads;
create policy gr_leads_insert on public.gr_leads for insert to authenticated with check (true);
drop policy if exists gr_leads_update on public.gr_leads;
create policy gr_leads_update on public.gr_leads for update to authenticated using (true) with check (true);
drop policy if exists gr_drafts_select on public.gr_drafts;
create policy gr_drafts_select on public.gr_drafts for select to authenticated using (true);
drop policy if exists gr_drafts_insert on public.gr_drafts;
create policy gr_drafts_insert on public.gr_drafts for insert to authenticated with check (true);
drop policy if exists gr_drafts_update on public.gr_drafts;
create policy gr_drafts_update on public.gr_drafts for update to authenticated using (true) with check (true);
drop policy if exists gr_runs_select on public.gr_runs;
create policy gr_runs_select on public.gr_runs for select to authenticated using (true);
drop policy if exists gr_runs_insert on public.gr_runs;
create policy gr_runs_insert on public.gr_runs for insert to authenticated with check (true);

comment on table public.gr_leads is 'The journey of a lead of the internal growth team. The score and the verdict are counted by code (src/lib/growth/icp.js).';
comment on table public.gr_drafts is 'Letters, follow-ups and replies written by the Author; nothing is sent without the decision of a person (docs/growth-workflow.md, section 3).';
