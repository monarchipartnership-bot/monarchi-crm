// The report "engine": everything that makes a project report except the screen and the database.
// The «Тижневий / Місячний звіт» tabs use it for a person's click, and the project AI agent uses
// the very same functions for a scheduled run, so a report made by the agent can never differ from
// one made by hand. Pure code: no React, no browser, no Supabase. Anything that has to reach the
// outside world (the ad platforms, the text writer) arrives as the `post(path, body)` argument;
// the browser passes its signed-in call, the server its own.
import { computeWeeksForMonth, isoDate } from './dateHelpers.js';
import {
  daysInRange, fetchProjectRange, lastCompletedWeek, periodFromPicker, precedingDays, previousPicker,
} from './periodReport.js';
import { collectFacts, describeWork, mergeWeeks } from './workHistory.js';

export const EMPTY_SECTIONS = { whatWasDone: '', conclusion: '', plans: '' };

const iso = (d) => isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
const fmt = (s) => s.split('-').reverse().join('.');

// ----- Which period a scheduled run is due for ---------------------------------------------------
// today: 'YYYY-MM-DD' in the team's own time zone (the server must not use its UTC clock for this).
// Weekly → the latest report week that has already ended; monthly → the month before today's.
export function dueReportPeriod(periodType, today) {
  let picker;
  if (periodType === 'monthly') {
    const [y, m] = today.split('-').map(Number);
    picker = m === 1 ? { year: y - 1, month: 12, weekIndex: 1 } : { year: y, month: m - 1, weekIndex: 1 };
  } else {
    const week = lastCompletedWeek(today);
    if (!week) return null;
    const [y, m] = week.start.split('-').map(Number);
    const index = computeWeeksForMonth(y, m).find((w) => iso(w.start) === week.start)?.index || 1;
    picker = { year: y, month: m, weekIndex: index };
  }
  return { picker, period: periodFromPicker(periodType, picker) };
}

// ----- What the numbers are compared with ---------------------------------------------------------
//   null                       no comparison
//   { mode: 'calendar' }       the previous report period (previous week of the month / previous month)
//   { mode: 'days' }           the same number of days right before this period
//   { mode: 'custom', from, to } any dates
export function comparisonPeriod(periodType, picker, period, compare) {
  if (!compare) return null;
  if (compare.mode === 'custom') return { start: compare.from, end: compare.to, label: '' };
  if (compare.mode === 'days') return { ...precedingDays(period.start, daysInRange(period.start, period.end)), label: '' };
  return periodFromPicker(periodType, previousPicker(periodType, picker));
}

// Day counts of the two periods; the report remembers whether they differ (sums are not comparable then).
export function comparisonInfo(period, prev) {
  const daysCur = daysInRange(period.start, period.end);
  const daysPrev = prev ? daysInRange(prev.start, prev.end) : daysCur;
  return { daysCur, daysPrev, unequal: daysCur !== daysPrev };
}

// ----- The numbers ------------------------------------------------------------------------------
// accounts: the project's project_ad_accounts rows; groups: its campaign groups.
// → { data: { platforms, previous }, errors } — `errors` has one entry per platform that failed.
export async function pullReportData({ accounts, kind, groups, period, prev, post }) {
  const [cur, before] = await Promise.all([
    fetchProjectRange(accounts, period.start, period.end, kind, groups, post),
    prev ? fetchProjectRange(accounts, prev.start, prev.end, kind, groups, post) : Promise.resolve(null),
  ]);
  return {
    data: { platforms: cur.platforms, previous: before ? { period: { start: prev.start, end: prev.end }, platforms: before.platforms } : null },
    errors: cur.errors,
  };
}

// What a saved report holds (project_reports.data). `compare` is internal bookkeeping and is never printed.
export function reportPayload({ kind, data, compare, period, prev, selection = [], options = { groups: true }, sections = EMPTY_SECTIONS, note = '' }) {
  const info = comparisonInfo(period, prev);
  return {
    version: 1,
    kind,
    platforms: data?.platforms || {},
    previous: data?.previous || null,
    compare: compare ? { mode: compare.mode, ...info } : null,
    selection,
    options,
    sections,
    note,
    savedAt: new Date().toISOString(),
  };
}

// ----- «What was done» ----------------------------------------------------------------------------
// source 'history': from the accounts' change history (a weekly report, or a monthly one when there are no weekly texts).
// source 'weeks':   a month's text from the weekly reports already written for it; `weeklyRows` are those
//                   project_reports rows, `expectedWeeks` how many weeks the month has.
// → { text, writer, info, empty? } — `info` is what the text was built from (shown to the person, never printed),
//   `empty` the reason there is nothing to write.
export async function buildWhatWasDone({ source, periodType, period, accounts, projectName, note, weeklyRows = [], expectedWeeks = 0, post }) {
  if (source === 'weeks') {
    const weeks = weeklyRows
      .filter((r) => r.period_start >= period.start && r.period_start <= period.end)
      .sort((a, b) => a.period_start.localeCompare(b.period_start))
      .map((r) => ({ label: `${fmt(r.period_start)} – ${fmt(r.period_end)}`, text: r.data?.sections?.whatWasDone || '' }))
      .filter((w) => w.text.trim());
    const info = { kind: 'weeks', weeks: weeks.map((w) => w.label), missing: expectedWeeks - weeks.length, facts: [], notes: [], errors: {} };
    if (!weeks.length) return { text: '', writer: 'none', info, empty: 'Для цього місяця немає тижневих звітів з текстом «What was done». Збережіть тижневі звіти або згенеруйте текст з історії кабінетів.' };
    const result = await mergeWeeks({ weeks, projectName, note, from: period.start, to: period.end }, post);
    return { ...result, info };
  }
  const { facts, errors, notes } = await collectFacts(accounts, period.start, period.end, post);
  const info = { kind: 'history', facts, notes, errors };
  if (!facts.length) return { text: '', writer: 'none', info, empty: 'У кабінетах за цей період не знайдено дій людей (лише системні події). Додайте текст вручну.' };
  const result = await describeWork({ facts, projectName, note, from: period.start, to: period.end, periodType }, post);
  return { ...result, info };
}
