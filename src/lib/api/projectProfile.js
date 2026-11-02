import { authedPost } from '../adAccounts';
import { planWrites } from '../agents/profileExtract';
import { fetchProjectCreative, saveInput, saveSettings } from './projectCreative';

// «Швидке заповнення»: the free words of the manager → fields of the card of the project (section «AI-агенти»). The model only reads the words; nothing is saved until
// the person has seen «Зрозумів так» and agreed.
export async function extractProfile(text, language = 'uk') {
  const json = await authedPost('/api/project-profile-extract', { text, language });
  return json.extracted;
}

// What the card holds now, in the shape planWrites() compares with.
export async function currentProfile(projectId) {
  const { settings } = await fetchProjectCreative(projectId);
  const fields = {};
  Object.entries(settings.inputs || {}).forEach(([k, v]) => { if (String(v?.body || '').trim()) fields[k] = v.body; });
  return { fields, restrictions: settings.restrictions, cta_mode: settings.cta_mode, cta_text: settings.cta_text, figma_url: settings.figma_url };
}

// Saves what was agreed: the fields one by one (as «введено вручну», with the author and the time) and the rules of the client. `accept` = the keys of the conflicts the
// person chose to replace. → { saved: [keys] }.
export async function saveExtracted(projectId, extracted, { email = null, accept = [] } = {}) {
  const existing = await currentProfile(projectId);
  const plan = planWrites(extracted, existing);
  const saved = [];
  for (const w of plan.writes) { await saveInput(projectId, w.key, w.text, email); saved.push(w.key); }
  const settings = { ...plan.settings };
  for (const c of plan.conflicts) {
    if (!accept.includes(c.key)) continue;
    if (c.key === 'restrictions') settings.restrictions = c.text;
    else if (c.key === 'figma') settings.figma_url = c.text;
    else { await saveInput(projectId, c.key, c.text, email); saved.push(c.key); }
  }
  if (Object.keys(settings).length) {
    await saveSettings(projectId, { figma_url: existing.figma_url, cta_mode: existing.cta_mode, cta_text: existing.cta_text, restrictions: existing.restrictions, ...settings }, email);
    Object.keys(settings).forEach((k) => saved.push(k === 'figma_url' ? 'figma' : k));
  }
  return { saved, conflicts: plan.conflicts.filter((c) => !accept.includes(c.key)) };
}
