import { supabase } from '../supabaseClient';
import { collapseStatuses, flatten } from '../reportScope';
import { reviewPatch } from '../projectHistory';
import { authedPost } from '../adAccounts';

// Storage for the redesigned project reports (migration
// 20261008000000_project_reports.sql): saved weekly/monthly reports, the
// campaign groups of a project and custom metrics. The read helpers return []
// (and warn) if the tables aren't there yet, so the pages still open.

function nowIso() { return new Date().toISOString(); }

// ---- Reports ----
// `platform` (optional) = one scope: a platform id or 'all' («Разом»); without it every scope comes back.
export async function fetchProjectReports(projectId, periodType, platform) {
  let q = supabase
    .from('project_reports').select('*')
    .eq('project_id', projectId);
  if (periodType) q = q.eq('period_type', periodType); // without it: every type, the archive's list
  if (platform) q = q.eq('platform', platform);
  const { data, error } = await q.order('period_start', { ascending: false });
  if (error) { console.warn('fetchProjectReports failed', error); return []; }
  return data ?? [];
}

export async function saveProjectReport({ projectId, periodType, periodStart, periodEnd, platform = 'all', source = 'manual', status = 'draft', data, createdBy }) {
  const { data: row, error } = await supabase.from('project_reports').upsert({
    project_id: projectId, period_type: periodType, period_start: periodStart, period_end: periodEnd, platform,
    source, status, data, created_by: createdBy || null, updated_at: nowIso(),
  }, { onConflict: 'project_id,period_type,period_start,period_end,platform' }).select().single();
  if (error) throw error;
  return row;
}

// Reports the AI agent made that nobody has reviewed yet (status still «draft»), newest first.
export async function fetchAgentDrafts() {
  const { data, error } = await supabase.from('project_reports').select('id, project_id, period_type, period_start, period_end, platform, updated_at')
    .eq('source', 'agent').eq('status', 'draft').order('updated_at', { ascending: false }).limit(100);
  if (error) { console.warn('fetchAgentDrafts failed', error); return []; }
  return data ?? [];
}

export async function updateReportStatus(id, status) {
  const { error } = await supabase.from('project_reports').update({ status, updated_at: nowIso() }).eq('id', id);
  if (error) throw error;
}

// One step of the approval flow: send / approve / return / reopen (see projectHistory.reviewPatch). The note and who did it are kept in data.review.
export async function setReportStatus(id, action, { by, note } = {}) {
  const { data: row, error } = await supabase.from('project_reports').select('id, status, data').eq('id', id).single();
  if (error) throw error;
  const patch = reviewPatch(row, action, by || null, note);
  const { error: e2 } = await supabase.from('project_reports').update({ status: patch.status, data: { ...(row.data || {}), review: patch.review }, updated_at: nowIso() }).eq('id', id);
  if (e2) throw e2;
  return patch.status;
}

// After a week is approved (or its approval withdrawn) the running total of its month is pulled again (api/project-month-refresh.js).
// It never blocks the approval: a failure comes back as { error } for the page to tell the person.
export async function refreshMonthTotal(projectId, monthKey) {
  try { return await authedPost('/api/project-month-refresh', { projectId, monthKey }); } catch (e) { return { error: e.message || 'Не вдалося оновити підсумок місяця.' }; }
}

// One full report (with its numbers), for opening it from the approvals list.
export async function fetchProjectReport(id) {
  const { data, error } = await supabase.from('project_reports').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Every report that waits for approval, with its project's name (the numbers stay out of this read).
export async function fetchPendingReports() {
  const { data, error } = await supabase.from('project_reports')
    .select('id, project_id, platform, period_type, period_start, period_end, status, source, updated_at, review:data->review, projects(name)')
    .eq('status', 'reviewed').order('updated_at', { ascending: false }).limit(300);
  if (error) { console.warn('fetchPendingReports failed', error); return []; }
  return data ?? [];
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

// A group = a name + the platform it was made in + the chosen campaigns ('platform|campaign name' keys). Old keyword groups have `keywords` and an empty `campaigns`.
export async function createCampaignGroup(projectId, { name, campaigns, platform }) {
  const { data: last } = await supabase.from('project_campaign_groups').select('sort').eq('project_id', projectId).order('sort', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('project_campaign_groups').insert({ project_id: projectId, name: name.trim(), campaigns, platform: platform || null, keywords: [], sort: (last?.sort ?? -1) + 1 }).select().single();
  if (error) throw error;
  return data;
}
// Saving turns an old keyword group into an explicit list: its keywords are cleared.
export async function updateCampaignGroup(id, { name, campaigns, platform }) {
  const { data, error } = await supabase.from('project_campaign_groups').update({ name: name.trim(), campaigns, ...(platform ? { platform } : {}), keywords: [] }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteCampaignGroup(id) {
  const { error } = await supabase.from('project_campaign_groups').delete().eq('id', id);
  if (error) throw error;
}

// ---- Extra report columns (per project + platform) ----
// → { meta: ['mx_add_to_cart', ...], ... }; empty when nothing is picked or the table is not there yet.
export async function fetchReportColumns(projectId) {
  const { data, error } = await supabase.from('project_report_columns').select('platform, columns').eq('project_id', projectId);
  if (error) { console.warn('fetchReportColumns failed', error); return {}; }
  return Object.fromEntries((data ?? []).map((r) => [r.platform, r.columns || []]));
}

export async function saveReportColumns(projectId, platform, columns) {
  const { error } = await supabase.from('project_report_columns').upsert({ project_id: projectId, platform, columns, updated_at: nowIso() }, { onConflict: 'project_id,platform' });
  if (error) throw error;
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
  return collapseStatuses(data ?? []);
}


// The dashboard wants one row per project + platform with plain numbers in `data`,
// so a saved report is flattened to that shape.

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
