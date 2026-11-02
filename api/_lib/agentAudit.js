// The server side of rights and the journal (src/lib/agents/rights.js decides, this reads and writes): who the person is (approver, operations manager) and the journal row with
// the campaign and project the action touched. Writing the journal is best effort: a failure there must never undo an action that has already happened.
import { auditEntry, canDo, deniedEntry } from '../../src/lib/agents/rights.js';
import { CAMPAIGN_TEAM } from '../../src/lib/agents/campaignTeam.js';

const lower = (e) => String(e || '').toLowerCase();

// → { approvers, isOps } for this person (email of the session)
export async function loadRights(db, email) {
  const settings = (await db.from('ai_agent_settings').select('approvers').eq('id', 1).maybeSingle()).data;
  const profile = email ? (await db.from('profiles').select('role').eq('email', lower(email)).maybeSingle()).data : null;
  return { approvers: settings?.approvers || [], isOps: profile?.role === 'ops_manager' };
}

// Which campaign an action is about, from what the page sent (a campaign, a request, a task or an agent). → campaign id or null
export async function campaignOfBody(db, body = {}) {
  if (body.campaignId) return Number(body.campaignId);
  if (body.requestId) return (await db.from('ag_creative_requests').select('campaign_id').eq('id', Number(body.requestId)).maybeSingle()).data?.campaign_id ?? null;
  const agentCampaign = async (agentId) => {
    const a = (await db.from('ag_agents').select('team, scope_id').eq('id', agentId).maybeSingle()).data;
    return a?.team === CAMPAIGN_TEAM && a.scope_id ? Number(a.scope_id) : null;
  };
  if (body.taskId) {
    const t = (await db.from('ag_tasks').select('campaign_id, agent_id').eq('id', Number(body.taskId)).maybeSingle()).data;
    return t?.campaign_id ?? (t?.agent_id ? await agentCampaign(t.agent_id) : null);
  }
  if (body.agentId) return agentCampaign(Number(body.agentId));
  return null;
}

export async function writeAudit(ctx, entry, body = {}) {
  if (!entry) return false;
  try {
    const campaignId = await campaignOfBody(ctx.db, body);
    const projectId = campaignId ? (await ctx.db.from('ag_campaigns').select('project_id').eq('id', campaignId).maybeSingle()).data?.project_id ?? null : null;
    const { error } = await ctx.db.from('ag_audit_log').insert({ actor: ctx.email || null, action: entry.action, campaign_id: campaignId, project_id: projectId, subject: entry.subject, summary: entry.summary, meta: entry.meta || {} });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.warn('audit failed:', e?.message || e);
    return false;
  }
}

// The gate in front of an action. → { ok } or { ok: false, reason } (and the refused attempt is written to the journal). The cron is the system itself and is not checked.
export async function checkRights(ctx, action, body = {}) {
  if (ctx.trigger === 'cron') return { ok: true };
  const rights = await loadRights(ctx.db, ctx.email);
  const verdict = canDo({ action, email: ctx.email, approvers: rights.approvers, isOps: rights.isOps, estimateOnly: body.estimateOnly === true });
  if (!verdict.ok) await writeAudit(ctx, deniedEntry(action, verdict.reason), body);
  return verdict;
}

export const auditAfter = async (ctx, action, body, out) => (ctx.trigger === 'cron' ? false : writeAudit(ctx, auditEntry(action, body, out), body));
