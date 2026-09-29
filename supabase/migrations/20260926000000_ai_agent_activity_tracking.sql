-- Run this once in the Supabase SQL editor for this project.
--
-- Phase 1 of docs/ai-agents-roadmap.md: a dedicated activity feed + human-
-- review queue for AI agent runs, separate from the human Task Manager
-- (an agent run's own lifecycle — queued/running/needs-review/reviewed —
-- doesn't map onto human task statuses).
--
-- Rather than a brand new table, this extends the existing
-- ai_agent_conversations (2026-09-25_ai_agent_conversations.sql) — every
-- agent exchange already creates a conversation row, so the activity feed
-- is just those rows viewed cross-client instead of scoped to one client's
-- profile. `kind` distinguishes a one-shot audit (worth a human glancing
-- at the result) from ordinary back-and-forth chat; `needs_review` is set
-- true only for audits, `created_by` records who ran it.

alter table ai_agent_conversations
  add column if not exists kind text not null default 'chat',
  add column if not exists created_by text,
  add column if not exists needs_review boolean not null default false,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz;

create index if not exists ai_agent_conversations_needs_review_idx
  on ai_agent_conversations(needs_review) where needs_review;
create index if not exists ai_agent_conversations_updated_idx
  on ai_agent_conversations(updated_at desc);
