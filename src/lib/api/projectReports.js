import { supabase } from '../supabaseClient';

// Per-project ad-performance reports (Daily/Weekly/Monthly). One row per
// (project, period, platform) — a project can have both a Meta and a Google
// report for the same period, matching how the reference spreadsheet keeps
// separate Meta/Google tabs. Every mutator sets updated_at manually in JS,
// matching the existing report tables' convention (no DB trigger anywhere
// in this project).

function nowIso() {
  return new Date().toISOString();
}

export async function fetchProjectDailyReport(projectId, reportDate, platform) {
  const { data, error } = await supabase
    .from('project_daily_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('report_date', reportDate)
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProjectDailyReport({ projectId, reportDate, platform, data }) {
  const payload = { project_id: projectId, report_date: reportDate, platform, data, updated_at: nowIso() };
  const { error } = await supabase.from('project_daily_reports').upsert(payload, { onConflict: 'project_id,report_date,platform' });
  if (error) throw error;
}

export async function fetchProjectWeeklyReport(projectId, weekStart, platform) {
  const { data, error } = await supabase
    .from('project_weekly_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('week_start', weekStart)
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProjectWeeklyReport({ projectId, weekStart, weekEnd, platform, data }) {
  const payload = { project_id: projectId, week_start: weekStart, week_end: weekEnd, platform, data, updated_at: nowIso() };
  const { error } = await supabase.from('project_weekly_reports').upsert(payload, { onConflict: 'project_id,week_start,platform' });
  if (error) throw error;
}

export async function fetchProjectMonthlyReport(projectId, monthStart, platform) {
  const { data, error } = await supabase
    .from('project_monthly_reports')
    .select('*')
    .eq('project_id', projectId)
    .eq('month_start', monthStart)
    .eq('platform', platform)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveProjectMonthlyReport({ projectId, monthStart, platform, data }) {
  const payload = { project_id: projectId, month_start: monthStart, platform, data, updated_at: nowIso() };
  const { error } = await supabase.from('project_monthly_reports').upsert(payload, { onConflict: 'project_id,month_start,platform' });
  if (error) throw error;
}

// Cross-project reads for the Project Managers Dashboard — every project's
// (every platform's) row for a given period, rather than one project at a time.

export async function fetchAllWeeklyReportsForWeek(weekStart) {
  const { data, error } = await supabase.from('project_weekly_reports').select('*').eq('week_start', weekStart);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllMonthlyReportsForMonth(monthStart) {
  const { data, error } = await supabase.from('project_monthly_reports').select('*').eq('month_start', monthStart);
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllDailyReportsForDate(reportDate) {
  const { data, error } = await supabase.from('project_daily_reports').select('*').eq('report_date', reportDate);
  if (error) throw error;
  return data ?? [];
}

// Every project's daily-report rows whose report_date falls in [startIso, endIso]
// — used for the "reports submitted this week" donut on the Home dashboard.
export async function fetchAllDailyReportsBetween(startIso, endIso) {
  const { data, error } = await supabase
    .from('project_daily_reports')
    .select('project_id, report_date')
    .gte('report_date', startIso)
    .lte('report_date', endIso);
  if (error) throw error;
  return data ?? [];
}

// All projects' weekly rows whose week_start falls in [startIso, endIso] —
// mirrors Sales's fetchWeeklyRowsBetween, used for the multi-week trend chart.
export async function fetchWeeklyReportsBetween(startIso, endIso) {
  const { data, error } = await supabase
    .from('project_weekly_reports')
    .select('*')
    .gte('week_start', startIso)
    .lte('week_start', endIso)
    .order('week_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
