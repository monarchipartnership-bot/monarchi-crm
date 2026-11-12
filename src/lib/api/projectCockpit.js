import { supabase } from '../supabaseClient';
import { buildCockpit, isActiveCampaign, sortProjects, summaryOf } from '../agents/projectCockpit';
import { agentAction, kickQueue } from './agents';
import { estimateGeneration, generateCreatives, pollCreatives, retryStudioTask, setCreativeStatus, startRequest } from './creatives';
import { reviewOutcome } from '../agents/operationCycles';
import { uploadAsset } from './projectCreative';
import { downloadOne, downloadZip } from '../creatives/download';

const must = ({ data, error }) => { if (error) throw error; return data; };
const WINDOW_DAYS = 30;

// One read of everything the cabinets need: the campaigns that are worked on, their requests, the steps of the chain, the creatives, the library and the money.
// The notes and the issues are cut out of the big output of a step on the server side, so the lists stay light.
export async function fetchCockpits() {
  const campaigns = must(await supabase.from('ag_campaigns').select('*').neq('status', 'archived').order('created_at', { ascending: false })) || [];
  if (!campaigns.length) return { list: [], byId: {} };
  const ids = campaigns.map((c) => c.id);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const projectIds = [...new Set(campaigns.map((c) => c.project_id).filter(Boolean))];
  const [requests, projects, tasks, agents, assets, spend, stepRows, intelRows] = await Promise.all([
    supabase.from('ag_creative_requests').select('*').in('campaign_id', ids).order('created_at', { ascending: false }).limit(300),
    supabase.from('projects').select('id, name, client').in('id', [...new Set(campaigns.map((c) => c.project_id).filter(Boolean))]),
    supabase.from('ag_tasks').select('id, agent_id, request_id, campaign_id, status, error, cost_usd, created_at, started_at, finished_at, summary:output->>summary, notes:output->json->>notes, issues:output->json->issues').in('campaign_id', ids).gte('created_at', since).order('id', { ascending: false }).limit(1500),
    supabase.from('ag_agents').select('id, role').eq('team', 'creative'),
    supabase.from('project_creative_assets').select('project_id'),
    supabase.from('ag_creative_spend').select('campaign_id, usd').in('campaign_id', ids),
    // the live steps of the agents (what each does right now) and the profile of the client made by the scout
    supabase.from('ag_task_steps').select('id, task_id, request_id, campaign_id, role, text, state, created_at').in('campaign_id', ids).gte('created_at', since).order('id', { ascending: false }).limit(1200),
    projectIds.length ? supabase.from('ag_project_intel').select('*').in('project_id', projectIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const reqs = must(requests) || [];
  const creatives = reqs.length ? must(await supabase.from('ag_creatives').select('id, request_id, concept_key, concept_name, ratio, status, asset_url, final_url, cost_usd, note, copy').in('request_id', reqs.map((r) => r.id))) || [] : [];
  const projectOf = new Map((must(projects) || []).map((p) => [p.id, p]));
  const assetCount = {};
  (must(assets) || []).forEach((a) => { assetCount[a.project_id] = (assetCount[a.project_id] || 0) + 1; });
  const spendBy = {};
  (must(spend) || []).forEach((s) => { spendBy[s.campaign_id] = (spendBy[s.campaign_id] || 0) + Number(s.usd || 0); });
  const taskRows = must(tasks) || [];
  const steps = must(stepRows) || [];
  const intelOf = new Map((must(intelRows) || []).map((r) => [r.project_id, r]));
  const agentRows = must(agents) || [];

  // the cabinet of every launched operation (the card of a project opens a paused one too); the list of the map keeps only the ones that are worked on
  const byId = {};
  campaigns.filter((c) => c.status !== 'draft').forEach((c) => {
    byId[c.id] = buildCockpit({ campaign: c, project: projectOf.get(c.project_id) || {}, requests: reqs, tasks: taskRows, creatives, agents: agentRows, library: { assets: assetCount[c.project_id] || 0 }, spend: spendBy[c.id] || 0, steps: steps.filter((x) => x.campaign_id === c.id), intel: intelOf.get(c.project_id) || null });
  });
  const worked = new Set(campaigns.filter((c) => isActiveCampaign(c, reqs)).map((c) => c.id));
  return { list: sortProjects(Object.values(byId).filter((c) => worked.has(c.id)).map(summaryOf)), byId };
}

// One step of the chain opened in full (read when the person asks, so the cabinet stays light): the whole text it produced, what it was given, and how the runs went.
// → { text, error, runs: [{ model, durationMs, inputTokens, outputTokens, costUsd, createdAt, status, error, input }] }
export async function fetchStepDetail(taskId) {
  const [task, runs] = await Promise.all([
    supabase.from('ag_tasks').select('id, error, output').eq('id', taskId).maybeSingle(),
    supabase.from('ag_runs').select('model, duration_ms, input_tokens, output_tokens, cost_usd, created_at, status, error, user_prompt').eq('task_id', taskId).order('id', { ascending: false }).limit(3),
  ]);
  const t = must(task);
  return {
    text: String(t?.output?.text || '').trim(), error: t?.error || '',
    runs: (must(runs) || []).map((r) => ({ model: r.model || '', durationMs: r.duration_ms || 0, inputTokens: r.input_tokens || 0, outputTokens: r.output_tokens || 0, costUsd: Number(r.cost_usd) || 0, createdAt: r.created_at, status: r.status, error: r.error || '', input: String(r.user_prompt || '') })),
  };
}

// After the person decided on pictures the request follows them: every picture approved = the cycle is done; something returned or still waiting = it is on review again.
async function settleReview(requestId) {
  if (!requestId) return;
  const rows = must(await supabase.from('ag_creatives').select('status').eq('request_id', requestId)) || [];
  const want = reviewOutcome(rows);
  if (!want) return;
  const req = must(await supabase.from('ag_creative_requests').select('status').eq('id', requestId).maybeSingle());
  if (!req || !['review', 'done'].includes(req.status) || req.status === want) return;
  const now = new Date().toISOString();
  must(await supabase.from('ag_creative_requests').update({ status: want, updated_at: now, ...(want === 'done' ? { finished_at: now } : {}) }).eq('id', requestId).select());
}

// What the person presses in a card (the names of the actions are the contract with the design components). Every function throws a readable Error.
export async function runCockpitAction(item, key, payload = {}, { cockpit = null, email = null } = {}) {
  const kick = () => kickQueue().catch(() => {});
  if (key === 'download_one') {
    const file = (cockpit?.requests || []).flatMap((r) => r.items || []).find((i) => i.id === payload.creativeId);
    if (!file) throw new Error('Креатив не знайдено.');
    await downloadOne(file, { project: cockpit.client || cockpit.name });
    return {};
  }
  if (key === 'download_all') {
    const request = (cockpit?.requests || []).find((r) => r.id === payload.requestId);
    const wanted = Array.isArray(payload.statuses) && payload.statuses.length ? payload.statuses : null;
    const files = (request?.items || []).filter((i) => i.url && (!wanted || wanted.includes(i.status)));
    const name = `${cockpit?.client || cockpit?.name || 'creatives'}_zapyt-${payload.requestId}`;
    const n = await downloadZip(files, { project: cockpit?.client || cockpit?.name, zipName: name });
    return { downloaded: n };
  }
  const rid = payload.requestId ?? item?.requestId ?? null;
  // every approved picture of the operation (or of one cycle) in one archive: the cycles stay, so it can be downloaded again at any time
  if (key === 'download_approved') {
    const reqs = (cockpit?.requests || []).filter((r) => payload.requestId == null || r.id === payload.requestId);
    const files = reqs.flatMap((r) => (r.items || []).filter((i) => i.status === 'approved' && i.url));
    if (!files.length) throw new Error('Затверджених креативів ще немає.');
    const n = await downloadZip(files, { project: cockpit?.client || cockpit?.name, zipName: `${cockpit?.client || cockpit?.name || 'creatives'}_zatverdzheni${payload.requestId != null ? `_cykl-${payload.requestId}` : ''}` });
    return { downloaded: n };
  }
  // the returned pictures are made again with the manager's comment (the price is asked first, nothing is spent)
  if (key === 'rework_estimate' || key === 'rework_confirm') {
    const ids = payload.creativeIds || [];
    if (!rid || !ids.length) throw new Error('Немає повернених креативів.');
    const res = key === 'rework_estimate' ? await estimateGeneration(rid, ids) : await generateCreatives(rid, ids);
    if (res?.configured === false) throw new Error('Higgsfield не налаштовано на сервері.');
    if (res?.capped) throw new Error(res.error || 'Операція досягла ліміту витрат.');
    if (key === 'rework_estimate') {
      if (res?.failed?.length && !res.count) throw new Error(res.failed[0].error || 'Не вдалося оцінити вартість.');
      return { rework: { usd: Number(res.estimateUsd || 0), count: Number(res.count || 0), limitUsd: Number(res.limit || 0), skipped: (res.skipped || []).length } };
    }
    if (res?.failed?.length && !res.submitted) throw new Error(res.failed[0].error || 'Не вдалося запустити генерацію.');
    if (!res?.submitted) throw new Error('Нічого не запущено: картинки не вміщаються в ліміт витрат на один запит.');
    kick();
    return { submitted: res.submitted || 0 };
  }
  if (key === 'start_cycle') { if (!rid) throw new Error('Завдання не знайдено.'); await startRequest(rid); kick(); return {}; }
  if (key === 'approve_all') {
    const ids = payload.creativeIds?.length ? payload.creativeIds : (item?.creatives || []).map((c) => c.id);
    if (!ids.length) throw new Error('Немає креативів на перегляд.');
    for (const id of ids) await setCreativeStatus(id, 'approved');
    await settleReview(rid);
    return {};
  }
  if (key === 'overlay') { await agentAction('overlay_creative', { creativeId: payload.creativeId }); return {}; } // the headline and the button over the picture, made again
  if (key === 'edit_text') { // the words of a ready creative changed by a person: put on the same picture again (free); edit null = back to what the agents made
    const r = await agentAction('edit_creative_text', { creativeId: payload.creativeId, edit: payload.edit ?? null });
    if (r?.ok === false) throw new Error({ 'no-picture': 'У креатива немає картинки, на яку можна накласти текст.', 'empty-edit': 'Нічого змінювати.', 'no-creative': 'Креатив не знайдено.' }[r.reason] || 'Не вдалося накласти текст.');
    return {};
  }
  if (key === 'approve_one') { await setCreativeStatus(payload.creativeId, 'approved'); await settleReview(rid); return {}; }
  if (key === 'return') {
    const ids = payload.creativeIds?.length ? payload.creativeIds : (item?.creatives || []).map((c) => c.id);
    const comment = String(payload.comment || '').trim();
    if (!comment) throw new Error('Напишіть коментар: що саме не так.');
    for (const id of ids) await setCreativeStatus(id, 'rejected', comment);
    await settleReview(rid);
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
