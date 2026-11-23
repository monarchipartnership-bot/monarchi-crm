// The storage of the orchestrator on the real database (the wf_* tables). The orchestrator talks to this interface only, so the tests run it on an
// in-memory twin (scripts/wfMemoryRepo.mjs) that obeys the same rules. `db` is a signed-in Supabase client.
import { monthStart, reached } from './limits.js';

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
      const patch = { status, output, error, ...(costUsd ? { cost_usd: costUsd } : {}), finished_at: ['done', 'failed', 'cancelled'].includes(status) ? iso(now()) : null, lease_until: null };
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
    // The current version of a section (what the agents read): { status, version: { version, body, content, author_kind, created_at } } or null.
    async readSection(projectId, key) {
      const sec = must(await db.from('wf_sections').select('id, status, current_version_id').eq('project_id', projectId).eq('key', key).maybeSingle(), 'section');
      if (!sec || sec.current_version_id == null) return sec ? { status: sec.status, version: null } : null;
      const v = must(await db.from('wf_section_versions').select('version, body, content, author_kind, created_at').eq('id', sec.current_version_id).single(), 'version');
      return { status: sec.status, version: v };
    },
    // what the skills need to know about the project itself: its website and the language of the client
    async readProject(projectId) {
      return must(await db.from('projects').select('id, website, client_language, name, client, manager').eq('id', projectId).maybeSingle(), 'project');
    },
    // the materials of the client kept in the project card (the page «Креативи»): the notes and the brand in project_creative.inputs, the files by kind
    async readCreativeMaterials(projectId) {
      const [row, assets] = await Promise.all([
        db.from('project_creative').select('figma_url, cta_mode, cta_text, restrictions, inputs').eq('project_id', projectId).maybeSingle(),
        db.from('project_creative_assets').select('kind, name, url').eq('project_id', projectId).order('id', { ascending: true }),
      ]);
      return { settings: must(row, 'creative settings') || {}, assets: must(assets, 'creative assets') || [] };
    },
    // a finished picture is copied into our storage (the provider keeps it only 7 days). → { url, path } (the original address and an empty path if the copy fails)
    async persistProjectImage(projectId, { url, name }) {
      try {
        const res = await fetch(url);
        if (!res.ok) return { url, path: '' };
        const bytes = new Uint8Array(await res.arrayBuffer());
        const type = res.headers?.get?.('content-type') || 'image/png';
        const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
        const path = `projects/${projectId}/creatives/${String(name).replace(/[^\w.-]+/g, '_')}-${Date.now()}.${ext}`;
        const up = await db.storage.from('creative-assets').upload(path, bytes, { contentType: type, upsert: true });
        if (up.error) return { url, path: '' };
        return { url: db.storage.from('creative-assets').getPublicUrl(path).data.publicUrl || url, path };
      } catch { return { url, path: '' }; }
    },
    async listAdAccounts(projectId) {
      return must(await db.from('project_ad_accounts').select('platform, account_id, account_name, currency').eq('project_id', projectId), 'ad accounts') || [];
    },
    // the pool of a project, for the check that keeps ONE list of tasks
    async listTasks(projectId) {
      return must(await db.from('wf_tasks').select('id, type, title, evidence, priority, owner, status, created_by_kind').eq('project_id', projectId).in('status', ['proposed', 'approved', 'in_progress']), 'tasks') || [];
    },
    // two agents found the same problem: the kept task takes the higher priority and both pieces of evidence, the others are closed as duplicates (nothing is deleted)
    async mergeTasks(projectId, keepId, patch, dropIds) {
      must(await db.from('wf_tasks').update({ priority: patch.priority, evidence: patch.evidence, updated_at: iso(now()) }).eq('id', keepId).eq('project_id', projectId), 'task merge');
      if (dropIds.length) must(await db.from('wf_tasks').update({ status: 'rejected', result: `Дубль задачі #${keepId}`, updated_at: iso(now()) }).in('id', dropIds).eq('project_id', projectId), 'task merge');
    },
    // A task for people (for example «Потрібно від клієнта»). The same open task is not added twice.
    async addTask(projectId, { type = 'client', title, evidence = null, owner = 'client', priority = 'high', created_by = 'agent', due_date = null }) {
      const same = must(await db.from('wf_tasks').select('id').eq('project_id', projectId).eq('title', title).in('status', ['proposed', 'approved', 'in_progress']).limit(1), 'task') || [];
      if (same.length) return null;
      return must(await db.from('wf_tasks').insert({ project_id: projectId, type, title, evidence, owner, priority, created_by_kind: 'agent', created_by, due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(due_date || '')) ? due_date : null }).select().single(), 'task');
    },
    // A run that waits for a section (state.blocked_on) goes back to the queue when a newer version of that section appeared after it stopped.
    async resumeBlocked(projectId) {
      const waiting = must(await db.from('wf_runs').select('id, state').eq('project_id', projectId).eq('status', 'waiting'), 'runs') || [];
      let resumed = 0;
      for (const r of waiting) {
        const key = r.state?.blocked_on; if (!key) continue;
        const woke = key === 'cost_cap' // stopped by a limit: goes on when the numbers allow (the limit was raised, or a new month began)
          ? await this.withinLimits(projectId)
          : key === 'launch_fix' // the check before the launch is repeated every half hour: the pixel may have started to fire, the site may be back
          ? !!r.state?.blocked_at && (now() - new Date(r.state.blocked_at)) >= 30 * 60000
          : key === 'site_url' // the run waits for the website to be written in the project card
          ? !!String((await this.readProject(projectId))?.website || '').trim()
          : key.startsWith('accounts:') // the run waits for an ad account of a platform to be linked (accounts:meta); the others wait for a newer version of a section
          ? (await this.listAdAccounts(projectId)).some((a) => a.platform === key.split(':')[1])
          : ['unit_economy', 'audit', 'site', 'audience', 'competitors'].includes(key) // the audit (and the audience) waits for the Unit Economy to be written, or for that skill to stop working (it may itself be waiting for the brief)
            ? ((await this.readSection(projectId, key))?.version != null || !must(await db.from('wf_runs').select('id').eq('project_id', projectId).eq('agent', 'researcher').eq('skill', key).in('status', ['queued', 'running']).limit(1), 'runs').length)
            : await (async () => { const sec = await this.readSection(projectId, key); return !!(sec?.version && r.state?.blocked_at && new Date(sec.version.created_at) > new Date(r.state.blocked_at)); })();
        if (woke) {
          must(await db.from('wf_runs').update({ status: 'queued', attempt: 0, lease_until: null, error: null }).eq('id', r.id).eq('status', 'waiting'), 'resume');
          resumed += 1;
        }
      }
      return resumed;
    },
    async withinLimits(projectId) {
      const since = monthStart(now());
      const [state, settings] = [must(await db.from('wf_project_state').select('cost_cap_usd').eq('project_id', projectId).maybeSingle(), 'state'), await this.readSettings()];
      return !reached({ state, settings, projectSpent: await this.projectCost(projectId, since), totalSpent: await this.totalCost(since) });
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
    // the latest journal line of one kind (for example when the last advice to raise a budget was given)
    async lastJournal(projectId, action) {
      const r = must(await db.from('wf_journal').select('at, summary, meta').eq('project_id', projectId).eq('action', action).order('id', { ascending: false }).limit(1), 'journal');
      return r?.[0] || null;
    },
    // the settings of the whole system (one row): the global stop and the default limits. Without the row (the migration is not applied) nothing is stopped and the limits are the defaults.
    async readSettings() {
      const r = await db.from('wf_settings').select('*').eq('id', 1).maybeSingle();
      if (r.error) return { stopped: false, monthly_cap_usd: 60, project_cap_default_usd: 10 };
      return r.data || { stopped: false, monthly_cap_usd: 60, project_cap_default_usd: 10 };
    },
    // everything the agents spent since a moment, all projects together
    async totalCost(sinceIso) {
      const rows = must(await db.from('wf_runs').select('cost_usd').gte('created_at', sinceIso), 'cost') || [];
      return rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    },
    async projectCost(projectId, sinceIso) {
      const rows = must(await db.from('wf_runs').select('cost_usd').eq('project_id', projectId).gte('created_at', sinceIso), 'cost') || [];
      return rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
    },
  };
}
