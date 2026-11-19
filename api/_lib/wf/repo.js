// The storage of the orchestrator on the real database (the wf_* tables). The orchestrator talks to this interface only, so the tests run it on an
// in-memory twin (scripts/wfMemoryRepo.mjs) that obeys the same rules. `db` is a signed-in Supabase client.
const UNIQUE = '23505';
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const iso = (d) => d.toISOString();

export function createWfRepo(db, { now = () => new Date() } = {}) {
  async function sectionRow(projectId, key) {
    const found = must(await db.from('wf_sections').select('*').eq('project_id', projectId).eq('key', key).maybeSingle(), 'section');
    if (found) return found;
    const made = await db.from('wf_sections').insert({ project_id: projectId, key }).select().single();
    if (made.error && made.error.code === UNIQUE) return must(await db.from('wf_sections').select('*').eq('project_id', projectId).eq('key', key).single(), 'section');
    return must(made, 'section');
  }

  return {
    async ensureState(projectId) {
      const r = await db.from('wf_project_state').insert({ project_id: projectId }).select().single();
      if (r.error && r.error.code !== UNIQUE) throw new Error('state: ' + r.error.message);
      return must(await db.from('wf_project_state').select('*').eq('project_id', projectId).single(), 'state');
    },
    async listActiveProjects() {
      return (must(await db.from('wf_project_state').select('project_id').eq('paused', false), 'projects') || []).map((r) => r.project_id);
    },
    async loadSnapshot(projectId) {
      const [state, sections, runs, approvals] = await Promise.all([
        db.from('wf_project_state').select('*').eq('project_id', projectId).maybeSingle(),
        db.from('wf_sections').select('key, status, current_version_id').eq('project_id', projectId),
        db.from('wf_runs').select('id, agent, skill, status, input, created_at, finished_at').eq('project_id', projectId).order('id', { ascending: false }).limit(300),
        db.from('wf_approvals').select('id, kind, subject, status, comment, requested_at, decided_at').eq('project_id', projectId).order('id', { ascending: false }).limit(100),
      ]);
      return {
        state: must(state, 'state'),
        sections: Object.fromEntries((must(sections, 'sections') || []).map((s) => [s.key, { status: s.status, hasCurrent: s.current_version_id != null }])),
        runs: must(runs, 'runs') || [],
        approvals: must(approvals, 'approvals') || [],
      };
    },
    async enqueueRun({ project_id, agent, skill, input = {}, trigger = 'auto', priority = 100, created_by = 'orchestrator', parent_run_id = null }) {
      const r = await db.from('wf_runs').insert({ project_id, agent, skill, input, trigger, priority, created_by, parent_run_id }).select().single();
      if (r.error) { if (r.error.code === UNIQUE) return null; throw new Error('enqueue: ' + r.error.message); } // an open run of this kind already exists
      return r.data;
    },
    async claimRuns(limit, leaseMinutes) {
      return must(await db.rpc('wf_claim_runs', { p_limit: limit, p_lease_minutes: leaseMinutes }), 'claim') || [];
    },
    async finishRun(id, { status, output = null, error = null, costUsd = 0, state = null }) {
      const patch = { status, output, error, cost_usd: costUsd, finished_at: ['done', 'failed', 'cancelled'].includes(status) ? iso(now()) : null, lease_until: null };
      if (state) patch.state = state;
      must(await db.from('wf_runs').update(patch).eq('id', id), 'finish run');
    },
    async addSteps(runId, steps) {
      if (!steps?.length) return;
      must(await db.from('wf_run_steps').insert(steps.map((s, i) => ({ run_id: runId, n: s.n ?? i + 1, title: s.title, status: s.status || 'done', detail: s.detail || {} }))), 'steps');
    },
    async writeSectionVersion(projectId, key, { body = '', content = {}, author_kind, author, is_proposal = false, run_id = null, sources = [], note = null }) {
      const sec = await sectionRow(projectId, key);
      return must(await db.from('wf_section_versions').insert({ section_id: sec.id, body, content, author_kind, author, is_proposal, run_id, sources, note }).select().single(), 'version');
    },
    async setSectionStatus(projectId, key, status) {
      const sec = await sectionRow(projectId, key);
      must(await db.from('wf_sections').update({ status, updated_at: iso(now()) }).eq('id', sec.id), 'section status');
    },
    async createApproval(projectId, kind, subject, requestedBy = 'orchestrator') {
      const r = await db.from('wf_approvals').insert({ project_id: projectId, kind, subject, requested_by: requestedBy }).select().single();
      if (r.error) { if (r.error.code === UNIQUE) return null; throw new Error('approval: ' + r.error.message); }
      return r.data;
    },
    async setStage(projectId, stage) { must(await db.from('wf_project_state').update({ stage, updated_at: iso(now()) }).eq('project_id', projectId), 'stage'); },
    async setProjectFlag(projectId, patch) { must(await db.from('wf_project_state').update({ ...patch, updated_at: iso(now()) }).eq('project_id', projectId), 'flag'); },
    async journal(projectId, { actor_kind = 'system', actor = 'orchestrator', action, subject = null, summary = '', meta = {} }) {
      must(await db.from('wf_journal').insert({ project_id: projectId, actor_kind, actor, action, subject, summary, meta }), 'journal');
    },
    // the same line twice in a row (same action and text) is written once: a problem that persists is not repeated on every pass
    async journalOnce(projectId, entry) {
      const last = must(await db.from('wf_journal').select('action, summary').eq('project_id', projectId).eq('action', entry.action).order('id', { ascending: false }).limit(1), 'journal');
      if (last?.[0] && last[0].summary === (entry.summary || '')) return;
      return this.journal(projectId, entry);
    },
    async projectCost(projectId, sinceIso) {
      const rows = must(await db.from('wf_runs').select('cost_usd').eq('project_id', projectId).gte('created_at', sinceIso), 'cost') || [];
      return rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    },
  };
}
