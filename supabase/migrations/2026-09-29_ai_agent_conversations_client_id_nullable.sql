-- Run this once in the Supabase SQL editor for this project.
--
-- Phase 3 of docs/ai-agents-roadmap.md (§4.5, scheduled runs): the first
-- scheduled agent run (deal-health-check, see
-- 2026-09-29_deal_health_check_scheduled_run.sql) scans every open deal
-- across every client in one pass — there's no single client_id to attach
-- the resulting conversation row to, the same shape the manual
-- DealHealthCheck.jsx tool and the standalone Follow-up Generator/Cover
-- Letter Agent already have (see ai-agents-roadmap.md §4.3's note on this
-- pattern). Rather than keep working around a NOT NULL constraint that
-- doesn't hold for every agent, make it nullable — every existing reader
-- (agentActivity.js's fetchAgentActivity/fetchNeedsReviewCount,
-- AiAgentActivity.jsx's clientLabel()) already tolerates a missing/
-- unmatched client_id gracefully (falls back to '—'), so this is a pure
-- widening, not a breaking change.

alter table ai_agent_conversations alter column client_id drop not null;
