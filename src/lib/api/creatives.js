import { supabase } from '../supabaseClient';
import { cleanRequest, connectCampaign, CREATIVE_ROLES, ensureCreativeDepartment, isCreativeRole } from '../agents/creativeTeam';
import { agentAction } from './agents';

// The creative department (migrations 20261040 and 20261041): its agents are shared workers, a client (campaign) is linked to each of them; requests, their
// tasks and creatives, the materials a manager uploads.
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

export const BUCKET = 'creative-assets';
export const MAX_FILE_MB = 8;
export const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// The department's agents (created on first use) and the links of this client to them, with the open tasks, in the shape the agent pages expect.
// `clients`: agent id -> the link row of this client (on/off, mode, priority, the client's own settings).
export async function loadCreativeTeam(campaign, email) {
  const { agents, links } = await ensureCreativeDepartment(supabase, email);
  const rows = await connectCampaign(supabase, campaign, { email });
  const ids = agents.map((a) => a.id);
  const open = ids.length ? must(await supabase.from('ag_tasks').select('agent_id, status').in('agent_id', ids).in('status', ['queued', 'running', 'failed'])) || [] : [];
  const counts = {};
  open.forEach((t) => { (counts[t.agent_id] ||= { queued: 0, running: 0, failed: 0 })[t.status] += 1; });
  return { agents, links, counts, clients: new Map(rows.map((r) => [r.agent_id, r])) };
}

export async function fetchRequests(campaignId) {
  const rows = must(await supabase.from('ag_creative_requests').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false })) || [];
  if (!rows.length) return [];
  const made = must(await supabase.from('ag_creatives').select('request_id, status').in('request_id', rows.map((r) => r.id))) || [];
  return rows.map((r) => ({ ...r, creatives: made.filter((c) => c.request_id === r.id).length }));
}

export async function createRequest(campaignId, input, email) {
  const clean = cleanRequest(input);
  return must(await supabase.from('ag_creative_requests').insert({ campaign_id: campaignId, title: clean.title, brief: clean.brief, materials: clean.materials, status: 'draft', created_by: email || null }).select().single());
}

export async function deleteRequest(id) {
  must(await supabase.from('ag_creative_requests').delete().eq('id', id).select());
}

// The request with what the chain made: its tasks (newest first), the creatives, and the cost of the model calls.
export async function fetchRequestDetail(id) {
  const request = must(await supabase.from('ag_creative_requests').select('*').eq('id', id).maybeSingle());
  if (!request) return null;
  const [tasks, creatives] = await Promise.all([
    supabase.from('ag_tasks').select('id, agent_id, status, output, error, cost_usd, created_at, finished_at').eq('request_id', id).order('id', { ascending: false }),
    supabase.from('ag_creatives').select('*').eq('request_id', id).order('id', { ascending: true }),
  ]);
  return { request, tasks: must(tasks) || [], creatives: must(creatives) || [] };
}

export const startRequest = (requestId) => agentAction('start_request', { requestId });
export const cancelRequest = (requestId) => agentAction('cancel_request', { requestId });
export const retryStudioTask = (taskId) => agentAction('retry_task', { taskId });
// A step the chain does not start by itself (the client's link is in manual mode): the person starts it for this client and request.
export const runStep = (agentId, campaignId, requestId) => agentAction('run_agent', { agentId, brief: { campaignId, requestId } });
// The person's OK on a result that waited before it goes to the next agent.
export const passOn = (taskId) => agentAction('pass_on', { taskId });

export const safeName = (n) => String(n || 'file').normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-60);

// One material of a request (logo, product photo, style example) goes to the storage bucket; the form keeps its public address.
export async function uploadMaterial(campaignId, file, kind) {
  if (!FILE_TYPES.includes(file.type)) throw new Error('Підходять лише картинки PNG, JPG або WebP.');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Файл більший за ${MAX_FILE_MB} МБ.`);
  const path = `${campaignId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message || 'Не вдалося завантажити файл.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { name: file.name, url: data.publicUrl, path, kind };
}

export { isCreativeRole, CREATIVE_ROLES, nowIso };
