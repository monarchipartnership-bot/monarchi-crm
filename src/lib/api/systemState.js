import { authedPost } from '../adAccounts';

// The page «Стан системи»: the clock, the keys (set or not), the queue and the notices. → { status, checks: [{ key, label, status, detail }] }
export const fetchSystemState = () => authedPost('/api/system-state', {});

// «Надіслати тестове»: one message to the topic «потрібна увага» or «витрати». thread: 'attention' | 'spend'
export const sendTelegramTest = (thread) => authedPost('/api/system-state', { action: 'telegram_test', thread });

// «Перезапустити зависші»: every agent whose task hangs is restarted (the server puts its work back in the queue; nothing is deleted). → how many agents
export async function restartStuck() {
  const { supabase } = await import('../supabaseClient');
  const { agentAction } = await import('./agents');
  const { stuckAgents } = await import('../agents/systemState');
  const { data, error } = await supabase.from('ag_tasks').select('agent_id, status, lease_until').eq('status', 'running').limit(500);
  if (error) throw error;
  const ids = stuckAgents(data || []);
  for (const agentId of ids) await agentAction('restart_agent', { agentId });
  return ids.length;
}
