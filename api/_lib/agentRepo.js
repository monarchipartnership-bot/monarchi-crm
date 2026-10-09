// The project AI agent's reads and writes in Supabase, done with the agent user's own session
// (so the normal row-level security applies). Mirrors what the CRM screens do in the browser
// (src/lib/api/projectReportStore.js, projectDecks.js, projectAgents.js), nothing more.
const nowIso = () => new Date().toISOString();
const must = ({ data, error }) => { if (error) throw error; return data; };

export function createAgentRepo(db, agentEmail) {
  return {
    // ---- the run itself
    async startRun({ projectId, trigger, periodType, startedBy }) {
      return must(await db.from('agent_runs').insert({ project_id: projectId, trigger, period_type: periodType, started_by: startedBy }).select().single());
    },
    async finishRun(id, patch) {
      must(await db.from('agent_runs').update({ ...patch, finished_at: nowIso() }).eq('id', id));
    },
    // What the model calls made since `sinceIso` by the agent user cost (the work-summary calls of this run).
    async costSince(sinceIso) {
      const rows = must(await db.from('ai_calls').select('cost_usd').gte('created_at', sinceIso).eq('actor', agentEmail));
      return Math.round((rows || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0) * 1e6) / 1e6;
    },

    // ---- the agent's own row: settings, lock, health
    async getAgent(projectId) {
      return must(await db.from('project_agents').select('*').eq('project_id', projectId).maybeSingle());
    },
    // Takes the project's agent for `minutes`; false when a live run already holds it.
    async tryLock(projectId, minutes) {
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      const rows = must(await db.from('project_agents').update({ run_state: 'running', lease_until: until })
        .eq('project_id', projectId).or(`run_state.eq.idle,lease_until.is.null,lease_until.lt.${nowIso()}`).select('id'));
      return Boolean(rows?.length);
    },
    async unlock(projectId) {
      must(await db.from('project_agents').update({ run_state: 'idle', lease_until: null, last_run_at: nowIso(), updated_at: nowIso() }).eq('project_id', projectId));
    },
    async setAgentHealth(projectId, patch) {
      must(await db.from('project_agents').update({ ...patch, updated_at: nowIso() }).eq('project_id', projectId));
    },
    async addEvent({ projectId, kind, status = 'info', message, details = null }) {
      must(await db.from('project_agent_events').insert({ project_id: projectId, actor: 'agent', kind, status, message, details, created_by: agentEmail }));
    },

    // ---- the project
    async getProject(projectId) { return must(await db.from('projects').select('*').eq('id', projectId).maybeSingle()); },
    async getAccounts(projectId) { return must(await db.from('project_ad_accounts').select('*').eq('project_id', projectId).order('created_at', { ascending: true })) || []; },
    async getGroups(projectId) { return must(await db.from('project_campaign_groups').select('*').eq('project_id', projectId).order('sort', { ascending: true }).order('id', { ascending: true })) || []; },
    async getCustomMetrics(projectId) { return must(await db.from('report_custom_metrics').select('*').or(`project_id.eq.${projectId},project_id.is.null`).order('id', { ascending: true })) || []; },

    // ---- reports and decks
    async getReport(projectId, periodType, periodStart) {
      return must(await db.from('project_reports').select('*').eq('project_id', projectId).eq('period_type', periodType).eq('period_start', periodStart).maybeSingle());
    },
    async getReports(projectId, periodType) {
      return must(await db.from('project_reports').select('*').eq('project_id', projectId).eq('period_type', periodType).order('period_start', { ascending: false })) || [];
    },
    async saveReport({ projectId, periodType, period, source, status, data }) {
      return must(await db.from('project_reports').upsert({
        project_id: projectId, period_type: periodType, period_start: period.start, period_end: period.end,
        source, status, data, created_by: agentEmail, updated_at: nowIso(),
      }, { onConflict: 'project_id,period_type,period_start' }).select().single());
    },
    async getDeck(projectId, periodType, periodStart, platform) {
      return must(await db.from('project_decks').select('id, source, status').eq('project_id', projectId).eq('period_type', periodType).eq('period_start', periodStart).eq('platform', platform).maybeSingle());
    },
    async saveDeck({ projectId, reportId, periodType, period, platform, style, lang, deck }) {
      return must(await db.from('project_decks').upsert({
        project_id: projectId, report_id: reportId || null, period_type: periodType, period_start: period.start, period_end: period.end,
        platform, style, lang, status: 'draft', source: 'agent', deck, created_by: agentEmail, updated_at: nowIso(),
      }, { onConflict: 'project_id,period_type,period_start,platform' }).select('id').single());
    },
  };
}
