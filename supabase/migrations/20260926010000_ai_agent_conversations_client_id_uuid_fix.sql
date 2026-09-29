-- Run this once in the Supabase SQL editor for this project.
--
-- Fixes a bug in 2026-09-25_ai_agent_conversations.sql: `client_id` was
-- declared `bigint`, but `clients.id` is `uuid` — every insert referencing
-- a real client has been failing ever since with
-- "invalid input syntax for type bigint: <uuid>", caught silently by the
-- app's own error handling (createConversation/appendMessages callers
-- treat a save failure as best-effort and don't surface it). Discovered
-- while verifying the Phase 1 agent activity feed. The table is new and
-- was never successfully written to with a real client_id, so this is a
-- safe, lossless type change.

alter table ai_agent_conversations
  alter column client_id type uuid using client_id::text::uuid;
