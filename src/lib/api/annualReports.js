import { supabase } from '../supabaseClient';
import { isoDate } from '../dateHelpers';

// Returns { [month(1-12)]: monthly_reports row } for the given year.
export async function fetchMonthsForYear(year) {
  const { data, error } = await supabase.from('monthly_reports').select('*').eq('year', year);
  if (error) { console.warn('fetchMonthsForYear failed', error); return {}; }
  const byMonth = {};
  (data ?? []).forEach((row) => { byMonth[row.month] = row; });
  return byMonth;
}

export async function fetchAnnualReportByStart(yearStartIso) {
  const { data, error } = await supabase.from('annual_reports').select('*').eq('year_start', yearStartIso).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAnnualReport({ year, monthsFound, data }) {
  const yearStart = isoDate(year, 1, 1);
  const payload = {
    year,
    year_start: yearStart,
    author: null,
    months_found: monthsFound,
    months_total: 12,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('annual_reports').upsert(payload, { onConflict: 'year_start' });
  if (error) throw error;
}
