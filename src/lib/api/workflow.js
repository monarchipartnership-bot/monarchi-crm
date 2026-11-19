import { supabase } from '../supabaseClient';

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
    supabase.from('wf_journal').select('id, at, actor_kind, actor, action, summary').eq('project_id', projectId).order('id', { ascending: false }).limit(15),
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
  const row = await saveHumanVersion(projectId, key, proposal.body, email, `Прийнято пропозицію агента (версія ${proposal.version})`);
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
// «Схвалити» or «Повернути». The orchestrator reads the answer on its next pass.
export async function decideApproval(approval, status, comment, email) {
  const text = (comment || '').trim();
  if (status === 'returned' && !text) throw new Error('Щоб повернути, напишіть коментар: агент має знати, що виправити.');
  const r = await supabase.from('wf_approvals').update({ status, comment: text || null, decided_by: email || 'manager', decided_at: nowIso() }).eq('id', approval.id).eq('status', 'pending').select('id');
  if (r.error) throw new Error('approval: ' + r.error.message);
  if (!r.data?.length) throw new Error('Це рішення вже прийнято в іншому місці. Оновіть сторінку.');
  await journal(approval.project_id, email, { action: status === 'approved' ? 'approved' : 'returned', subject: approval.kind, summary: `${status === 'approved' ? 'Схвалено' : 'Повернуто'}: ${approval.kind}${text ? '. ' + text : ''}` });
}
// The answer of the client, recorded by the manager after Апрув 1: one finished row of kind «client».
export async function recordClientAnswer(projectId, status, comment, email) {
  const text = (comment || '').trim();
  if (status === 'returned' && !text) throw new Error('Щоб повернути, напишіть, що клієнт просить виправити.');
  must(await supabase.from('wf_approvals').insert({ project_id: projectId, kind: 'client', subject: { section: 'strategy' }, status, requested_by: email || 'manager', decided_by: email || 'manager', decided_at: nowIso(), comment: text || null }), 'client answer');
  await journal(projectId, email, { action: status === 'approved' ? 'approved' : 'returned', subject: 'client', summary: `Відповідь клієнта: ${status === 'approved' ? 'погодив' : 'повернув. ' + text}` });
}
