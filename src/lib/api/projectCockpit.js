import { supabase } from '../supabaseClient';
import { buildCockpit, isActiveCampaign, sortProjects, summaryOf } from '../agents/projectCockpit';
import { kickQueue } from './agents';
import { estimateGeneration, generateCreatives, pollCreatives, retryStudioTask, setCreativeStatus } from './creatives';
import { uploadAsset } from './projectCreative';

const must = ({ data, error }) => { if (error) throw error; return data; };
const WINDOW_DAYS = 30;

// One read of everything the cabinets need: the campaigns that are worked on, their requests, the steps of the chain, the creatives, the library and the money.
// The notes and the issues are cut out of the big output of a step on the server side, so the lists stay light.
export async function fetchCockpits() {
  const campaigns = must(await supabase.from('ag_campaigns').select('*').neq('status', 'archived').order('created_at', { ascending: false })) || [];
  if (!campaigns.length) return { list: [], byId: {} };
  const ids = campaigns.map((c) => c.id);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const [requests, projects, tasks, agents, assets, spend] = await Promise.all([
    supabase.from('ag_creative_requests').select('*').in('campaign_id', ids).order('created_at', { ascending: false }).limit(300),
    supabase.from('projects').select('id, name, client').in('id', [...new Set(campaigns.map((c) => c.project_id).filter(Boolean))]),
    supabase.from('ag_tasks').select('id, agent_id, request_id, campaign_id, status, error, cost_usd, created_at, finished_at, notes:output->json->>notes, issues:output->json->issues').in('campaign_id', ids).gte('created_at', since).order('id', { ascending: false }).limit(1500),
    supabase.from('ag_agents').select('id, role').eq('team', 'creative'),
    supabase.from('project_creative_assets').select('project_id'),
    supabase.from('ag_creative_spend').select('campaign_id, usd').in('campaign_id', ids),
  ]);
  const reqs = must(requests) || [];
  const creatives = reqs.length ? must(await supabase.from('ag_creatives').select('id, request_id, concept_key, concept_name, ratio, status, asset_url, final_url, cost_usd, note').in('request_id', reqs.map((r) => r.id))) || [] : [];
  const projectOf = new Map((must(projects) || []).map((p) => [p.id, p]));
  const assetCount = {};
  (must(assets) || []).forEach((a) => { assetCount[a.project_id] = (assetCount[a.project_id] || 0) + 1; });
  const spendBy = {};
  (must(spend) || []).forEach((s) => { spendBy[s.campaign_id] = (spendBy[s.campaign_id] || 0) + Number(s.usd || 0); });
  const taskRows = must(tasks) || [];
  const agentRows = must(agents) || [];

  const byId = {};
  campaigns.filter((c) => isActiveCampaign(c, reqs)).forEach((c) => {
    byId[c.id] = buildCockpit({ campaign: c, project: projectOf.get(c.project_id) || {}, requests: reqs, tasks: taskRows, creatives, agents: agentRows, library: { assets: assetCount[c.project_id] || 0 }, spend: spendBy[c.id] || 0 });
  });
  return { list: sortProjects(Object.values(byId).map(summaryOf)), byId };
}

// What the person presses in a card (the names of the actions are the contract with the design components). Every function throws a readable Error.
export async function runCockpitAction(item, key, payload = {}, { cockpit = null, email = null } = {}) {
  const kick = () => kickQueue().catch(() => {});
  if (key === 'approve_all') { for (const c of item.creatives || []) await setCreativeStatus(c.id, 'approved'); return {}; }
  if (key === 'approve_one') { await setCreativeStatus(payload.creativeId, 'approved'); return {}; }
  if (key === 'return') {
    const ids = payload.creativeIds?.length ? payload.creativeIds : (item.creatives || []).map((c) => c.id);
    const comment = String(payload.comment || '').trim();
    if (!comment) throw new Error('Напишіть коментар: що саме не так.');
    for (const id of ids) await setCreativeStatus(id, 'rejected', comment);
    return {};
  }
  if (key === 'retry_step') { await retryStudioTask(item.taskId); kick(); return {}; }
  if (key === 'estimate') {
    const res = await estimateGeneration(item.requestId);
    if (res?.configured === false) throw new Error(`Higgsfield не налаштовано на сервері${res.missing?.length ? ` (немає: ${res.missing.join(', ')})` : ''}.`);
    if (res?.failed?.length) throw new Error(res.failed[0].error || 'Не вдалося оцінити вартість.');
    return { estimate: { usd: Number(res.estimateUsd || 0), count: Number(res.count || 0), limitUsd: Number(res.limit || 0), skipped: (res.skipped || []).length } };
  }
  if (key === 'confirm_generation') {
    const res = await generateCreatives(item.requestId);
    if (res?.configured === false) throw new Error('Higgsfield не налаштовано на сервері.');
    if (res?.failed?.length && !res.submitted) throw new Error(res.failed[0].error || 'Не вдалося запустити генерацію.');
    kick();
    return { submitted: res.submitted || 0 };
  }
  if (key === 'upload_assets') {
    if (!cockpit?.projectId) throw new Error('Невідомий проєкт.');
    for (const file of [...(payload.files || [])]) await uploadAsset(cockpit.projectId, file, payload.kind || 'product', email);
    return {};
  }
  if (key === 'dismiss') return { dismissed: item.id };
  throw new Error('Невідома дія.');
}

// The pictures that are being made are asked about on the way (the cron does it too, every 15 minutes).
export async function pollProducing(byId) {
  const open = Object.values(byId).flatMap((c) => c.requests.filter((r) => r.creatives.producing > 0).map((r) => r.id));
  for (const id of open.slice(0, 3)) await pollCreatives(id).catch(() => {});
}
