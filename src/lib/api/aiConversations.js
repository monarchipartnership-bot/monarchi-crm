import { supabase } from '../supabaseClient';

// AI-agent chat history — backs both the agent chat's own "Історія" tab
// (per client, one agent) and ClientProfile.jsx's "AI Team work history"
// tab (per client, across agents). Two tables: ai_agent_conversations
// (one row per dialogue) and ai_agent_messages (one row per message,
// `visual` holds an optional {type:'table'|'chart', ...} payload), seeded
// by supabase/migrations/2026-09-25_ai_agent_conversations.sql.

export async function fetchConversations(clientId, agentKey) {
  let query = supabase.from('ai_agent_conversations').select('*').eq('client_id', clientId).order('updated_at', { ascending: false });
  if (agentKey) query = query.eq('agent_key', agentKey);
  const { data, error } = await query;
  if (error) { console.warn('fetchConversations failed', error); return []; }
  return data ?? [];
}

export async function fetchConversationMessages(conversationId) {
  const { data, error } = await supabase
    .from('ai_agent_messages').select('*').eq('conversation_id', conversationId).order('position', { ascending: true });
  if (error) { console.warn('fetchConversationMessages failed', error); return []; }
  return data ?? [];
}

export async function createConversation(clientId, agentKey, firstUserMessage) {
  const title = (firstUserMessage || '').trim().slice(0, 60) || 'Нова розмова';
  const { data, error } = await supabase
    .from('ai_agent_conversations').insert({ client_id: clientId, agent_key: agentKey, title }).select().single();
  if (error) throw error;
  return data;
}

export async function appendMessages(conversationId, messages) {
  const { data: last } = await supabase
    .from('ai_agent_messages').select('position').eq('conversation_id', conversationId).order('position', { ascending: false }).limit(1);
  let position = last?.[0] ? last[0].position : 0;
  const rows = messages.map((m) => ({ conversation_id: conversationId, role: m.role, content: m.content, visual: m.visual ?? null, position: ++position }));
  const { error: insertError } = await supabase.from('ai_agent_messages').insert(rows);
  if (insertError) throw insertError;
  const { error: touchError } = await supabase.from('ai_agent_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  if (touchError) console.warn('touch conversation updated_at failed', touchError);
}
