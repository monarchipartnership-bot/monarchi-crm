import { supabase } from '../supabaseClient';
import { isoDate } from '../dateHelpers';

export async function fetchWeeklyRowsForMonth(year, month) {
  const { data, error } = await supabase.from('weekly_reports').select('*').eq('year', year).eq('month', month);
  if (error) { console.warn('fetchWeeklyRowsForMonth failed', error); return []; }
  return data ?? [];
}

export async function fetchMonthlyReportByStart(monthStartIso) {
  const { data, error } = await supabase.from('monthly_reports').select('*').eq('month_start', monthStartIso).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveMonthlyReport({ year, month, manager, weeksFound, weeksTotal, data }) {
  const monthStart = isoDate(year, month, 1);
  const payload = {
    year,
    month,
    month_start: monthStart,
    author: manager || null,
    weeks_found: weeksFound,
    weeks_total: weeksTotal,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('monthly_reports').upsert(payload, { onConflict: 'month_start' });
  if (error) throw error;
}
