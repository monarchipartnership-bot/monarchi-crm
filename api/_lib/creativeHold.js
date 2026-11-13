// Holds on a task of the creative department (step 3.7, owner 2026-11-13, after the task «пирожок»): the manager can stop a task at any moment (PAUSE) and an agent that doubts or does
// not understand the request STOPS the chain with a question (WAITING) until the manager answers. Nothing new starts and nothing new is paid for while a task is held; what already went to
// Higgsfield cannot be taken back (it arrives and waits for the manager). Status values of the request: 'paused' (a person did it), 'waiting' (an agent asked).
import { CAP_MESSAGE, cappedCampaigns } from './campaignCycles.js';
import { fanOutRequest, loadDepartment, settleRequest } from './creativeEngine.js';
import { generateCreatives } from './creativeMake.js';
import { logStep } from './taskSteps.js';

export const ASKING_ROLES = ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker'];
export const HOLD_STATUSES = ['paused', 'waiting'];
const iso = (d) => new Date(d).toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const isHeld = (req) => HOLD_STATUSES.includes(req?.status);
// the ids of the held requests (the queue does not start their tasks)
export async function heldRequestIds(db) {
  const rows = must(await db.from('ag_creative_requests').select('id').in('status', HOLD_STATUSES), 'requests') || [];
  return new Set(rows.map((r) => r.id));
}

const whoOf = (req, role = 'manager') => ({ request_id: req.id, campaign_id: req.campaign_id, role });

// An agent finished and has a question for the manager: the chain stops here. → true when the result is held (the caller does not start the agents below).
export async function questionGate(ctx, task, agent, outcome) {
  const { db } = ctx;
  const question = String(outcome?.output?.json?.clarify || '').trim();
  if (!question || !ASKING_ROLES.includes(agent?.role) || !task?.request_id || ctx.dryRun) return false;
  const req = must(await db.from('ag_creative_requests').select('id, status, campaign_id, brief').eq('id', task.request_id).maybeSingle(), 'request');
  if (!req || ['cancelled', 'done'].includes(req.status)) return false;
  const round = (req.brief?.clarifications || []).filter((c) => c.role === agent.role).length + 1;
  const now = iso(ctx.now());
  must(await db.from('ag_tasks').update({ output: { ...outcome.output, awaiting_answer: { question, round, at: now } } }).eq('id', task.id), 'task');
  if (req.status !== 'paused') must(await db.from('ag_creative_requests').update({ status: 'waiting', error: null, updated_at: now }).eq('id', req.id), 'request');
  await logStep(ctx, { ...whoOf(req, agent.role), task_id: task.id }, 'Питання менеджеру, завдання чекає відповіді: ' + clip(question, 220), 'info');
  try {
    const camp = (await db.from('ag_campaigns').select('project_id, created_by').eq('id', req.campaign_id).maybeSingle()).data;
    const mgr = ctx.email || camp?.created_by || null; // a scheduled run has no person at the screen: the one who made the operation is told
    if (mgr) await db.from('notifications').insert({ recipient_email: mgr, sender_email: mgr, type: 'ai_agent', project_id: camp?.project_id ?? null, title: `${agent.name || 'Агент'} питає: завдання чекає вашої відповіді`, body: clip(question, 300), link: camp?.project_id ? `/projects/${camp.project_id}?tab=creative` : null });
  } catch (e) { console.warn('question notification failed:', e?.message || e); }
  return true;
}

// The manager answers the question of an agent (or goes on without an answer). The SAME agent works again with the answer in front of it (an agent that still has a question asks again: any
// number of rounds); with `proceed` the result is taken as it is and the chain goes on.
export async function answerQuestion(ctx, taskId, { answer = '', proceed = false } = {}) {
  const { db } = ctx;
  const text = String(answer || '').replace(/\r\n/g, '\n').trim();
  if (!proceed && text.length < 2) throw new Error('Напишіть відповідь або оберіть «Продовжити без відповіді».');
  if (text.length > 1500) throw new Error('Відповідь завелика (понад 1500 символів).');
  const task = must(await db.from('ag_tasks').select('*').eq('id', taskId).maybeSingle(), 'task');
  if (!task || task.status !== 'done' || !task.output?.awaiting_answer) throw new Error('Це питання вже закрите або не знайдене.');
  const agent = must(await db.from('ag_agents').select('*').eq('id', task.agent_id).maybeSingle(), 'agent');
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', task.request_id).maybeSingle(), 'request');
  if (!req || req.status === 'cancelled') throw new Error('Завдання не знайдено або скасовано.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign || campaign.status === 'archived') throw new Error('Операція в архіві.');
  if (!proceed && (await cappedCampaigns(db)).has(String(req.campaign_id))) throw new Error(CAP_MESSAGE);
  const now = iso(ctx.now());
  const q = task.output.awaiting_answer;
  const closed = { ...q, answered_at: now, answered_by: ctx.email || null, answer: proceed ? null : text, proceeded: !!proceed };
  must(await db.from('ag_tasks').update({ output: { ...task.output, awaiting_answer: null, answered: closed } }).eq('id', taskId), 'task');
  const status = req.status === 'paused' ? 'paused' : 'running';
  if (proceed) {
    must(await db.from('ag_creative_requests').update({ status, updated_at: now }).eq('id', req.id), 'request');
    await logStep(ctx, whoOf(req), 'Менеджер: продовжити без відповіді на питання, результат береться як є', 'info');
    if (status === 'running') { const dept = await loadDepartment(db); await fanOutRequest(ctx, dept, agent, { ...task, output: { ...task.output, awaiting_answer: null } }); await settleRequest(ctx, req.id); }
    return { ok: true, proceeded: true };
  }
  const brief = { ...(req.brief || {}), clarifications: [...(req.brief?.clarifications || []), { role: agent.role, question: q.question, answer: text, by: ctx.email || null, at: now, task_id: taskId }] };
  must(await db.from('ag_creative_requests').update({ brief, status, error: null, updated_at: now }).eq('id', req.id), 'request');
  await logStep(ctx, whoOf(req), 'Менеджер відповів: ' + clip(text, 220) + '. ' + (agent.name || 'Агент') + ' працює над своїм кроком знову', 'info');
  must(await db.from('ag_tasks').insert({ agent_id: agent.id, type: 'creative', status: 'queued', brief: { trigger: 'answer', requestId: req.id, answerTo: taskId }, created_by: ctx.email || 'менеджер', request_id: req.id, campaign_id: req.campaign_id }).select().single(), 'task');
  return { ok: true, rerun: agent.role };
}

// «Пауза»: stops what has not started yet and everything new that costs money. → { ok, was }
export async function pauseRequest(ctx, requestId) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Завдання не знайдено.');
  if (req.status === 'paused') return { ok: true, was: 'paused' };
  if (['cancelled', 'done', 'draft'].includes(req.status)) throw new Error('Це завдання не в роботі: ставити на паузу нічого.');
  const now = iso(ctx.now());
  const was = req.status;
  const brief = { ...(req.brief || {}), pause: { from: was, at: now, by: ctx.email || null } };
  must(await db.from('ag_creative_requests').update({ status: 'paused', brief, updated_at: now }).eq('id', requestId), 'request');
  await logStep(ctx, whoOf(req), 'Менеджер поставив завдання на паузу: нові кроки й нові платні запити не стартують', 'info');
  return { ok: true, was };
}

// «Продовжити»: the task goes back to what it was; what could not start while it was held starts now.
export async function resumeRequest(ctx, requestId) {
  const { db } = ctx;
  const req = must(await db.from('ag_creative_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Завдання не знайдено.');
  if (req.status !== 'paused') throw new Error('Завдання не на паузі.');
  const campaign = must(await db.from('ag_campaigns').select('*').eq('id', req.campaign_id).maybeSingle(), 'campaign');
  if (!campaign || ['archived'].includes(campaign.status)) throw new Error('Операція в архіві: продовжити не можна.');
  const tasks = must(await db.from('ag_tasks').select('id, agent_id, status, output').eq('request_id', requestId).order('id', { ascending: true }), 'tasks') || [];
  const asking = tasks.some((t) => t.status === 'done' && t.output?.awaiting_answer);
  const now = iso(ctx.now());
  const { pause, ...rest } = req.brief || {};
  const back = asking ? 'waiting' : (pause?.from === 'review' ? 'review' : 'running');
  must(await db.from('ag_creative_requests').update({ status: back, brief: rest, updated_at: now }).eq('id', requestId), 'request');
  await logStep(ctx, whoOf(req), 'Менеджер продовжив завдання', 'info');
  if (back === 'waiting') return { ok: true, now: back };
  // what was held back: the agents below the last finished ones start now (the chain checks what is already done), then the pictures that were not sent
  const dept = await loadDepartment(db);
  const lastOf = new Map();
  tasks.filter((t) => t.status === 'done').forEach((t) => lastOf.set(t.agent_id, t));
  for (const t of lastOf.values()) {
    const agent = dept.byId.get(t.agent_id);
    if (agent) await fanOutRequest(ctx, dept, agent, { ...t, request_id: requestId, campaign_id: req.campaign_id });
  }
  const maker = dept.byRole.get('creative_maker');
  const heldGeneration = !!maker && !!lastOf.get(maker.id)?.output?.generation?.held; // the maker had finished while the task was held: its pictures were not sent (and only then; with the automatic sending off the manager sends them)
  const planned = must(await db.from('ag_creatives').select('id').eq('request_id', requestId).eq('status', 'planned').limit(1), 'creatives') || [];
  if (heldGeneration && planned.length && !(await cappedCampaigns(db)).has(String(req.campaign_id))) await generateCreatives(ctx, requestId).catch((e) => console.warn('generate after resume failed:', e?.message || e));
  await settleRequest(ctx, requestId);
  return { ok: true, now: back };
}
