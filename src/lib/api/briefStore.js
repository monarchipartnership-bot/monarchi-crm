import { supabase } from '../supabaseClient';
import { fetchProjectAccounts, fetchProjectCreative, saveInput } from './projectCreative';
import { saveHumanVersion } from './workflow';
import { updateProject } from './projects';
import { FIELD, applyToBrief, planWrite } from '../workflow/briefSchema';

// The ONE brief as the screens see it: the facts are kept in the brief, the project row, the project card and the linked cabinets (the agents read them there),
// this file reads them together and writes one fact to the store it belongs to. The rules of what is where are in src/lib/workflow/briefSchema.js.
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function readBrief(projectId) {
  const sec = must(await supabase.from('wf_sections').select('id, current_version_id').eq('project_id', projectId).eq('key', 'brief').maybeSingle(), 'brief section');
  if (!sec?.current_version_id) return { content: null, body: '' };
  const v = must(await supabase.from('wf_section_versions').select('content, body').eq('id', sec.current_version_id).maybeSingle(), 'brief version');
  return { content: v?.content || null, body: v?.body || '' };
}

// → the context for briefSchema.checkBrief: { brief, project, card, accounts, state }
export async function loadBriefContext(projectId) {
  const [brief, project, card, accounts, state] = await Promise.all([
    readBrief(projectId),
    supabase.from('projects').select('id, name, website, country, client_language').eq('id', projectId).maybeSingle().then((r) => must(r, 'project')),
    fetchProjectCreative(projectId),
    fetchProjectAccounts(projectId),
    supabase.from('wf_project_state').select('paid_at, contracts_signed_at, stage, brief_pending').eq('project_id', projectId).maybeSingle().then((r) => must(r, 'state')),
  ]);
  return { brief: brief.content, briefBody: brief.body, project, card, accounts, state };
}

// writes ONE fact where it belongs (a new human version of the brief, the project row or the project card)
export async function saveFact(projectId, key, value, email) {
  const plan = planWrite(key, value);
  if (plan.store === 'project') { await updateProject(projectId, { [plan.key]: plan.value }); return plan; }
  if (plan.store === 'card_input') { await saveInput(projectId, plan.key, plan.value, email); return plan; }
  const cur = await readBrief(projectId);
  const content = applyToBrief(cur.content, plan);
  await saveHumanVersion(projectId, 'brief', cur.body || 'Бриф', email, `Додано: ${FIELD[key]?.label || key} (перевірка готовності)`, content);
  return plan;
}
