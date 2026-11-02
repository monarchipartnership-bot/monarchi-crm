// «Швидке заповнення» of the project (spec 2026-11-02, section 4): the manager says or writes what he knows about the client in free words (typed or dictated),
// the model lays it out over the fields of the section «AI-агенти», and the screen shows «Зрозумів так» for a check. This file is pure: the prompt, the reading of
// the answer and the plan of what gets written (never over a value that is already there unless asked). The call to the model is in api/project-profile-extract.js.
import { INPUT_FIELDS, PROFILE_FIELDS } from './projectCreative.js';

// The fields the model may fill from words: what the manager tells (PROFILE_FIELDS), plus the audience and the competitors (that the research agents fill later),
// the rules of the client, the button and the link to Figma.
export const EXTRACT_KEYS = [...PROFILE_FIELDS.map((f) => f.key), 'audience', 'competitors'];
const LABEL = { ...Object.fromEntries([...PROFILE_FIELDS, ...INPUT_FIELDS].map((f) => [f.key, f.label])), restrictions: 'Обмеження клієнта', cta: 'Кнопка заклику до дії', figma: 'Макет Figma' };
export const labelOf = (key) => LABEL[key] || key;

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function buildExtractPrompt(text, language = 'uk') {
  const fields = [...PROFILE_FIELDS, ...INPUT_FIELDS.filter((f) => ['audience', 'competitors'].includes(f.key))].map((f) => `- "${f.key}": ${f.label}. ${f.hint}`).join('\n');
  const system = [
    'You fill in the card of an advertising agency\'s client from what the account manager said or wrote (it may be dictated: expect small errors, repetitions and mixed Ukrainian, Russian and English).',
    'Use ONLY what is in the text. Never invent facts, numbers, prices, discounts, URLs or names. If the text says nothing about a field, leave it out.',
    'Write each field in the language the manager used for it (keep the client\'s own words and numbers exactly); tidy it into short clear sentences or bullet-like lines, without adding anything.',
    'Fields of the card:',
    fields,
    '- "restrictions": what must NOT be shown or promised in the ads (forbidden words, claims, topics).',
    '- "cta": the call-to-action button. {"mode": "always" or "none", "text": "the button text, or empty"}. mode "none" only when the text says no button is needed.',
    'Links and files cannot be filled by voice: put every URL you find in "links" as {"url": "...", "about": "what it is, one short phrase"}; a Figma link also goes to "figma". If the manager mentions files, photos, logos or screenshots he will add (that cannot be dictated), list them in "needsFiles" as short phrases.',
    'Put the parts of the text that you could not place anywhere into "unplaced" (short quotes), so nothing is lost silently.',
    `The manager's main language is "${language}".`,
    'Answer with ONE JSON object and nothing else, no code fence: {"fields": {"about": "...", "offer": "..."}, "restrictions": "", "cta": {"mode": "always", "text": ""} or null, "figma": "", "links": [], "needsFiles": [], "unplaced": []}. Omit empty fields from "fields".',
  ].join('\n');
  return { system, user: `Text of the manager:\n"""\n${clip(text, 8000)}\n"""` };
}

const readJson = (raw) => {
  const t = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch {
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  }
};

// → { fields: { key: text }, restrictions, cta: { mode, text } | null, figma, links: [{ url, about }], needsFiles: [], unplaced: [] }. The links that the model missed are found in the
// original text, so a URL is never lost. Throws when the answer is not readable.
export function parseExtraction(raw, originalText = '') {
  const j = readJson(raw);
  if (!j || typeof j !== 'object') throw new Error('Не вдалося розібрати текст. Спробуйте сказати чи написати ще раз.');
  const fields = {};
  EXTRACT_KEYS.forEach((k) => { const v = clip(j.fields?.[k], 3000); if (v) fields[k] = v; });
  const links = [];
  const seen = new Set();
  const addLink = (url, about = '') => { const u = String(url || '').replace(/[.,;]+$/, ''); if (!/^https?:\/\//i.test(u) || seen.has(u)) return; seen.add(u); links.push({ url: u.slice(0, 400), about: clip(about, 120) }); };
  (Array.isArray(j.links) ? j.links : []).forEach((l) => addLink(l?.url ?? l, l?.about));
  (String(originalText).match(URL_RE) || []).forEach((u) => addLink(u));
  const figmaLink = links.find((l) => /figma\.com/i.test(l.url));
  const figma = /^https?:\/\//i.test(String(j.figma || '')) ? clip(j.figma, 300) : figmaLink ? figmaLink.url.slice(0, 300) : '';
  const cta = j.cta && typeof j.cta === 'object' ? { mode: j.cta.mode === 'none' ? 'none' : 'always', text: clip(j.cta.text, 40) } : null;
  const list = (v, n) => (Array.isArray(v) ? v.map((x) => clip(x, n)).filter(Boolean).slice(0, 12) : []);
  return { fields, restrictions: clip(j.restrictions, 2000), cta, figma, links: links.filter((l) => l.url !== figma), needsFiles: list(j.needsFiles, 120), unplaced: list(j.unplaced, 200) };
}

// → what would be written, and what is left for the step «Дозаповнення». existing = { fields: { key: text }, restrictions, cta_text, cta_mode, figma_url } (what the card holds now).
// A value that is already there is NOT replaced (it goes to `conflicts` for the person to decide); nothing empty is written.
export function planWrites(extracted, existing = {}) {
  const writes = [];
  const conflicts = [];
  Object.entries(extracted.fields || {}).forEach(([key, text]) => {
    const old = String(existing.fields?.[key] || '').trim();
    if (!old) writes.push({ key, text });
    else if (old !== text) conflicts.push({ key, label: labelOf(key), old, text });
  });
  const settings = {};
  if (extracted.restrictions) { const old = String(existing.restrictions || '').trim(); if (!old) settings.restrictions = extracted.restrictions; else if (old !== extracted.restrictions) conflicts.push({ key: 'restrictions', label: labelOf('restrictions'), old, text: extracted.restrictions }); }
  if (extracted.figma) { const old = String(existing.figma_url || '').trim(); if (!old) settings.figma_url = extracted.figma; else if (old !== extracted.figma) conflicts.push({ key: 'figma', label: labelOf('figma'), old, text: extracted.figma }); }
  if (extracted.cta && (extracted.cta.mode === 'none' || extracted.cta.text)) {
    const has = existing.cta_mode === 'none' || String(existing.cta_text || '').trim();
    if (!has) { settings.cta_mode = extracted.cta.mode; settings.cta_text = extracted.cta.mode === 'none' ? '' : extracted.cta.text; }
  }
  return { writes, settings, conflicts };
}
