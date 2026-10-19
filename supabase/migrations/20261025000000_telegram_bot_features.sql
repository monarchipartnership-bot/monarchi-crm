-- Telegram bot features for the website leads: the form of the message, reminders for leads nobody has taken, and who is pinged in the chat.
--   site_lead_settings  + message_template (null = the standard form), show_button, reminders_enabled, reminder_minutes, reminder_max
--   site_leads          + telegram_messages (chat id -> message id, so a reminder can reply to the original), reminders_sent, last_reminder_at
--   tg_chats            the chats the bot has seen (filled by the bot's webhook), and whether the bot is still in them
--   tg_members          the people the bot has seen in those chats (the Bot API cannot list a group's members: admins + whoever wrote or joined),
--                       `ping` = this person is mentioned in every lead message and reminder until someone unticks them
-- Additive and safe to re-run. Signed-in team members only.

alter table site_lead_settings add column if not exists message_template text;
alter table site_lead_settings add column if not exists show_button boolean not null default true;
alter table site_lead_settings add column if not exists reminders_enabled boolean not null default false;
alter table site_lead_settings add column if not exists reminder_minutes integer not null default 30 check (reminder_minutes between 5 and 1440);
alter table site_lead_settings add column if not exists reminder_max smallint not null default 3 check (reminder_max between 1 and 10);

alter table site_leads add column if not exists telegram_messages jsonb;
alter table site_leads add column if not exists reminders_sent smallint not null default 0;
alter table site_leads add column if not exists last_reminder_at timestamptz;

create table if not exists tg_chats (
  chat_id text primary key,
  title text,
  type text,
  bot_status text,                       -- member | administrator | left | kicked
  last_seen_at timestamptz not null default now()
);

create table if not exists tg_members (
  chat_id text not null references tg_chats(chat_id) on delete cascade,
  user_id bigint not null,
  username text,
  name text,
  is_admin boolean not null default false,
  ping boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table tg_chats enable row level security;
alter table tg_members enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tg_chats', 'tg_members'] loop
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
