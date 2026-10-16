-- Mon'Archi SMM: the weekly autopilot of the content team. ONE row (id = 1), switched OFF until a person turns it on.
-- When it is on, the cron (every 15 minutes, /api/agent-tick) checks the Kyiv clock: at the chosen weekday and time it
-- refreshes the competitor analyses that are older than a week, writes the posts for the NEXT week into the approval queue
-- and notifies the chosen people. Nothing is ever published by it.
--   weekday 1..7 (Mon..Sun), time 'HH:MM' Kyiv, counts = posts per network (max 12 in total), notify_emails = who is told.
--   last_scheduled = the schedule moment (a Kyiv date) that was handled, attempts / last_attempt_at drive the retries
--   (after a failure the cron tries again an hour later, up to 3 times), run_state + lease_until stop two runs overlapping.
-- Additive and safe to re-run. Signed-in team members only.

create table if not exists smm_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  enabled_since timestamptz,
  weekday smallint not null default 5 check (weekday between 1 and 7),
  time text not null default '12:00',
  language text not null default 'en' check (language in ('en', 'uk')),
  counts jsonb not null default '{"linkedin": 3, "instagram": 2, "threads": 2, "facebook": 0, "tiktok": 0}'::jsonb,
  refresh_competitors boolean not null default true,
  notify_emails text[] not null default '{}',
  last_scheduled date,
  attempts smallint not null default 0,
  last_attempt_at timestamptz,
  last_run_at timestamptz,
  last_status text check (last_status in ('ok', 'problem')),
  last_message text,
  run_state text not null default 'idle' check (run_state in ('idle', 'running')),
  lease_until timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into smm_settings (id) values (1) on conflict (id) do nothing;

alter table smm_settings enable row level security;

do $$
declare t text := 'smm_settings';
begin
  execute format('drop policy if exists %I on %I', t || '_select', t);
  execute format('drop policy if exists %I on %I', t || '_insert', t);
  execute format('drop policy if exists %I on %I', t || '_update', t);
  execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
  execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
  execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
end $$;
