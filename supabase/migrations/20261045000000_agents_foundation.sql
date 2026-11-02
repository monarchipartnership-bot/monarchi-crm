-- The foundation of the structure of the AI Agents section (docs/ai-agents-structure-spec.md, 2026-11-02): cycles of a campaign, the ready materials of a project as ONE
-- kind of thing (creatives, strategies, reports), the memory of a client (what was done, approved, returned and why) and the settings of a campaign that
-- the next steps need (schedule, money notices, optional cap). Everything here is additive; nothing that exists is changed.

-- ---- campaign settings
alter table ag_campaigns add column if not exists schedule jsonb not null default '{}'::jsonb;        -- how often each agent works: { role: { every: 'week', weekday: 1, time: '09:00' } }
alter table ag_campaigns add column if not exists spend_cap_usd numeric;                              -- null = no cap (the owner's choice for the start)
alter table ag_campaigns add column if not exists notify_step_usd numeric not null default 2;         -- a notice for every this many dollars spent on the campaign
alter table ag_campaigns add column if not exists notified_usd numeric not null default 0;            -- the last whole step already notified (so a notice is never sent twice)

-- ---- cycles: one run of a campaign (a one-off campaign has one, a scheduled one repeats)
create table if not exists ag_cycles (
  id bigserial primary key,
  campaign_id bigint not null references ag_campaigns(id) on delete cascade,
  number int not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'review', 'done', 'problem', 'cancelled')),
  request_id bigint references ag_creative_requests(id) on delete set null,  -- the creative request of this cycle, when the campaign makes creatives
  progress numeric not null default 0 check (progress >= 0 and progress <= 1),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, number)
);
create index if not exists ag_cycles_campaign_idx on ag_cycles (campaign_id, number desc);

-- ---- the ready materials of a project: one place for creatives, strategies, reports and analyses
create table if not exists ag_deliverables (
  id bigserial primary key,
  project_id bigint not null references projects(id) on delete cascade,
  campaign_id bigint references ag_campaigns(id) on delete set null,
  cycle_id bigint references ag_cycles(id) on delete set null,
  kind text not null check (kind in ('creative', 'strategy', 'report', 'analysis', 'other')),
  title text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  body text,                       -- the text of a strategy or a report
  file_url text,                   -- the file of a creative (the original, never re-compressed)
  file_path text,
  source_table text,               -- where it was made: 'ag_creatives', 'ag_tasks' ...
  source_id bigint,
  meta jsonb not null default '{}'::jsonb,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ag_deliverables_project_idx on ag_deliverables (project_id, created_at desc);
create unique index if not exists ag_deliverables_source_idx on ag_deliverables (source_table, source_id) where source_table is not null and source_id is not null;

-- ---- the memory of a client: what was done, decided, approved or returned and why; the agents read it (a short dossier made from it, and the episodes they need)
create table if not exists ag_client_events (
  id bigserial primary key,
  project_id bigint references projects(id) on delete cascade,
  campaign_id bigint references ag_campaigns(id) on delete set null,
  kind text not null,              -- 'creative_approved', 'creative_rejected', 'creative_comment', 'decision', 'note' ...
  subject text not null default '',
  body text not null default '',   -- the person's comment or the reason
  actor text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ag_client_events_project_idx on ag_client_events (project_id, created_at desc);

-- ---- recording starts now: every decision on a creative (approved, rejected, a note) goes to the memory of its client
create or replace function ag_log_creative_decision() returns trigger language plpgsql security definer set search_path = public as $$
declare
  camp bigint;
  proj bigint;
  who text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', null);
begin
  if new.status is not distinct from old.status and new.note is not distinct from old.note then return new; end if;
  if new.status not in ('approved', 'rejected') and (new.note is not distinct from old.note) then return new; end if;
  select r.campaign_id into camp from ag_creative_requests r where r.id = new.request_id;
  select c.project_id into proj from ag_campaigns c where c.id = camp;
  if proj is null then return new; end if;
  insert into ag_client_events (project_id, campaign_id, kind, subject, body, actor, meta)
  values (proj, camp,
    case when new.status = 'approved' then 'creative_approved' when new.status = 'rejected' then 'creative_rejected' else 'creative_comment' end,
    coalesce(nullif(new.concept_name, ''), new.concept_key, '') || ' · ' || coalesce(new.ratio, ''),
    coalesce(new.note, ''), who, jsonb_build_object('creative_id', new.id, 'request_id', new.request_id, 'status', new.status));
  return new;
end $$;
drop trigger if exists ag_creatives_memory on ag_creatives;
create trigger ag_creatives_memory after update of status, note on ag_creatives for each row execute function ag_log_creative_decision();

-- ---- access: the people of the CRM (like the other agent tables)
alter table ag_cycles enable row level security;
alter table ag_deliverables enable row level security;
alter table ag_client_events enable row level security;
drop policy if exists ag_cycles_all on ag_cycles;
create policy ag_cycles_all on ag_cycles for all to authenticated using (true) with check (true);
drop policy if exists ag_deliverables_all on ag_deliverables;
create policy ag_deliverables_all on ag_deliverables for all to authenticated using (true) with check (true);
drop policy if exists ag_client_events_all on ag_client_events;
create policy ag_client_events_all on ag_client_events for all to authenticated using (true) with check (true);
