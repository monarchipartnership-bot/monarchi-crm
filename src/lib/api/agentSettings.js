import { supabase } from '../supabaseClient';
import { SPEC, applyChanges, cleanConfig } from '../workflow/agentConfig';

// The settings of the agents as the page sees them (the rules and the defaults are in src/lib/workflow/agentConfig.js). Two levels: all projects (wf_settings.config)
// and one project (wf_project_state.config). The limits, the emergency stop and the pause of a project have their own columns and their own calls in api/workflow.js.
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const nowIso = () => new Date().toISOString();

// → { settings: row of wf_settings, state: row of the project | null, projects: [{ id, name }] (only when no project is chosen) }
export async function fetchSettingsData(projectId = null) {
  const settings = must(await supabase.from('wf_settings').select('*').eq('id', 1).maybeSingle(), 'settings');
  if (!settings) throw new Error('Налаштування системи не знайдено: застосуйте міграцію 20261071.');
  let state = null, projects = [];
  if (projectId) state = must(await supabase.from('wf_project_state').select('project_id, config, cost_cap_usd, auto_small_actions, paused').eq('project_id', projectId).maybeSingle(), 'state');
  else {
    const rows = must(await supabase.from('wf_project_state').select('project_id, projects(name, client)').order('project_id'), 'projects') || [];
    projects = rows.map((r) => ({ id: r.project_id, name: r.projects?.client || r.projects?.name || `Проєкт ${r.project_id}` }));
  }
  return { settings, state, projects };
}

// changes = { 'optimize.every_hours': 12, 'optimize.skip_weekends': null (back to the level above), ... }
export async function saveConfig({ scope, projectId = null, changes }, email) {
  const cur = await fetchSettingsData(scope === 'project' ? projectId : null);
  const stored = scope === 'project' ? cur.state?.config : cur.settings.config;
  const { config, errors } = applyChanges(stored, changes, scope);
  if (errors.length) throw new Error(errors.map((e) => `${SPEC[e.path]?.label || e.path}: ${e.error}`).join(' '));
  if (scope === 'project') {
    must(await supabase.from('wf_project_state').update({ config, updated_at: nowIso() }).eq('project_id', projectId), 'config');
    must(await supabase.from('wf_journal').insert({ project_id: projectId, actor_kind: 'human', actor: email || 'manager', action: 'settings', summary: `Змінено налаштування агентів проєкту: ${Object.keys(changes).map((p) => SPEC[p]?.label || p).join(', ')}.`, meta: { changes } }), 'journal');
  } else {
    const r = await supabase.from('wf_settings').update({ config, updated_at: nowIso() }).eq('id', 1).select('id');
    if (r.error) throw new Error('config: ' + r.error.message);
    if (!r.data?.length) throw new Error('Налаштування системи не знайдено: застосуйте міграції 20261071 і 20261075.');
  }
  return cleanConfig(config, scope);
}

// the chat of the notices of the agent system (empty = the chat of «Сповіщення» of AI Agents)
export async function saveNotifyChat(chat) {
  const v = String(chat || '').trim();
  if (v && !/^-?\d+$/.test(v)) throw new Error('ID чату Telegram це число (для груп воно починається з мінуса).');
  const r = await supabase.from('wf_settings').update({ notify_telegram_chat: v || null, updated_at: nowIso() }).eq('id', 1).select('id');
  if (r.error) throw new Error('settings: ' + r.error.message);
}

// the switch of the small actions of the optimiser of ONE project (off by default)
export async function setSmallActions(projectId, on, email) {
  must(await supabase.from('wf_project_state').update({ auto_small_actions: !!on, updated_at: nowIso() }).eq('project_id', projectId), 'state');
  must(await supabase.from('wf_journal').insert({ project_id: projectId, actor_kind: 'human', actor: email || 'manager', action: 'state', summary: on ? 'Дрібні дії оптимізатора ввімкнено: Медіабаєр сам призупиняє слабкі оголошення і піднімає бюджет у межах кроку.' : 'Дрібні дії оптимізатора вимкнено: лише рекомендації.' }), 'journal');
}
