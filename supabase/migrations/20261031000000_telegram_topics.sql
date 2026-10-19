-- Telegram forum topics: a supergroup with topics can take different kinds of messages in different topics.
--   tg_topics                          the topics the bot has seen in each chat (filled by the bot's webhook when someone writes in a topic):
--                                      thread_id = the id Telegram needs to post into it, name = its title when Telegram told us
--   site_lead_settings.telegram_topics { "<chat id>": <thread id> } the topic of each chat that gets the website leads (absent = the General topic)
-- The project agent keeps its own chat + topic in its config. Additive and safe to re-run. Signed-in team members only.
create table if not exists tg_topics (
  chat_id text not null references tg_chats(chat_id) on delete cascade,
  thread_id bigint not null,
  name text,
  last_seen_at timestamptz not null default now(),
  primary key (chat_id, thread_id)
);

alter table tg_topics enable row level security;
drop policy if exists tg_topics_select on tg_topics;
drop policy if exists tg_topics_insert on tg_topics;
drop policy if exists tg_topics_update on tg_topics;
drop policy if exists tg_topics_delete on tg_topics;
create policy tg_topics_select on tg_topics for select to authenticated using (true);
create policy tg_topics_insert on tg_topics for insert to authenticated with check (true);
create policy tg_topics_update on tg_topics for update to authenticated using (true) with check (true);
create policy tg_topics_delete on tg_topics for delete to authenticated using (true);

alter table site_lead_settings add column if not exists telegram_topics jsonb not null default '{}'::jsonb;
