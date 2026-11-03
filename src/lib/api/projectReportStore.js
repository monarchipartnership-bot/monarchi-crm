import { supabase } from '../supabaseClient';
import { collapseStatuses, flatten } from '../reportScope';
import { reviewPatch } from '../projectHistory';
import { authedPost } from '../adAccounts';
import { normalizeTemplate } from '../reportTemplate';

// Storage for the redesigned project reports (migration
// 20261008000000_project_reports.sql): saved weekly/monthly reports, the
// campaign groups of a project and custom metrics. The read helpers return []
// (and warn) if the tables aren't there yet, so the pages still open.

function nowIso() { return new Date().toISOString(); }

// ---- Reports ----
// `platform` (optional) = one scope: a platform id or 'all' («Разом»); without it every scope comes back.
// `strict`: a failure is thrown instead of becoming an empty list (a screen that must tell «could not load» from «no reports»).
// How many reads of the cross-project lists (the dashboard) failed and were turned into an empty list: the dashboard compares it before and after loading to say so.
export const readFailures = { count: 0 };

export async function fetchProjectReports(projectId, periodType, platform, strict = false) {
  let q = supabase
    .from('project_reports').select('*')
    .eq('project_id', projectId);
  if (periodType) q = q.eq('period_type', periodType); // without it: every type, the archive's list
  if (platform) q = q.eq('platform', platform);
  const { data, error } = await q.order('period_start', { ascending: false });
  if (error) { if (strict) throw error; console.warn('fetchProjectReports failed', error); return []; }
  return data ?? [];
}

export async function saveProjectReport({ projectId, periodType, periodStart, periodEnd, platform = 'all', source = 'manual', status = 'draft', data, createdBy }) {
  if (periodType === 'monthly') {
    // the running row of the month («month to date», made by the agent) moves to the final period: two monthly rows of one month would break the agent's own run
    const { data: same } = await supabase.from('project_reports').select('id, source, status, data').eq('project_id', projectId).eq('period_type', 'monthly').eq('period_start', periodStart).eq('platform', platform).neq('period_end', periodEnd);
    const mine = (same || []).find((r) => r.source === 'agent' && r.status === 'draft' && r.data?.toDate);
    if (mine) {
      const { data: moved, error: moveError } = await supabase.from('project_reports').update({ period_end: periodEnd, source, status, data, created_by: createdBy || null, updated_at: nowIso() }).eq('id', mine.id).select().single();
      if (moveError) throw moveError;
      return moved;
    }
  }
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
  if (error) { readFailures.count += 1; console.warn('fetchAgentDrafts failed', error); return []; }
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

// One full report (with its numbers).
export async function fetchProjectReport(id) {
  const { data, error } = await supabase.from('project_reports').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// The reports of a project that are still worked on (drafts and reports returned for rework), newest first, with their numbers: «Робота над звітами».
export async function fetchWorkReports(projectId) {
  const { data, error } = await supabase.from('project_reports').select('*').eq('project_id', projectId).in('status', ['draft', 'reviewed', 'rework']).order('updated_at', { ascending: false });
  if (error) throw error; // the workbench shows the failure with a retry instead of «no drafts»
  return data ?? [];
}
// How many reports of a project wait to be worked on (the badge of the tab).
export async function countWorkReports(projectId) {
  const { count, error } = await supabase.from('project_reports').select('id', { count: 'exact', head: true }).eq('project_id', projectId).in('status', ['draft', 'reviewed', 'rework']);
  if (error) return 0;
  return count || 0;
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
export async function createCampaignGroup(projectId, { name, campaigns, platform, keywords = [] }) {
  const { data: last } = await supabase.from('project_campaign_groups').select('sort').eq('project_id', projectId).order('sort', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('project_campaign_groups').insert({ project_id: projectId, name: name.trim(), campaigns, platform: platform || null, keywords, sort: (last?.sort ?? -1) + 1 }).select().single();
  if (error) throw error;
  return data;
}
// A group is its listed campaigns plus, when it has `keywords`, every campaign whose name contains one of them (new campaigns with such a name join by themselves).
export async function updateCampaignGroup(id, { name, campaigns, platform, keywords = [] }) {
  const { data, error } = await supabase.from('project_campaign_groups').update({ name: name.trim(), campaigns, ...(platform ? { platform } : {}), keywords }).eq('id', id).select().single();
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
  if (error) { readFailures.count += 1; console.warn('fetchWeeklyReportStatuses failed', error); return []; }
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
  if (error) { readFailures.count += 1; console.warn('weeklyBetween failed', error); return []; }
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
  if (error) { readFailures.count += 1; console.warn('fetchAllMonthlyReportsForMonth failed', error); return []; }
  return flatten(data ?? [], () => ({ month_start: monthStartIso }));
}

// ---- The client's link (the public page /r/<token>, see migration 20261033000000_report_shares.sql) ----
// One active link per project + platform scope. → { id, token, created_at, opens, last_opened_at } or null.
export async function fetchReportShare(projectId, platform) {
  const { data, error } = await supabase.from('report_shares').select('id, token, created_at, opens, last_opened_at')
    .eq('project_id', projectId).eq('platform', platform).eq('active', true).is('report_id', null).maybeSingle();
  if (error) throw error; // a failure is not «no link»: the page must not offer to create one (that would replace the link the client already has)
  return data;
}
// A new link; the previous one stops working at once. → the token.
export async function issueReportShare(projectId, platform, by) {
  const { data, error } = await supabase.rpc('issue_report_share', { p_project: projectId, p_platform: platform, p_by: by || null });
  if (error) throw error;
  return data;
}
export async function revokeReportShare(projectId, platform) {
  const { error } = await supabase.from('report_shares').update({ active: false, revoked_at: nowIso() }).eq('project_id', projectId).eq('platform', platform).eq('active', true).is('report_id', null);
  if (error) throw error;
}

// The link of ONE custom report («Показники за період» → «Зберегти»): the page shows that report only (migration 20261053000000_custom_report_shares.sql).
export async function fetchReportShareFor(reportId) {
  const { data, error } = await supabase.from('report_shares').select('id, token, created_at, opens, last_opened_at').eq('report_id', reportId).eq('active', true).maybeSingle();
  if (error) throw error;
  return data;
}
export async function issueReportShareFor(reportId, by) {
  const { data, error } = await supabase.rpc('issue_report_share_for_report', { p_report: reportId, p_by: by || null });
  if (error) throw error;
  return data;
}
export async function revokeReportShareFor(reportId) {
  const { error } = await supabase.from('report_shares').update({ active: false, revoked_at: nowIso() }).eq('report_id', reportId).eq('active', true);
  if (error) throw error;
}

// ---- The report layout of a project, one per ad platform (migration 20261035000000_report_layouts.sql) ----
// → { exists, layout }: the saved layout, or the standard one (exists false) when nothing is saved yet (or the table is not there yet).
const fromRow = (row) => (row ? { updatedAt: row.updated_at, kind: row.kind, blocks: row.blocks, creatives: row.creatives, hiddenMetrics: row.hidden_metrics, metricOrder: row.metric_order, baseMetrics: row.base_metrics, funnel: row.funnel, campaignSel: row.campaign_selection } : null);
export async function fetchReportLayout(projectId, platform) {
  const { data, error } = await supabase.from('project_report_layouts').select('kind, blocks, creatives, hidden_metrics, metric_order, base_metrics, funnel, campaign_selection, updated_at').eq('project_id', projectId).eq('platform', platform).maybeSingle();
  if (error) throw error; // not «no layout»: a screen that took the standard one for it would save over the real layout
  return { exists: Boolean(data), layout: normalizeTemplate(fromRow(data)), updatedAt: data?.updated_at || null };
}
// platform → the layout, only for the platforms that have one saved.
export async function fetchReportLayouts(projectId) {
  const { data, error } = await supabase.from('project_report_layouts').select('platform, kind, blocks, creatives, hidden_metrics, metric_order, base_metrics, funnel, campaign_selection').eq('project_id', projectId);
  if (error) { console.warn('fetchReportLayouts failed', error); return {}; }
  return Object.fromEntries((data ?? []).map((r) => [r.platform, normalizeTemplate(fromRow(r))]));
}
export async function saveReportLayout(projectId, platform, layout, by) {
  const t = normalizeTemplate(layout);
  const { error } = await supabase.from('project_report_layouts').upsert({ project_id: projectId, platform, kind: t.kind, blocks: t.blocks, creatives: t.creatives, hidden_metrics: t.hiddenMetrics, metric_order: t.metricOrder, base_metrics: t.baseMetrics, funnel: t.funnel, campaign_selection: t.campaignSel, updated_by: by || null, updated_at: nowIso() }, { onConflict: 'project_id,platform' });
  if (error) throw error;
  return t;
}

// The workbench saves a report as it is edited: the whole `data`, and optionally a new status. A report a person has saved is theirs (source «manual»),
// so the agent never overwrites it.
export async function saveReportData(id, { data, status }) {
  const patch = { data, source: 'manual', updated_at: nowIso(), ...(status ? { status } : {}) };
  const { error } = await supabase.from('project_reports').update(patch).eq('id', id);
  if (error) throw error;
}
