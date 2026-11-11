import { supabase } from '../supabaseClient';
import { MAX_REGULARS, cleanRegular, kyivToday, rawRegulars, regularRequest } from '../agents/operationCycles';
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
  if (!prev && list.length >= MAX_REGULARS) throw new Error(`Регулярних завдань в операції може бути не більше ${MAX_REGULARS}.`);
  const regular = cleanRegular(input, { by: email, prev });
  const campaign = await writeRegulars(row, prev ? list.map((r) => (r.id === regular.id ? regular : r)) : [...list, regular]);
  return { campaign, regular };
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
  const row = await createRequest(campaignId, { ...values, kind: 'extra' }, email);
  if (start) await startRequest(row.id);
  return row;
}
