import { supabase } from '../supabaseClient';
import { BUCKET, FILE_TYPES, MAX_FILE_MB, safeName } from './creatives';
import { authedPost } from '../adAccounts';
import { loadOverviewData } from '../workflow/overviewData';

// The tables of the new agent system (migrations 20261068, 20261069): the state of a project, the dossier with its versions, the approvals, the journal.
// A person never changes versions or the journal rows: they only add new ones (the tables are append-only for versions and journal).

const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const UNIQUE = '23505';
const nowIso = () => new Date().toISOString();

async function journal(projectId, email, { action, subject = null, summary = '', meta = {} }) {
  must(await supabase.from('wf_journal').insert({ project_id: projectId, actor_kind: 'human', actor: email || 'manager', action, subject, summary, meta }), 'journal');
}

// ----------------------------------------------------------------------- the overview of one project
export async function fetchProcess(projectId) {
  const [state, runs, approvals, journalRows, sections] = await Promise.all([
    supabase.from('wf_project_state').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('wf_runs').select('id, agent, skill, status, created_at, finished_at, error').eq('project_id', projectId).order('id', { ascending: false }).limit(100),
    supabase.from('wf_approvals').select('*').eq('project_id', projectId).order('id', { ascending: false }).limit(50),
    supabase.from('wf_journal').select('id, at, actor_kind, actor, action, summary, meta').eq('project_id', projectId).order('id', { ascending: false }).limit(15),
    supabase.from('wf_sections').select('id, key, status, needs_reapproval, current_version_id, updated_at').eq('project_id', projectId),
  ]);
  return { state: must(state, 'state'), runs: must(runs, 'runs') || [], approvals: must(approvals, 'approvals') || [], journal: must(journalRows, 'journal') || [], sections: must(sections, 'sections') || [] };
}

export async function startProcess(projectId, email) {
  const r = await supabase.from('wf_project_state').insert({ project_id: projectId });
  if (r.error && r.error.code !== UNIQUE) throw new Error('state: ' + r.error.message);
  await journal(projectId, email, { action: 'start', summary: 'Процес запущено вручну.' });
}
export async function patchState(projectId, patch, email, summary) {
  must(await supabase.from('wf_project_state').update({ ...patch, updated_at: nowIso() }).eq('project_id', projectId), 'state');
  if (summary) await journal(projectId, email, { action: 'state', summary });
}

// One pass of the orchestrator on demand (the cron is not switched on yet).
export async function runTickNow() {
  const { authedPost } = await import('../adAccounts.js');
  return authedPost('/api/wf-tick', {});
}

// ----------------------------------------------------------------------- the dossier
export async function fetchDossier(projectId) {
  return must(await supabase.from('wf_sections').select('id, key, status, needs_reapproval, current_version_id, updated_at').eq('project_id', projectId), 'sections') || [];
}
const VERSION_COLS = 'id, section_id, version, body, content, author_kind, author, is_proposal, sources, note, created_at, run_id';
export async function fetchVersions(sectionId) {
  if (!sectionId) return [];
  return must(await supabase.from('wf_section_versions').select(VERSION_COLS).eq('section_id', sectionId).order('version', { ascending: false }), 'versions') || [];
}
// The proposals that were already answered live in the journal (versions are never changed).
export async function fetchAnsweredProposals(projectId, key) {
  const rows = must(await supabase.from('wf_journal').select('meta').eq('project_id', projectId).eq('subject', key).in('action', ['proposal_accepted', 'proposal_rejected']), 'journal') || [];
  return new Set(rows.map((r) => r.meta?.version_id).filter(Boolean));
}
async function ensureSection(projectId, key) {
  const found = must(await supabase.from('wf_sections').select('id').eq('project_id', projectId).eq('key', key).maybeSingle(), 'section');
  if (found) return found.id;
  const made = await supabase.from('wf_sections').insert({ project_id: projectId, key }).select('id').single();
  if (made.error && made.error.code === UNIQUE) return must(await supabase.from('wf_sections').select('id').eq('project_id', projectId).eq('key', key).single(), 'section').id;
  return must(made, 'section').id;
}
// A person's edit is a new version; the agent can no longer replace it (it only proposes).
export async function saveHumanVersion(projectId, key, body, email, note = null, content = {}) {
  const sectionId = await ensureSection(projectId, key);
  const row = must(await supabase.from('wf_section_versions').insert({ section_id: sectionId, body, content, author_kind: 'human', author: email || 'manager', note }).select(VERSION_COLS).single(), 'version');
  await journal(projectId, email, { action: 'edit', subject: key, summary: `Правка людини, версія ${row.version}.` });
  return row;
}
export async function acceptProposal(projectId, key, proposal, email) {
  const row = await saveHumanVersion(projectId, key, proposal.body, email, `Прийнято пропозицію агента (версія ${proposal.version})`, proposal.content || {}); // the structured part travels too: the ads a manager confirmed live in it
  await journal(projectId, email, { action: 'proposal_accepted', subject: key, summary: `Пропозицію версії ${proposal.version} прийнято.`, meta: { version_id: proposal.id } });
  return row;
}
export async function rejectProposal(projectId, key, proposal, email) {
  await journal(projectId, email, { action: 'proposal_rejected', subject: key, summary: `Пропозицію версії ${proposal.version} відхилено.`, meta: { version_id: proposal.id } });
}

// ----------------------------------------------------------------------- approvals
export async function fetchQueueData() {
  const [apps, states, projects] = await Promise.all([
    supabase.from('wf_approvals').select('*').order('id', { ascending: false }).limit(500),
    supabase.from('wf_project_state').select('project_id, stage, paused'),
    supabase.from('projects').select('id, name, client'),
  ]);
  const byId = {};
  for (const p of must(projects, 'projects') || []) byId[p.id] = { name: p.client || p.name };
  return { projects: byId, states: must(states, 'states') || [], approvals: must(apps, 'approvals') || [] };
}
// The tab «Апруви» of one project: its state and all its approvals (the newest 200).
export async function fetchApprovalsOf(projectId) {
  const [state, apps] = await Promise.all([
    supabase.from('wf_project_state').select('project_id, stage, paused').eq('project_id', projectId).maybeSingle(),
    supabase.from('wf_approvals').select('*').eq('project_id', projectId).order('id', { ascending: false }).limit(200),
  ]);
  return { state: must(state, 'state'), approvals: must(apps, 'approvals') || [] };
}
// «Схвалити» or «Повернути». The orchestrator reads the answer on its next pass.
export async function decideApproval(approval, status, comment, email, remarks = null) {
  const text = (comment || '').trim();
  if (status === 'returned' && !text) throw new Error('Щоб повернути, напишіть коментар: агент має знати, що виправити.');
  const patch = { status, comment: text || null, decided_by: email || 'manager', decided_at: nowIso() };
  if (remarks) patch.subject = { ...(approval.subject || {}), remarks: remarks.filter((x) => String(x.text || '').trim()).map((x) => ({ target: String(x.target), text: String(x.text).trim().slice(0, 600) })) }; // remarks pinned to the blocks of the package
  const r = await supabase.from('wf_approvals').update(patch).eq('id', approval.id).eq('status', 'pending').select('id');
  if (r.error) throw new Error('approval: ' + r.error.message);
  if (!r.data?.length) throw new Error('Це рішення вже прийнято в іншому місці. Оновіть сторінку.');
  await journal(approval.project_id, email, { action: status === 'approved' ? 'approved' : 'returned', subject: approval.kind, summary: `${status === 'approved' ? 'Схвалено' : 'Повернуто'}: ${approval.kind}${text ? '. ' + text : ''}` });
}
// The answer of the client, recorded by the manager after Апрув 1: one finished row of kind «client».
export async function recordClientAnswer(projectId, status, comment, email, remarks = null) {
  const text = (comment || '').trim();
  if (status === 'returned' && !text) throw new Error('Щоб повернути, напишіть, що клієнт просить виправити.');
  const subject = { section: 'strategy', ...(remarks ? { remarks: remarks.filter((x) => String(x.text || '').trim()).map((x) => ({ target: String(x.target), text: String(x.text).trim().slice(0, 600) })) } : {}) };
  must(await supabase.from('wf_approvals').insert({ project_id: projectId, kind: 'client', subject, status, requested_by: email || 'manager', decided_by: email || 'manager', decided_at: nowIso(), comment: text || null }), 'client answer');
  await journal(projectId, email, { action: status === 'approved' ? 'approved' : 'returned', subject: 'client', summary: `Відповідь клієнта: ${status === 'approved' ? 'погодив' : 'повернув. ' + text}` });
}

// ----------------------------------------------------------------------- competitor ads confirmed by the manager
// The screenshot of an ad goes to the public bucket of the project's files (the model reads it by address); no row is made in the creative materials.
export async function uploadCompetitorShot(projectId, file) {
  if (!FILE_TYPES.includes(file.type)) throw new Error('Підходять лише картинки PNG, JPG або WebP.');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Файл більший за ${MAX_FILE_MB} МБ.`);
  const path = `projects/${projectId}/competitor-ads/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message || 'Не вдалося завантажити файл.');
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Asks the orchestrator for one more run of a skill (the same open run is not queued twice). → true if queued, false if one is already open.
export async function requestRun(projectId, agent, skill, email) {
  const r = await supabase.from('wf_runs').insert({ project_id: projectId, agent, skill, trigger: 'manual', priority: 50, created_by: email || 'manager' });
  if (r.error) { if (r.error.code === UNIQUE) return false; throw new Error('run: ' + r.error.message); }
  await journal(projectId, email, { action: 'run_requested', subject: skill, summary: `Менеджер попросив ще один запуск: ${agent} / ${skill}.` });
  return true;
}

// ----------------------------------------------------------------------- the package of the first launch (strategy + creatives) for the review
// → { strategy: { id, version, content, body } | null, creatives: ... , approval: { id, subject } | null }
export async function fetchPackage(projectId, approvalId = null) {
  const secs = must(await supabase.from('wf_sections').select('id, key, current_version_id').eq('project_id', projectId).in('key', ['strategy', 'creatives']), 'sections') || [];
  const ids = secs.map((x) => x.current_version_id).filter(Boolean);
  const vers = ids.length ? must(await supabase.from('wf_section_versions').select('id, version, body, content, author_kind, created_at').in('id', ids), 'versions') || [] : [];
  const out = { strategy: null, creatives: null, approval: null };
  for (const sec of secs) { const v = vers.find((x) => x.id === sec.current_version_id); if (v) out[sec.key] = v; }
  if (approvalId) out.approval = must(await supabase.from('wf_approvals').select('id, project_id, kind, subject, status').eq('id', approvalId).maybeSingle(), 'approval');
  return out;
}

// ----------------------------------------------------------------------- the pool of tasks of a project
export async function fetchTasks(projectId) {
  return must(await supabase.from('wf_tasks').select('*').eq('project_id', projectId).order('id', { ascending: false }).limit(300), 'tasks') || [];
}
// «Взяти в роботу», «Готово», «Відхилити» (a rejection needs a reason: the agents learn from it)
export async function setTaskStatus(task, status, { result = '', email } = {}) {
  if (status === 'rejected' && !String(result).trim()) throw new Error('Напишіть, чому відхиляєте задачу.');
  const r = await supabase.from('wf_tasks').update({ status, result: String(result).trim() || null, updated_at: nowIso() }).eq('id', task.id).select('id');
  if (r.error) throw new Error('task: ' + r.error.message);
  if (!r.data?.length) throw new Error('Задачу не знайдено або її вже змінили.');
  await journal(task.project_id, email, { action: 'task', subject: String(task.id), summary: `Задача «${task.title}»: ${{ in_progress: 'взято в роботу', done: 'зроблено', rejected: 'відхилено. ' + String(result).trim() }[status] || status}.` });
}
export async function setTaskOwner(task, owner, email) {
  const r = await supabase.from('wf_tasks').update({ owner, updated_at: nowIso() }).eq('id', task.id).select('id');
  if (r.error) throw new Error('task: ' + r.error.message);
  await journal(task.project_id, email, { action: 'task', subject: String(task.id), summary: `Задачу «${task.title}» передано: ${owner}.` });
}
// a task of a person (not of an agent): the pool is one list for both
export async function createTask(projectId, { title, type = 'client', owner = 'manager', priority = 'medium', due_date = null, evidence = '' }, email) {
  if (!String(title || '').trim()) throw new Error('Напишіть, що треба зробити.');
  const row = { project_id: projectId, type, title: String(title).trim(), owner, priority, evidence: String(evidence).trim() || null, created_by_kind: 'human', created_by: email || 'manager', due_date: /^\d{4}-\d{2}-\d{2}$/.test(due_date || '') ? due_date : null };
  return must(await supabase.from('wf_tasks').insert(row).select().single(), 'task');
}

// ----------------------------------------------------------------------- the overview of all projects (step A11)
export const fetchOverviewData = () => loadOverviewData(supabase);
// the emergency stop of ALL agents: the orchestrator reads it first on every pass
export async function setGlobalStop(on, email, reason = '') {
  const patch = { stopped: !!on, stopped_reason: on ? String(reason).trim() || null : null, stopped_by: email || 'manager', stopped_at: nowIso(), updated_at: nowIso() };
  const r = await supabase.from('wf_settings').update(patch).eq('id', 1).select('id');
  if (r.error) throw new Error('settings: ' + r.error.message);
  if (!r.data?.length) throw new Error('Налаштування системи не знайдено: застосуйте міграцію 20261071.');
}
export async function saveLimits({ monthly_cap_usd, project_cap_default_usd }) {
  const m = Number(monthly_cap_usd), p = Number(project_cap_default_usd);
  if (!Number.isFinite(m) || m < 0 || !Number.isFinite(p) || p < 0) throw new Error('Ліміт це число від 0 доларів.');
  const r = await supabase.from('wf_settings').update({ monthly_cap_usd: m, project_cap_default_usd: p, updated_at: nowIso() }).eq('id', 1).select('id');
  if (r.error) throw new Error('settings: ' + r.error.message);
  if (!r.data?.length) throw new Error('Налаштування системи не знайдено: застосуйте міграцію 20261071.');
}
export async function setProjectPaused(projectId, paused, email) {
  must(await supabase.from('wf_project_state').update({ paused, paused_reason: paused ? 'Поставлено на паузу з огляду проєктів.' : null, updated_at: nowIso() }).eq('project_id', projectId), 'state');
  await journal(projectId, email, { action: paused ? 'pause' : 'resume', summary: paused ? 'Проєкт поставлено на паузу.' : 'Паузу знято.' });
}
// the own limit of one project (empty = the default of the system)
export async function setProjectCap(projectId, cap, email) {
  const empty = cap === '' || cap == null;
  const n = Number(cap);
  if (!empty && (!Number.isFinite(n) || n < 0)) throw new Error('Ліміт це число від 0 доларів.');
  must(await supabase.from('wf_project_state').update({ cost_cap_usd: empty ? null : n, updated_at: nowIso() }).eq('project_id', projectId), 'state');
  await journal(projectId, email, { action: 'cost_cap_set', summary: empty ? 'Власний ліміт витрат прибрано: діє загальний.' : `Ліміт витрат агентів проєкту: $${n.toFixed(2)} на місяць.` });
}
// «Надіслати дайджест зараз»: the server builds the digest from the same rows and sends it to the Telegram chat of the notices
export const sendDigestNow = () => authedPost('/api/wf-digest', { force: true });
