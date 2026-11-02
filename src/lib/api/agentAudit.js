import { supabase } from '../supabaseClient';
import { cleanApprovers } from '../agents/rights';

const must = ({ data, error }) => { if (error) throw error; return data; };

// → { approvers: [emails], isOps } for the person who is signed in. The list is changed only by operations managers (the database refuses anyone else).
export async function fetchRights(email) {
  const [settings, profile] = await Promise.all([
    supabase.from('ai_agent_settings').select('approvers').eq('id', 1).maybeSingle(),
    email ? supabase.from('profiles').select('role').eq('email', String(email).toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { approvers: must(settings)?.approvers || [], isOps: must(profile)?.role === 'ops_manager' };
}

export async function saveApprovers(list) {
  const approvers = cleanApprovers(list);
  must(await supabase.from('ai_agent_settings').update({ approvers, updated_at: new Date().toISOString() }).eq('id', 1).select());
  return approvers;
}

// The journal, newest first. filters: { campaignId, projectId, actor, action, from (ISO), to (ISO), limit }
export async function fetchAuditLog({ campaignId, projectId, actor, action, from, to, limit = 100 } = {}) {
  let q = supabase.from('ag_audit_log').select('*').order('at', { ascending: false }).limit(Math.min(Number(limit) || 100, 500));
  if (campaignId) q = q.eq('campaign_id', campaignId);
  if (projectId) q = q.eq('project_id', projectId);
  if (actor) q = q.eq('actor', String(actor).toLowerCase());
  if (action) q = q.eq('action', action);
  if (from) q = q.gte('at', from);
  if (to) q = q.lt('at', to);
  return must(await q) || [];
}
