// What the agents ask (owner, 2026-11-12): at the end of its work every agent may add «що менеджеру перевірити». Several agents often say the same, and none of it is a task the person
// must do: it is information. This file merges the notes of the steps of ONE task into a short list (one entry per theme), so the card shows 2 lines instead of 6 messages, each with
// what the person can do about it. Pure code: the cabinet (lib/agents/projectCockpit.js), the card and the tests use it.

// where a theme is filled in the card of the project (lib/agents/teams.js whereToFill sections)
export const NOTE_TOPICS = {
  materials: { label: 'Матеріали клієнта', fill: 'business', fillLabel: 'Додати в картці' },
  cta: { label: 'Кнопка CTA', fill: 'business', fillLabel: 'Налаштувати в картці' },
  other: { label: 'Інше', fill: null, fillLabel: '' },
};

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
export const topicOf = (text) => {
  const t = String(text || '').toLowerCase();
  if (/фото|матеріал|логотип|лого\b|референс|бренд-?бук|brandbook|кольор|продукт|товар/.test(t)) return 'materials';
  if (/(?<![\p{L}])[cс][tт][aа](?![\p{L}])|кнопк/u.test(t)) return 'cta'; // the agents sometimes write «СТА» with cyrillic look-alike letters
  return 'other';
};
// a small stable id for a text, so the same note keeps its id between two reads
const hash = (text) => { let h = 5381; const s = String(text || ''); for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// steps: [{ label, points: ['…'] }] in the order of the chain; → [{ id, topic, label, text, agents: [labels], fill, fillLabel }]
// opts.skipMaterials: the card already says «немає фото товару» as its own message, so the same theme is not told twice
export function mergeNotes(steps = [], requestId, { skipMaterials = false } = {}) {
  const groups = new Map();
  steps.forEach((s) => (s.points || []).forEach((raw) => {
    const text = clip(raw, 400);
    if (text.length < 8) return;
    const topic = topicOf(text);
    if (topic === 'materials' && skipMaterials) return;
    const key = topic === 'other' ? `other:${hash(text.toLowerCase().replace(/\s+/g, ' '))}` : topic;
    const g = groups.get(key) || { key, topic, texts: [], agents: [] };
    g.texts.push(text);
    if (!g.agents.includes(s.label)) g.agents.push(s.label);
    groups.set(key, g);
  }));
  return [...groups.values()].map((g) => {
    const text = g.texts.reduce((a, b) => (b.length < a.length ? b : a)); // the shortest wording says it most plainly
    const t = NOTE_TOPICS[g.topic];
    return { id: `note:${requestId}:${g.topic === 'other' ? hash(text) : g.topic}`, topic: g.topic, label: t.label, text, agents: g.agents, fill: t.fill, fillLabel: t.fillLabel };
  });
}
