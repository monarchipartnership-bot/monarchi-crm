-- Run this once in the Supabase SQL editor for this project.
--
-- Persists AI-agent chat history per client — backs both the "Історія"
-- tab inside the agent chat (ConstellationTest.jsx -> AdsInsightsAnalyst)
-- and ClientProfile.jsx's "AI Team work history" tab, previously a
-- disabled placeholder. `agent_key` defaults to the one agent that exists
-- today (ads-insights-analyst) but isn't constrained to it, so future
-- agents can log here too without a new table.
--
-- `ai_agent_messages.visual` is this schema's first jsonb column — every
-- other child-row table here (client_notes, deal_followup_steps,
-- client_changes) is fully normalized, but a message's optional
-- table/chart payload is genuinely variable-shaped structured data, so
-- jsonb is the right tool rather than forcing it into more columns/rows.

create table if not exists ai_agent_conversations (
  id bigint generated always as identity primary key,
  client_id bigint not null,
  agent_key text not null default 'ads-insights-analyst',
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_agent_conversations_client_idx on ai_agent_conversations(client_id);

create table if not exists ai_agent_messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null,
  role text not null,
  content text not null,
  visual jsonb,
  position int not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_agent_messages_conversation_idx on ai_agent_messages(conversation_id);

-- RLS — same read-open/write-authenticated pattern as every other table.
alter table ai_agent_conversations enable row level security;

drop policy if exists ai_agent_conversations_select on ai_agent_conversations;
create policy ai_agent_conversations_select on ai_agent_conversations for select using (true);
drop policy if exists ai_agent_conversations_insert on ai_agent_conversations;
create policy ai_agent_conversations_insert on ai_agent_conversations for insert with check (auth.role() = 'authenticated');
drop policy if exists ai_agent_conversations_update on ai_agent_conversations;
create policy ai_agent_conversations_update on ai_agent_conversations for update using (auth.role() = 'authenticated');
drop policy if exists ai_agent_conversations_delete on ai_agent_conversations;
create policy ai_agent_conversations_delete on ai_agent_conversations for delete using (auth.role() = 'authenticated');

alter table ai_agent_messages enable row level security;

drop policy if exists ai_agent_messages_select on ai_agent_messages;
create policy ai_agent_messages_select on ai_agent_messages for select using (true);
drop policy if exists ai_agent_messages_insert on ai_agent_messages;
create policy ai_agent_messages_insert on ai_agent_messages for insert with check (auth.role() = 'authenticated');
drop policy if exists ai_agent_messages_update on ai_agent_messages;
create policy ai_agent_messages_update on ai_agent_messages for update using (auth.role() = 'authenticated');
drop policy if exists ai_agent_messages_delete on ai_agent_messages;
create policy ai_agent_messages_delete on ai_agent_messages for delete using (auth.role() = 'authenticated');
