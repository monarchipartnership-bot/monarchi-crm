-- New clients: Meta ad accounts become projects by themselves (docs/project-reports-tasks.md, «Новые клиенты»). One settings row and the state of the daily check.
-- The FIRST run only remembers the accounts that have no project yet (seen_ids); after that, a new account becomes a project (auto_create) or waits for a person.
-- Additive and safe to re-run. Signed-in team members only.
create table if not exists meta_sync_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  auto_create boolean not null default true,             -- false = new accounts only wait in the list («Нові кабінети»), a person imports them
  baseline_done boolean not null default false,          -- the first run has learned what already exists
  seen_ids text[] not null default '{}',                 -- accounts that existed without a project at the first run (they wait for a person, never auto-created)
  ignored_ids text[] not null default '{}',              -- accounts the person chose to leave out (the agency's own, tests)
  notify_emails text[] not null default '{}',            -- who gets «Новий кабінет» in the CRM bell
  tg_chat_id text,                                       -- optional Telegram group and topic for the same message
  tg_thread_id bigint,
  last_run_date date,                                    -- the Kyiv day of the last check (it runs once a day)
  last_run_at timestamptz,
  last_report jsonb not null default '{}'::jsonb,        -- { listed, created: [names], waiting: n, error }
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into meta_sync_settings (id, notify_emails) values (1, array['oleksii.necheporenko@monarchi.agency']) on conflict (id) do nothing;

alter table meta_sync_settings enable row level security;
drop policy if exists meta_sync_settings_select on meta_sync_settings;
drop policy if exists meta_sync_settings_insert on meta_sync_settings;
drop policy if exists meta_sync_settings_update on meta_sync_settings;
drop policy if exists meta_sync_settings_delete on meta_sync_settings;
create policy meta_sync_settings_select on meta_sync_settings for select to authenticated using (true);
create policy meta_sync_settings_insert on meta_sync_settings for insert to authenticated with check (true);
create policy meta_sync_settings_update on meta_sync_settings for update to authenticated using (true) with check (true);
create policy meta_sync_settings_delete on meta_sync_settings for delete to authenticated using (true);
