// The steps of «Створити проєкт» (spec 2026-11-02, section 4) as pure code, so the screens only draw:
//   0 the choice of a project of the CRM that has a cabinet     1 the facts about the client (quick fill by words or by hand)
//   2 what cannot be said (links, files, examples) and what is still missing     3 «Створити операцію» or «Зробити пізніше»
import { filledFields, readinessByMode } from './agentRequirements.js';
import { MODES } from './campaignModes.js';
import { EXTRACT_KEYS as DRAFT_KEYS, planWrites } from './profileExtract.js';

export const WIZARD_STEPS = [
  { key: 'project', label: 'Проєкт' },
  { key: 'facts', label: 'Інформація' },
  { key: 'rest', label: 'Посилання й дозаповнення' },
  { key: 'campaign', label: 'Операція' },
];

// A cabinet of the CRM project is the condition to start (the agents read its numbers).
export const hasCabinet = (accounts = []) => accounts.some((a) => a.platform === 'meta' || a.platform === 'google');

// → what the card would look like after the planned writes (the same shape as the rows of project_creative), to count what is filled.
function afterWrites(settings, plan) {
  const inputs = { ...(settings?.inputs || {}) };
  plan.writes.forEach((w) => { inputs[w.key] = { body: w.text }; });
  return { ...settings, inputs, ...plan.settings, figma_url: plan.settings.figma_url ?? settings?.figma_url, restrictions: plan.settings.restrictions ?? settings?.restrictions, cta_mode: plan.settings.cta_mode ?? settings?.cta_mode, cta_text: plan.settings.cta_text ?? settings?.cta_text };
}

// → { plan, step2, blockers, recommended }: what step 1 writes, what goes to step 2 and what the agents still lack for any kind of campaign.
//   extracted: the reading of the words (profileExtract.parseExtraction) or null for the hand-filled form; settings: the row of project_creative; assets, accounts: as in filledFields.
export function wizardSummary({ extracted = null, settings = {}, assets = [], accounts = [] } = {}) {
  const existing = {
    fields: Object.fromEntries(Object.entries(settings.inputs || {}).filter(([, v]) => String(v?.body || '').trim()).map(([k, v]) => [k, v.body])),
    restrictions: settings.restrictions, cta_mode: settings.cta_mode, cta_text: settings.cta_text, figma_url: settings.figma_url,
  };
  const plan = extracted ? planWrites(extracted, existing) : { writes: [], settings: {}, conflicts: [] };
  const have = filledFields({ settings: afterWrites(settings, plan), assets, accounts });
  const platforms = [...new Set(accounts.map((a) => a.platform).filter((p) => p === 'meta' || p === 'google'))];
  const ready = readinessByMode(have, platforms);
  // the union over all the kinds of campaign: what is missing for at least one of them
  const union = (level) => {
    const map = new Map();
    Object.keys(MODES).forEach((m) => ready[m][level].forEach((x) => { if (!map.has(x.key)) map.set(x.key, { ...x, agents: [...x.agents] }); else x.agents.forEach((a) => { const t = map.get(x.key); if (!t.agents.includes(a)) t.agents.push(a); }); }));
    return [...map.values()];
  };
  const blockers = union('required');
  const recommended = union('recommended').filter((x) => !blockers.some((b) => b.key === x.key));
  // what cannot be said by voice: links, the files the manager mentioned, and the library when it is empty (a logo and a product photo help every creative)
  const step2 = {
    links: extracted?.links || [],
    needsFiles: extracted?.needsFiles || [],
    uploads: assets.length ? [] : ['Логотип', 'Фото продукту'],
    unplaced: extracted?.unplaced || [],
  };
  return { plan, step2, blockers, recommended, hasStep2: step2.links.length + step2.needsFiles.length + step2.uploads.length + step2.unplaced.length > 0 };
}

// ---- the screen «Зрозумів так» / the hand form of step 1: ONE editable draft for both ways of filling
export { DRAFT_KEYS };

// x: the model's reading (parseExtraction) or what the card holds now ({ fields, restrictions, cta_mode, cta_text, figma_url }) → the draft the form edits.
export function draftFrom(x = {}) {
  const fields = {};
  DRAFT_KEYS.forEach((k) => { fields[k] = String(x.fields?.[k] || ''); });
  const cta = x.cta || (x.cta_mode === 'none' ? { mode: 'none', text: '' } : x.cta_text ? { mode: 'always', text: x.cta_text } : null);
  return { fields, restrictions: String(x.restrictions || ''), figma: String(x.figma ?? x.figma_url ?? ''), ctaMode: cta?.mode === 'none' ? 'none' : 'always', ctaText: cta?.mode === 'none' ? '' : String(cta?.text || '') };
}

// the draft back into the shape planWrites()/saveExtracted() take (empty fields are left out; links and files come from the reading, they are not edited here)
export function extractedFromDraft(draft, meta = {}) {
  const fields = {};
  DRAFT_KEYS.forEach((k) => { const v = String(draft.fields?.[k] || '').trim(); if (v) fields[k] = v; });
  const cta = draft.ctaMode === 'none' ? { mode: 'none', text: '' } : String(draft.ctaText || '').trim() ? { mode: 'always', text: String(draft.ctaText).trim() } : null;
  return { fields, restrictions: String(draft.restrictions || '').trim(), cta, figma: String(draft.figma || '').trim(), links: meta.links || [], needsFiles: meta.needsFiles || [], unplaced: meta.unplaced || [] };
}
