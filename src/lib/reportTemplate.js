// The report template of a project: which text blocks its reports have (their titles, which periods, what the agent is told to write), how many creatives,
// and which metrics the tables show. Pure functions (no database, no network), tested in scripts/check-core.mjs; the agent, the report pages and the
// client page all read it through here. (The numbers the agent writes a custom block from live in clientReport.js: figuresText.)
//
// A report keeps a SNAPSHOT of the template it was made with (data.template). Changing the template later never changes a report that already exists:
// an approved report keeps its own titles, blocks and metrics.
import { METRICS } from './reportMetrics.js';
import { CREATIVE_COUNT } from './creatives.js';

export const MAX_BLOCKS = 12;
export const MAX_TITLE = 60;
export const MAX_PROMPT = 800;
export const MAX_METRICS = 20;
export const MAX_CREATIVES = { weekly: 6, monthly: 8 };

// The three blocks every project has. They can be switched off per period type, but not deleted.
export const SYSTEM_BLOCKS = [
  { key: 'whatWasDone', kind: 'whatWasDone', title: 'What was done', prompt: '', weekly: true, monthly: true, client: true },
  { key: 'conclusion', kind: 'conclusion', title: 'Conclusion', prompt: '', weekly: true, monthly: true, client: true },
  { key: 'plans', kind: 'plans', title: 'Plans for the next period', prompt: '', weekly: true, monthly: true, client: true },
];
const SYSTEM_KEYS = new Set(SYSTEM_BLOCKS.map((b) => b.key));

// Ready blocks a manager can add in one click (the extra texts of the monthly report in the client's sheet). The prompt is what the agent is told.
export const PRESETS = [
  { title: 'Conclusions about products and areas in ads', prompt: 'In 2 to 3 sentences say which products or directions (campaign groups) carried the results and which ones need closer attention. Base it only on the figures of the groups.' },
  { title: 'Why we see such results', prompt: 'In 2 to 3 sentences say what the main changes in the results coincided with, using only the figures and the actions listed. Do not claim a cause the material does not show; prefer wording such as "mainly coincided with".' },
  { title: 'What worked good', prompt: 'In 1 to 2 sentences name what worked best (the groups with the best ROAS and the lowest cost per purchase). Use only the figures.' },
  { title: 'What worked worse', prompt: 'In 1 to 2 sentences name what worked worst (the groups with the weakest ROAS or the highest cost per purchase). Use only the figures; no blame, no guessed reasons.' },
];

export const DEFAULT_TEMPLATE = Object.freeze({
  blocks: SYSTEM_BLOCKS,
  creatives: { weekly: CREATIVE_COUNT.weekly, monthly: CREATIVE_COUNT.monthly },
  metrics: null, // null: the standard set of the project type
});

const clampInt = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

export const newBlockKey = () => `b_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Whatever came from the database (or from the form) → a template that is safe to use.
export function normalizeTemplate(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set();
  const blocks = [];
  (Array.isArray(r.blocks) ? r.blocks : []).forEach((b) => {
    if (!b || typeof b !== 'object' || blocks.length >= MAX_BLOCKS) return;
    const key = cleanText(b.key, 40);
    if (!/^[A-Za-z0-9_]+$/.test(key) || seen.has(key)) return;
    const system = SYSTEM_BLOCKS.find((s) => s.key === key);
    const title = cleanText(b.title, MAX_TITLE) || system?.title || '';
    if (!title) return;
    seen.add(key);
    blocks.push({ key, kind: system ? system.kind : 'custom', title, prompt: system ? '' : cleanText(b.prompt, MAX_PROMPT), weekly: b.weekly !== false && b.weekly !== 0, monthly: b.monthly !== false && b.monthly !== 0, client: b.client !== false });
  });
  // the three system blocks are always there; one that is missing in the saved list is simply switched off
  SYSTEM_BLOCKS.forEach((s) => { if (!seen.has(s.key)) blocks.push(raw && Array.isArray(r.blocks) && r.blocks.length ? { ...s, weekly: false, monthly: false } : { ...s }); });
  const metrics = Array.isArray(r.metrics) ? [...new Set(r.metrics.map((k) => cleanText(k, 40)).filter((k) => /^[A-Za-z0-9_]+$/.test(k)))].slice(0, MAX_METRICS) : [];
  return {
    blocks,
    creatives: { weekly: clampInt(r.creatives?.weekly, 0, MAX_CREATIVES.weekly, CREATIVE_COUNT.weekly), monthly: clampInt(r.creatives?.monthly, 0, MAX_CREATIVES.monthly, CREATIVE_COUNT.monthly) },
    metrics: metrics.length ? metrics : null,
  };
}

const periodFlag = (periodType) => (periodType === 'monthly' ? 'monthly' : 'weekly');

// The blocks a report of this period type has, in the template's order.
export const blocksFor = (template, periodType) => normalizeTemplate(template).blocks.filter((b) => b[periodFlag(periodType)]);

export const creativeCount = (template, periodType) => normalizeTemplate(template).creatives[periodFlag(periodType)];

// What a report remembers of the template: the blocks (key, title, whether the client sees it) and the metrics.
export function snapshotOf(template, periodType) {
  const t = normalizeTemplate(template);
  return { blocks: t.blocks.filter((b) => b[periodFlag(periodType)]).map((b) => ({ key: b.key, title: b.title, client: b.client })), metrics: t.metrics };
}

// The blocks to draw for a SAVED report: its own snapshot; a report made before templates existed has the three standard ones.
// A text that exists under a key the snapshot does not list is still shown (under its key), never lost.
export function reportBlocks(data) {
  const snap = Array.isArray(data?.template?.blocks) && data.template.blocks.length ? data.template.blocks : SYSTEM_BLOCKS.map((b) => ({ key: b.key, title: b.title, client: true }));
  const listed = new Set(snap.map((b) => b.key));
  const extra = Object.keys(data?.sections || {}).filter((k) => !listed.has(k) && String(data.sections[k] || '').trim()).map((k) => ({ key: k, title: k, client: false }));
  return [...snap.map((b) => ({ key: b.key, title: b.title, client: b.client !== false })), ...extra];
}

// The metric keys a table shows: the template's own list when there is one (only metrics that exist), otherwise the standard set.
// `known`: the keys that can be computed (built-in ones are always known; custom and extra ones come from the caller).
export function metricKeysOf(template, defaults, known = []) {
  const own = normalizeTemplate(template).metrics;
  if (!own) return defaults;
  const ok = new Set([...Object.keys(METRICS), ...known]);
  const keys = own.filter((k) => ok.has(k));
  return keys.length ? keys : defaults;
}
