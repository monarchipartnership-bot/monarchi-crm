import { supabase } from '../supabaseClient';

// Storage for the redesigned project reports (migration
// 20261008000000_project_reports.sql): saved weekly/monthly reports, the
// campaign groups of a project and custom metrics. The read helpers return []
// (and warn) if the tables aren't there yet, so the pages still open.

function nowIso() { return new Date().toISOString(); }

// ---- Reports ----
export async function fetchProjectReports(projectId, periodType) {
  const { data, error } = await supabase
    .from('project_reports').select('*')
    .eq('project_id', projectId).eq('period_type', periodType)
    .order('period_start', { ascending: false });
  if (error) { console.warn('fetchProjectReports failed', error); return []; }
  return data ?? [];
}

export async function saveProjectReport({ projectId, periodType, periodStart, periodEnd, source = 'manual', status = 'draft', data, createdBy }) {
  const { data: row, error } = await supabase.from('project_reports').upsert({
    project_id: projectId, period_type: periodType, period_start: periodStart, period_end: periodEnd,
    source, status, data, created_by: createdBy || null, updated_at: nowIso(),
  }, { onConflict: 'project_id,period_type,period_start' }).select().single();
  if (error) throw error;
  return row;
}

// Reports the AI agent made that nobody has reviewed yet (status still «draft»), newest first.
export async function fetchAgentDrafts() {
  const { data, error } = await supabase.from('project_reports').select('id, project_id, period_type, period_start, period_end, updated_at')
    .eq('source', 'agent').eq('status', 'draft').order('updated_at', { ascending: false }).limit(100);
  if (error) { console.warn('fetchAgentDrafts failed', error); return []; }
  return data ?? [];
}

export async function updateReportStatus(id, status) {
  const { error } = await supabase.from('project_reports').update({ status, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

export async function deleteProjectReport(id) {
  const { error } = await supabase.from('project_reports').delete().eq('id', id);
  if (error) throw error;
}

// ---- Campaign groups ----
export async function fetchCampaignGroups(projectId) {
  const { data, error } = await supabase.from('project_campaign_groups').select('*').eq('project_id', projectId).order('sort', { ascending: true }).order('id', { ascending: true });
  if (error) { console.warn('fetchCampaignGroups failed', error); return []; }
  return data ?? [];
}

// Replaces the project's whole group list with `groups` ([{ name, keywords: [] }]).
export async function replaceCampaignGroups(projectId, groups) {
  const del = await supabase.from('project_campaign_groups').delete().eq('project_id', projectId);
  if (del.error) throw del.error;
  const rows = groups.filter((g) => g.name.trim()).map((g, i) => ({ project_id: projectId, name: g.name.trim(), keywords: (g.keywords || []).map((k) => k.trim()).filter(Boolean), sort: i }));
  if (!rows.length) return;
  const ins = await supabase.from('project_campaign_groups').insert(rows);
  if (ins.error) throw ins.error;
}

// ---- Custom metrics ----
// The project's own metrics plus the ones available in every project.
export async function fetchCustomMetrics(projectId) {
  const { data, error } = await supabase.from('report_custom_metrics').select('*')
    .or(`project_id.eq.${projectId},project_id.is.null`).order('id', { ascending: true });
  if (error) { console.warn('fetchCustomMetrics failed', error); return []; }
  return data ?? [];
}

export async function addCustomMetric({ projectId, global, name, key, formula, format, createdBy }) {
  const { error } = await supabase.from('report_custom_metrics').insert({
    project_id: global ? null : projectId, name, key, formula, format, created_by: createdBy || null,
  });
  if (error) throw error;
}

export async function deleteCustomMetric(id) {
  const { error } = await supabase.from('report_custom_metrics').delete().eq('id', id);
  if (error) throw error;
}

// ---- Cross-project reads for Home and the Projects Dashboard ----
// Which projects have a weekly report for the week starting `periodStart`, and in what state.
export async function fetchWeeklyReportStatuses(periodStart) {
  const { data, error } = await supabase.from('project_reports').select('project_id, status').eq('period_type', 'weekly').eq('period_start', periodStart);
  if (error) { console.warn('fetchWeeklyReportStatuses failed', error); return []; }
  return data ?? [];
}

// The dashboard wants one row per project + platform with plain numbers in `data`,
// so a saved report is flattened to that shape.
function flatten(rows, extra) {
  return rows.flatMap((r) => Object.entries(r.data?.platforms || {}).map(([platform, p]) => ({
    project_id: r.project_id, platform, data: p.total || {}, ...extra(r),
  })));
}

function mondayIsoOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return dt.toISOString().slice(0, 10);
}

async function weeklyBetween(startIso, endIso) {
  const { data, error } = await supabase.from('project_reports').select('*').eq('period_type', 'weekly').gte('period_start', startIso).lte('period_start', endIso).order('period_start', { ascending: true });
  if (error) { console.warn('weeklyBetween failed', error); return []; }
  return data ?? [];
}

// A calendar week (Monday..Sunday) can hold two clipped report weeks when it
// straddles a month boundary, so the Monday week collects both.
export async function fetchAllWeeklyReportsForWeek(mondayIso) {
  const sunday = new Date(mondayIso + 'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const rows = await weeklyBetween(mondayIso, sunday.toISOString().slice(0, 10));
  return flatten(rows, () => ({ week_start: mondayIso }));
}

export async function fetchWeeklyReportsBetween(startIso, endIso) {
  const rows = await weeklyBetween(startIso, endIso);
  return flatten(rows, (r) => ({ week_start: mondayIsoOf(r.period_start) }));
}

export async function fetchAllMonthlyReportsForMonth(monthStartIso) {
  const { data, error } = await supabase.from('project_reports').select('*').eq('period_type', 'monthly').eq('period_start', monthStartIso);
  if (error) { console.warn('fetchAllMonthlyReportsForMonth failed', error); return []; }
  return flatten(data ?? [], () => ({ month_start: monthStartIso }));
}
