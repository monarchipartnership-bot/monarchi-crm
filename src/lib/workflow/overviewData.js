// What the overview of all projects reads from the database. It takes a Supabase client, so the page (the person's session) and the server
// (the daily digest) read exactly the same rows.
const DEFAULT_SETTINGS = { stopped: false, monthly_cap_usd: 1000, project_cap_default_usd: 100 };
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const monthsBack = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString(); }; // two months are enough: the card needs the recent runs, the spend needs this month

export async function loadOverviewData(db) {
  const [states, projects, runs, approvals, tasks, journalRows, briefs, settings] = await Promise.all([
    db.from('wf_project_state').select('*'),
    db.from('projects').select('id, name, client'),
    db.from('wf_runs').select('id, project_id, agent, skill, status, error, cost_usd, state, created_at, finished_at').gte('created_at', monthsBack()).order('id', { ascending: false }).limit(4000),
    db.from('wf_approvals').select('id, project_id, kind, status, requested_at, decided_at, subject').order('id', { ascending: false }).limit(800),
    db.from('wf_tasks').select('id, project_id, owner, status').in('status', ['proposed', 'approved', 'in_progress']).limit(2000),
    db.from('wf_journal').select('id, project_id, at, action, summary').in('action', ['check_failed', 'skill_stopped', 'launch_stopped', 'stage', 'cost_cap']).order('id', { ascending: false }).limit(800),
    db.from('wf_sections').select('project_id').eq('key', 'brief').not('current_version_id', 'is', null),
    db.from('wf_settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  const byId = {};
  for (const p of must(projects, 'projects') || []) byId[p.id] = { name: p.client || p.name };
  return {
    projects: byId, states: must(states, 'states') || [], runs: must(runs, 'runs') || [], approvals: must(approvals, 'approvals') || [], tasks: must(tasks, 'tasks') || [],
    journal: must(journalRows, 'journal') || [], briefs: (must(briefs, 'briefs') || []).map((b) => b.project_id),
    // without the table the page still works; only the stop and the limits cannot be changed
    settings: settings.error ? { ...DEFAULT_SETTINGS, missing: true } : { ...DEFAULT_SETTINGS, ...(settings.data || {}) },
  };
}
