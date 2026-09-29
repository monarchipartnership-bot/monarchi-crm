-- Persists each generated step of the Follow-up Generator's 5-message
-- series (FU1..FU5) per deal, so a later step (sometimes generated up to
-- 12 days after FU1, in a brand new browser tab) can still see what earlier
-- steps said and which case they used. Without this, stepData in
-- FollowupGenerator.jsx lives only in React state and is lost on reload,
-- so "don't repeat the same case/CTA/opening" rules had nothing to check
-- against once the original tab was closed.
-- Run this once in the Supabase SQL editor for this project.

create table if not exists deal_followup_steps (
  id bigint generated always as identity primary key,
  deal_id bigint not null,
  step smallint not null,
  message text not null,
  case_used text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, step)
);
create index if not exists deal_followup_steps_deal_idx on deal_followup_steps(deal_id);

-- RLS — same read-open/write-authenticated pattern as every other table.
alter table deal_followup_steps enable row level security;

drop policy if exists deal_followup_steps_select on deal_followup_steps;
create policy deal_followup_steps_select on deal_followup_steps for select using (true);

drop policy if exists deal_followup_steps_insert on deal_followup_steps;
create policy deal_followup_steps_insert on deal_followup_steps for insert with check (auth.role() = 'authenticated');

drop policy if exists deal_followup_steps_update on deal_followup_steps;
create policy deal_followup_steps_update on deal_followup_steps for update using (auth.role() = 'authenticated');

drop policy if exists deal_followup_steps_delete on deal_followup_steps;
create policy deal_followup_steps_delete on deal_followup_steps for delete using (auth.role() = 'authenticated');
