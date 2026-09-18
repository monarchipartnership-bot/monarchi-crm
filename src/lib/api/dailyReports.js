import { supabase } from '../supabaseClient';
import { isoDate } from '../dateHelpers';

// Days within `year`/`month` that already have a saved report — used to color
// the month-fullness dots.
export async function fetchSavedDays(year, month) {
  const saved = new Set();
  const { data, error } = await supabase.from('daily_reports').select('day').eq('year', year).eq('month', month);
  if (error) { console.warn('fetchSavedDays failed', error); return saved; }
  data?.forEach((r) => saved.add(r.day));
  return saved;
}

export async function fetchReportByDate(year, month, day) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('*')
    .eq('report_date', isoDate(year, month, day))
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Every daily_reports row (one per calendar day, whole-team report) whose
// report_date falls in [startIso, endIso] — used to count how many days
// this week already have a submitted report.
export async function fetchDailyReportsBetween(startIso, endIso) {
  const { data, error } = await supabase.from('daily_reports').select('report_date').gte('report_date', startIso).lte('report_date', endIso);
  if (error) { console.warn('fetchDailyReportsBetween failed', error); return []; }
  return data ?? [];
}

export async function saveDailyReport({ year, month, day, name, done, clients, plans }) {
  const data = {
    _type: 'monarchi_daily_report',
    _version: 3,
    name,
    done: done.map((it) => ({ id: it.id, text: it.text, tag: it.tag || '' })),
    clients: clients.map((it) => ({ platform: it.platform, leadType: it.leadType, name: it.name, title: it.title || '', text: it.text, clientId: it.clientId || null })),
    plans: plans.map((it) => ({ id: it.id, text: it.text, tag: it.tag || '', priority: it.priority || '' })),
  };
  const payload = {
    year,
    month,
    day,
    report_date: isoDate(year, month, day),
    author: name || null,
    data,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('daily_reports').upsert(payload, { onConflict: 'report_date' });
  if (error) throw error;
}
