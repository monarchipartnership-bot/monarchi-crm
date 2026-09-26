import { supabase } from '../supabaseClient';

// Cross-client, cross-agent activity feed — Phase 1 of
// docs/ai-agents-roadmap.md. Same ai_agent_conversations table the agent's
// own "Історія" tab and ClientProfile's "AI Team work history" tab already
// read (see lib/api/aiConversations.js), just viewed without a client_id
// filter, plus the review-queue columns added by
// supabase/migrations/2026-09-26_ai_agent_activity_tracking.sql.

export async function fetchAgentActivity({ agentKey, kind, needsReviewOnly } = {}) {
  let query = supabase.from('ai_agent_conversations').select('*').order('updated_at', { ascending: false });
  if (agentKey) query = query.eq('agent_key', agentKey);
  if (kind) query = query.eq('kind', kind);
  if (needsReviewOnly) query = query.eq('needs_review', true);
  const { data, error } = await query;
  if (error) { console.warn('fetchAgentActivity failed', error); return []; }
  return data ?? [];
}

// Lightweight count-only query backing the notification badges (sidebar
// "AI Agents" entry + the section's own "Задачі агентів" tab — see
// useAgentReviewCount.js) — no need to pull full rows just to show a
// number.
export async function fetchNeedsReviewCount() {
  const { count, error } = await supabase
    .from('ai_agent_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('needs_review', true);
  if (error) { console.warn('fetchNeedsReviewCount failed', error); return 0; }
  return count ?? 0;
}

export async function markReviewed(conversationId, reviewerEmail) {
  const { data, error } = await supabase
    .from('ai_agent_conversations')
    .update({ needs_review: false, reviewed_by: reviewerEmail, reviewed_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
