import { supabase } from '../supabaseClient';
import { cleanProjectTitle, operationsToStop } from '../agents/aiProjects';

const must = ({ data, error }) => { if (error) throw error; return data; };
const nowIso = () => new Date().toISOString();
const missing = (e) => /ag_projects|schema cache|does not exist/i.test(e?.message || '');
export const NO_TABLE = 'Проєкти розділу ще не підключені: потрібно застосувати міграцію 20261059_ag_projects.';

// Everything the page «Проєкти» needs besides the cabinets: the projects of the section, their CRM cards, cabinets and operations.
// → { aiProjects, projects, accounts, campaigns, ready } (ready: false = the table is not there yet; the projects are then taken from the operations, read-only)
export async function fetchAiProjects() {
  const [rows, campaigns, accounts] = await Promise.all([
    supabase.from('ag_projects').select('*'),
    supabase.from('ag_campaigns').select('id, project_id, name, status, created_by, created_at, updated_at'),
    supabase.from('project_ad_accounts').select('project_id, platform'),
  ]);
  const ops = must(campaigns) || [];
  let aiProjects; let ready = true;
  if (rows.error) {
    if (!missing(rows.error)) throw rows.error;
    ready = false;
    const seen = new Map();
    ops.filter((c) => c.project_id != null && c.status !== 'archived').forEach((c) => { if (!seen.has(c.project_id)) seen.set(c.project_id, { project_id: c.project_id, status: 'active', created_at: c.created_at, updated_at: c.updated_at }); });
    aiProjects = [...seen.values()];
  } else aiProjects = rows.data || [];
  const ids = [...new Set(aiProjects.map((a) => a.project_id))];
  const projects = ids.length ? must(await supabase.from('projects').select('id, name, client').in('id', ids)) || [] : [];
  return { aiProjects, projects, accounts: must(accounts) || [], campaigns: ops, ready };
}

const tableError = (e) => new Error(missing(e) ? NO_TABLE : e.message || 'Не вдалося зберегти.');

// The project becomes a project of the section (the wizard «Створити проєкт»); one that was finished or taken out comes back to work.
export async function ensureAiProject(projectId, email) {
  const { data, error } = await supabase.from('ag_projects').select('project_id, status').eq('project_id', projectId).maybeSingle();
  if (error) throw tableError(error);
  if (!data) { const r = await supabase.from('ag_projects').insert({ project_id: projectId, status: 'active', created_by: email || null }).select().single(); if (r.error) throw tableError(r.error); return r.data; }
  if (data.status === 'active') return data;
  return setStatus(projectId, 'active', email);
}

async function setStatus(projectId, status, email) {
  const patch = { status, updated_at: nowIso() };
  if (status === 'done') { patch.finished_at = nowIso(); patch.finished_by = email || null; }
  if (status === 'removed') { patch.removed_at = nowIso(); patch.removed_by = email || null; }
  if (status === 'active') { patch.finished_at = null; patch.finished_by = null; patch.removed_at = null; patch.removed_by = null; }
  const r = await supabase.from('ag_projects').update(patch).eq('project_id', projectId).select().single();
  if (r.error) throw tableError(r.error);
  return r.data;
}

// the agents of a finished or removed project must not keep working and spending: its operations go to the archive of «Операції» (nothing is deleted)
async function stopOperations(projectId) {
  const ops = must(await supabase.from('ag_campaigns').select('id, project_id, status').eq('project_id', projectId)) || [];
  const ids = operationsToStop(ops, projectId);
  if (ids.length) must(await supabase.from('ag_campaigns').update({ status: 'archived', updated_at: nowIso() }).in('id', ids).select('id'));
  return ids.length;
}

// «Завершити»: the mark «завершено», the archive of the section; the history stays in the CRM card. → { stopped: how many operations went to the archive }
export async function finishAiProject(projectId, email) {
  await setStatus(projectId, 'done', email);
  return { stopped: await stopOperations(projectId) };
}

// «Видалити»: out of the section only. The materials, the memory of the client and the operations (archived) stay; the CRM card is not touched.
export async function removeAiProject(projectId, email) {
  await setStatus(projectId, 'removed', email);
  return { stopped: await stopOperations(projectId) };
}

// «Повернути в роботу» from the archive (its operations stay in the archive of «Операції»: they are brought back there one by one).
export const restoreAiProject = (projectId, email) => setStatus(projectId, 'active', email);

// The person's own name of the project inside the section (up to 100 characters); empty = the name from the CRM again. → the cleaned name or null
export async function renameAiProject(projectId, title) {
  const clean = cleanProjectTitle(title);
  const r = await supabase.from('ag_projects').update({ title: clean, updated_at: nowIso() }).eq('project_id', projectId).select('project_id').maybeSingle();
  if (r.error) throw new Error(/title|schema cache|column/i.test(r.error.message || '') ? 'Щоб зберігати власну назву проєкту, потрібно застосувати міграцію 20261061_ag_project_title.' : r.error.message || 'Не вдалося зберегти назву.');
  if (!r.data) throw new Error('Проєкт не знайдено в розділі AI Agents.');
  return clean;
}
