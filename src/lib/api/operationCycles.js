import { supabase } from '../supabaseClient';
import { MAX_REGULARS, cleanRegular, kyivToday, rawRegulars, regularRequest, regularsOf, seasonOver } from '../agents/operationCycles';
import { cleanRequest } from '../agents/creativeTeam';
import { cleanManual, isEmptyManual } from '../agents/projectStyle';
import { DEFAULT_LOOK, cleanLook } from '../creatives/realism';
import { createRequest, startRequest } from './creatives';

// The cycles of an operation (lib/agents/operationCycles.js): the regular ones are kept in the operation itself (config.regulars), an extra one is a request.
const must = ({ data, error }) => { if (error) throw error; return data; };

// The regular cycles live in the operation itself (config.regulars). The operation row is read again before every change, so a change made meanwhile on another
// page (instructions, the agents) is not lost; the older single config.regular is carried over into the list at the first change.
async function readRow(campaignId) {
  const row = must(await supabase.from('ag_campaigns').select('*').eq('id', campaignId).maybeSingle());
  if (!row) throw new Error('Операцію не знайдено.');
  return row;
}
async function writeRegulars(row, list) {
  const { regular: _old, ...rest } = row.config || {};
  return must(await supabase.from('ag_campaigns').update({ config: { ...rest, regulars: list }, updated_at: new Date().toISOString() }).eq('id', row.id).select().single());
}

// Saves a regular cycle: a new one, or the one with input.id. input: { id?, enabled, weekday, time, brief } → { campaign: the updated row, regular: the saved cycle }
export async function saveRegular(campaignId, input, email = null) {
  const row = await readRow(campaignId);
  const list = rawRegulars(row);
  const prev = input.id ? list.find((r) => r.id === input.id) || null : null;
  const live = regularsOf({ config: { regulars: list } }).filter((r) => !seasonOver(r)).length; // a season that is over does not count
  if (!prev && live >= MAX_REGULARS) throw new Error(`Регулярних завдань в операції може бути не більше ${MAX_REGULARS}.`);
  // a NEW regular task starts with the standard realism look; an edit keeps what the task has
  const withLook = !prev && input.brief && input.brief.look === undefined ? { ...input, brief: { ...input.brief, look: DEFAULT_LOOK } } : input;
  const regular = cleanRegular(withLook, { by: email, prev });
  const campaign = await writeRegulars(row, prev ? list.map((r) => (r.id === regular.id ? regular : r)) : [...list, regular]);
  return { campaign, regular };
}

// A seasonal task: a regular one for a period; `replaces` = the ids of the main tasks that rest while it lasts. → { campaign, regular }; startNow: the first run at once
export async function createSeasonal(campaign, { title, brief, schedule, startDate, endDate, replaces = [], startNow = false }, email = null) {
  const out = await saveRegular(campaign.id, { enabled: true, seasonal: true, title, ...schedule, startDate, endDate, replaces, brief }, email);
  if (startNow) await runRegularNow(out.campaign, out.regular, email);
  return out;
}

// A regular cycle is switched on or off without touching its parameters.
export async function setRegularEnabled(campaignId, id, enabled, email = null) {
  const r = rawRegulars(await readRow(campaignId)).find((x) => x.id === id);
  if (!r) throw new Error('Регулярне завдання не знайдено.');
  return saveRegular(campaignId, { id, enabled, weekdays: r.weekdays, weekday: r.weekday, everyDays: r.everyDays, startDate: r.startDate, time: r.time, brief: r.brief }, email);
}

// A regular cycle is removed (the cycles it already made stay).
export async function removeRegular(campaignId, id) {
  const row = await readRow(campaignId);
  return writeRegulars(row, rawRegulars(row).filter((r) => r.id !== id));
}

// The first pass of a regular cycle right now, without waiting for its day (the scheduled one still comes on its day).
export async function runRegularNow(campaign, regular, email = null) {
  const assets = campaign.project_id ? must(await supabase.from('project_creative_assets').select('kind, name, url, path').eq('project_id', campaign.project_id).order('id', { ascending: true })) || [] : [];
  const today = kyivToday();
  const draft = regularRequest(campaign, today, assets, regular);
  // a weekly task: not the scheduled run, the day of the schedule stays free; «every N days»: the first run counts as served today, so the next one comes N days later
  const { scheduled_for: _day, ...rest } = draft.brief;
  const brief = regular.everyDays ? draft.brief : rest;
  const row = must(await supabase.from('ag_creative_requests').insert({ ...draft, brief, created_by: email || null }).select().single());
  await startRequest(row.id);
  return row;
}

// An extra cycle: a one-off request with its own parameters, next to the regular one. → the request row
export async function createExtraCycle(campaignId, values, email = null, start = true) {
  const row = await createRequest(campaignId, { ...values, look: values.look === undefined ? DEFAULT_LOOK : values.look, kind: 'extra' }, email); // a new task starts with the standard realism look
  if (start) await startRequest(row.id);
  return row;
}

// The settings of a one-off task (step 3.0b: every task has its own settings, the agents' ones included): the request keeps its brief, the next start («Запустити ще раз») reads the new one.
// values: the same fields as the form of a new task. → the request row
export async function updateExtraCycle(requestId, values) {
  const clean = cleanRequest({ ...values, kind: 'extra' });
  return must(await supabase.from('ag_creative_requests').update({ title: clean.title, brief: clean.brief, materials: clean.materials, updated_at: new Date().toISOString() }).eq('id', requestId).select().single());
}

// The look of a task (owner, 2026-11-12: every task has its own style): kept in its brief. A regular task keeps it for every next run; a one-off task in its request. manual: { text, image, copy } (an empty
// one gives the decision back to the scout).
export async function setRegularStyle(campaignId, id, manual) {
  const row = await readRow(campaignId);
  const r = rawRegulars(row).find((x) => x.id === id);
  if (!r) throw new Error('Регулярне завдання не знайдено.');
  const { style: _old, ...rest } = r.brief || {};
  const clean = cleanManual(manual);
  return saveRegular(campaignId, { id, enabled: r.enabled, title: r.title, weekdays: r.weekdays, weekday: r.weekday, everyDays: r.everyDays, startDate: r.startDate, time: r.time, brief: isEmptyManual(clean) ? rest : { ...rest, style: clean } });
}
// The realism look of a task (step 3.4): kept in its brief like the style. look: a key of the list, or null = back to «std».
export async function setRegularLook(campaignId, id, look) {
  const row = await readRow(campaignId);
  const r = rawRegulars(row).find((x) => x.id === id);
  if (!r) throw new Error('Регулярне завдання не знайдено.');
  const { look: _old, ...rest } = r.brief || {};
  const key = cleanLook(look);
  return saveRegular(campaignId, { id, enabled: r.enabled, title: r.title, weekdays: r.weekdays, weekday: r.weekday, everyDays: r.everyDays, startDate: r.startDate, time: r.time, brief: key ? { ...rest, look: key } : rest });
}
export async function setRequestLook(requestId, brief, look) {
  const { look: _old, ...rest } = brief || {};
  const key = cleanLook(look);
  return must(await supabase.from('ag_creative_requests').update({ brief: key ? { ...rest, look: key } : rest, updated_at: new Date().toISOString() }).eq('id', requestId).select().single());
}
export async function setRequestStyle(requestId, brief, manual) {
  const { style: _old, ...rest } = brief || {};
  const clean = cleanManual(manual);
  return must(await supabase.from('ag_creative_requests').update({ brief: isEmptyManual(clean) ? rest : { ...rest, style: clean }, updated_at: new Date().toISOString() }).eq('id', requestId).select().single());
}

// Names (owner, 2026-11-12): the team and its tasks get names the person chooses. A regular task keeps its name in the operation, so the next runs carry it; a one-off task is a request.
export async function renameRegular(campaignId, id, title) {
  const row = await readRow(campaignId);
  const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) throw new Error('Назва не може бути порожньою.');
  const list = rawRegulars(row);
  if (!list.some((r) => r.id === id)) throw new Error('Регулярне завдання не знайдено.');
  return writeRegulars(row, list.map((r) => (r.id === id ? { ...r, title: name } : r)));
}
export async function renameRequest(requestId, title) {
  const name = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!name) throw new Error('Назва не може бути порожньою.');
  return must(await supabase.from('ag_creative_requests').update({ title: name, updated_at: new Date().toISOString() }).eq('id', requestId).select().single());
}
