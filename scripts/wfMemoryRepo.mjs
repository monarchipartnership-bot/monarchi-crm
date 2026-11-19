// An in-memory twin of api/_lib/wf/repo.js for the tests. It obeys the same rules as the database (migrations 20261068 and 20261069):
// the status moves of a section when a version is written, the rule that an agent never replaces a human or approved version, one open run per
// project+agent+skill, one pending strategy or launch approval, the lease of a claimed run and the pause of a project.
export function createMemoryWfRepo({ now = () => new Date() } = {}) {
  let seq = { run: 0, approval: 0, version: 0, section: 0 };
  const T = { states: new Map(), sections: [], versions: [], runs: [], steps: [], approvals: [], journal: [] };
  const iso = () => now().toISOString();
  const OPEN = ['queued', 'running', 'waiting'];

  const section = (projectId, key) => {
    let s = T.sections.find((x) => x.project_id === projectId && x.key === key);
    if (!s) { s = { id: ++seq.section, project_id: projectId, key, status: 'empty', needs_reapproval: false, current_version_id: null }; T.sections.push(s); }
    return s;
  };

  return {
    T,
    async ensureState(projectId) {
      if (!T.states.has(projectId)) T.states.set(projectId, { project_id: projectId, stage: 0, paused: false, paused_reason: null, cost_cap_usd: null, paid_at: null, contracts_signed_at: null, has_data: null });
      return T.states.get(projectId);
    },
    async listActiveProjects() { return [...T.states.values()].filter((s) => !s.paused).map((s) => s.project_id); },
    async loadSnapshot(projectId) {
      const state = T.states.get(projectId) || null;
      return {
        state: state ? { ...state } : null,
        sections: Object.fromEntries(T.sections.filter((s) => s.project_id === projectId).map((s) => [s.key, { status: s.status, hasCurrent: s.current_version_id != null }])),
        runs: T.runs.filter((r) => r.project_id === projectId).map((r) => ({ ...r })).sort((a, b) => b.id - a.id),
        approvals: T.approvals.filter((a) => a.project_id === projectId).map((a) => ({ ...a })).sort((a, b) => b.id - a.id),
      };
    },
    async enqueueRun({ project_id, agent, skill, input = {}, trigger = 'auto', priority = 100, created_by = 'orchestrator', parent_run_id = null }) {
      if (T.runs.some((r) => r.project_id === project_id && r.agent === agent && r.skill === skill && OPEN.includes(r.status))) return null;
      const r = { id: ++seq.run, project_id, agent, skill, input, trigger, priority, created_by, parent_run_id, status: 'queued', output: null, error: null, cost_usd: 0, attempt: 0, lease_until: null, created_at: iso(), started_at: null, finished_at: null };
      T.runs.push(r);
      return { ...r };
    },
    async claimRuns(limit, leaseMinutes) {
      const t = now();
      T.runs.filter((r) => r.status === 'running' && r.lease_until && new Date(r.lease_until) < t && r.attempt >= 3).forEach((r) => { r.status = 'failed'; r.error = 'Lease expired after 3 attempts'; r.finished_at = iso(); r.lease_until = null; });
      const picked = T.runs
        .filter((r) => (r.status === 'queued' || (r.status === 'running' && r.lease_until && new Date(r.lease_until) < t)) && !T.states.get(r.project_id)?.paused)
        .sort((a, b) => a.priority - b.priority || a.id - b.id)
        .slice(0, limit);
      picked.forEach((r) => { r.status = 'running'; r.attempt += 1; r.lease_until = new Date(t.getTime() + leaseMinutes * 60000).toISOString(); r.started_at = r.started_at || iso(); });
      return picked.map((r) => ({ ...r }));
    },
    async finishRun(id, { status, output = null, error = null, costUsd = 0 }) {
      const r = T.runs.find((x) => x.id === id);
      Object.assign(r, { status, output, error, cost_usd: costUsd, finished_at: ['done', 'failed', 'cancelled'].includes(status) ? iso() : null, lease_until: null });
    },
    async addSteps(runId, steps) { (steps || []).forEach((s, i) => T.steps.push({ run_id: runId, n: s.n ?? i + 1, title: s.title, status: s.status || 'done', detail: s.detail || {} })); },
    async writeSectionVersion(projectId, key, { body = '', content = {}, author_kind, author, is_proposal = false, run_id = null, sources = [], note = null }) {
      const sec = section(projectId, key);
      if (author_kind === 'agent' && !is_proposal) {
        const human = T.versions.some((v) => v.section_id === sec.id && v.author_kind === 'human' && !v.is_proposal);
        if (['approved', 'on_approval'].includes(sec.status) || human) throw new Error(`wf: an agent may not replace a human or approved version of section ${sec.id}; send a proposal instead`);
      }
      const version = Math.max(0, ...T.versions.filter((v) => v.section_id === sec.id).map((v) => v.version)) + 1;
      const v = { id: ++seq.version, section_id: sec.id, version, body, content, author_kind, author, is_proposal, run_id, sources, note };
      T.versions.push(v);
      if (!is_proposal) {
        const humanOnApproved = author_kind === 'human' && sec.status === 'approved';
        sec.current_version_id = v.id;
        sec.needs_reapproval = sec.needs_reapproval || humanOnApproved;
        sec.status = humanOnApproved ? 'draft' : sec.status === 'empty' ? 'draft' : sec.status;
      }
      return { ...v };
    },
    async setSectionStatus(projectId, key, status) { section(projectId, key).status = status; },
    async createApproval(projectId, kind, subject, requestedBy = 'orchestrator') {
      if (['strategy', 'launch'].includes(kind) && T.approvals.some((a) => a.project_id === projectId && a.kind === kind && a.status === 'pending')) return null;
      const a = { id: ++seq.approval, project_id: projectId, kind, subject, status: 'pending', comment: null, requested_by: requestedBy, requested_at: iso(), decided_at: null };
      T.approvals.push(a);
      return { ...a };
    },
    async setStage(projectId, stage) { T.states.get(projectId).stage = stage; },
    async setProjectFlag(projectId, patch) { Object.assign(T.states.get(projectId), patch); },
    async journal(projectId, entry) { T.journal.push({ project_id: projectId, at: iso(), ...entry }); },
    async journalOnce(projectId, entry) {
      const last = [...T.journal].reverse().find((j) => j.project_id === projectId && j.action === entry.action);
      if (last && last.summary === (entry.summary || '')) return;
      return this.journal(projectId, entry);
    },
    async projectCost(projectId, sinceIso) { return T.runs.filter((r) => r.project_id === projectId && r.created_at >= sinceIso).reduce((s, r) => s + Number(r.cost_usd || 0), 0); },
    // helpers of the tests: what a person does in the CRM
    decide(approvalId, status, comment = null, by = 'manager@test') {
      const a = T.approvals.find((x) => x.id === approvalId);
      if (status === 'returned' && !comment) throw new Error('a returned approval needs a comment');
      Object.assign(a, { status, comment, decided_by: by, decided_at: iso() });
    },
    pending(projectId, kind) { return T.approvals.find((a) => a.project_id === projectId && a.kind === kind && a.status === 'pending') || null; },
    recordClientSignoff(projectId, status, comment = null) {
      const a = { id: ++seq.approval, project_id: projectId, kind: 'client', subject: {}, status, comment, requested_by: 'manager@test', requested_at: iso(), decided_by: 'manager@test', decided_at: iso() };
      T.approvals.push(a);
      return a;
    },
  };
}
