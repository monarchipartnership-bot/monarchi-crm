import { supabase } from '../supabaseClient';
import { isoDate } from '../dateHelpers';

export async function fetchSavedWeekIndexes(year, month) {
  const saved = new Set();
  const { data, error } = await supabase.from('weekly_reports').select('week_index').eq('year', year).eq('month', month);
  if (error) { console.warn('fetchSavedWeekIndexes failed', error); return saved; }
  data?.forEach((r) => saved.add(r.week_index));
  return saved;
}

export async function fetchReportByWeekStart(weekStartIso) {
  const { data, error } = await supabase.from('weekly_reports').select('*').eq('week_start', weekStartIso).maybeSingle();
  if (error) throw error;
  return data;
}

// All weekly_reports rows whose week_start falls in [startIso, endIso] —
// unlike fetchSavedWeekIndexes/fetchWeeklyRowsForMonth this isn't scoped to a
// single (year, month), so it can span a trend range that crosses months.
export async function fetchWeeklyRowsBetween(startIso, endIso) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('*')
    .gte('week_start', startIso)
    .lte('week_start', endIso)
    .order('week_start', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveWeeklyReport({ year, month, weekIndex, week, manager, data }) {
  const payload = {
    year,
    month,
    week_index: weekIndex,
    week_start: isoDate(week.start.getFullYear(), week.start.getMonth() + 1, week.start.getDate()),
    week_end: isoDate(week.end.getFullYear(), week.end.getMonth() + 1, week.end.getDate()),
    report_date: isoDate(week.start.getFullYear(), week.start.getMonth() + 1, week.start.getDate()),
    author: manager || null,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('weekly_reports').upsert(payload, { onConflict: 'week_start' });
  if (error) throw error;
}

// Clients logged on `daily_reports` within [startIso, endIso], ascending by date —
// the source for the Weekly Report's client auto-import.
export async function fetchDailyClientsForWeek(startIso, endIso) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('report_date,data')
    .gte('report_date', startIso)
    .lte('report_date', endIso)
    .order('report_date', { ascending: true });
  if (error) { console.warn('fetchDailyClientsForWeek failed', error); return []; }
  return data ?? [];
}
