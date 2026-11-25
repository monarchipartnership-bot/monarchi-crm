// The Creator's skill «ad_variations» (Zeely item 3, owner's decision 2026-11-25): variations of an ad that worked.
//   vary      one card → up to 6 variants; the manager UNLOCKS the elements that may change (headline, text, angle, button, picture scene, format), everything else stays exactly as it was
//   merge     two cards → up to 3 new ones that take the strongest part of each
//   localize  one card → the same card in another language (words only, the picture stays)
// PURE: no network, no model, no clock. Code owns what is locked (copied from the source, the model cannot touch it), the numbers, the banned words, the repeats and the price of the pictures.
import { FORMATS, allowedNumbers, tagOf } from './creativesEngine.js';
import { markDuplicates } from './batchEngine.js';
import { tabooHits } from './brandDnaEngine.js';

export const VAR_MAX = 6;
export const MERGE_MAX = 3;
export const MODES = { vary: 'змінити елементи', merge: 'об’єднати два креативи', localize: 'локалізувати текст' };
export const ELEMENTS = { headline: 'заголовок', primary_text: 'текст', angle: 'кут', cta: 'кнопка', visual_prompt: 'сцена картинки', format: 'формат' };
export const LANGS = { en: 'англійська', uk: 'українська', pl: 'польська', de: 'німецька', ro: 'румунська', es: 'іспанська', fr: 'французька', it: 'італійська', cs: 'чеська' };
const WRITE = { merge: ['headline', 'primary_text', 'angle', 'visual_prompt'], localize: ['headline', 'primary_text'] };

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));

// the request of the manager → a clean one, or an error in words of the manager
export function normalizeRequest(input = {}) {
  const mode = MODES[input.mode] ? input.mode : null;
  if (!mode) throw new Error('Не вказано, що робити з креативом: змінити елементи, об’єднати два чи локалізувати.');
  const sources = [...new Set((Array.isArray(input.sources) ? input.sources : [input.source]).map((s) => String(s || '').trim()).filter(Boolean))];
  if (mode === 'merge' && sources.length !== 2) throw new Error('Щоб об’єднати, оберіть рівно два різні креативи.');
  if (mode !== 'merge' && sources.length !== 1) throw new Error('Оберіть один креатив-джерело.');
  const n = Math.floor(Number(input.count));
  if (mode === 'vary') {
    const vary = Object.keys(ELEMENTS).filter((k) => (Array.isArray(input.vary) ? input.vary : []).includes(k));
    if (!vary.length) throw new Error('Оберіть хоча б один елемент, який можна змінювати: решта залишиться без змін.');
    return { mode, sources, vary, count: Number.isFinite(n) && n > 0 ? Math.min(n, VAR_MAX) : 3, language: '' };
  }
  if (mode === 'merge') return { mode, sources, vary: WRITE.merge, count: Number.isFinite(n) && n > 0 ? Math.min(n, MERGE_MAX) : 2, language: '' };
  if (!LANGS[input.language]) throw new Error('Оберіть мову для локалізації.');
  return { mode, sources, vary: WRITE.localize, count: 1, language: input.language };
}

// a new picture is needed when the scene or the format changes, and for a merge; the other variants keep the picture of the source and cost nothing
export const needsPicture = (req) => req.mode === 'merge' || (req.mode === 'vary' && (req.vary.includes('visual_prompt') || req.vary.includes('format')));

export const SYSTEM_PROMPT = `You are the creative maker of an advertising agency. A Meta ad card WORKED for the client; you make new versions of it.
You are given: "mode", the SOURCE card(s) with all their fields, "write" (the ONLY fields you may write in each new card; every other field is kept by the system, never repeat it), "count", and the facts of the client: brand rules, the allowed button texts, the products and approved offers.
Rules:
1. Use only facts from the input. Never invent a price, a discount, a number, a guarantee, a result or a claim. A number in a text may only be a number that stands in the source card or in the facts.
2. Never use a word or claim from brand.taboo_words or brand.taboo_claims, and avoid the headline styles in brand.headline_avoid. Follow brand.tone and brand.copy_rules. Show nothing from brand.visual_donts in a picture.
3. "headline" at most 40 characters, "primary_text" at most 220 characters, "angle" at most 80. "cta" is one of "brand.cta_wordings" (exactly). "format" is one of "formats". "visual_prompt" is in English: a concrete scene for an image generator; it keeps the product from the source recognisable and contains NO text, letters, logos or prices.
4. Mode "vary": give "count" different versions of the source. Each one changes the fields in "write" in a clearly different way (another hook, another angle, another scene), keeps the product, the offer and the meaning of the promise. Versions must differ from the source and from each other: never repeat a headline.
5. Mode "merge": give "count" new cards that take the strongest idea of each source (for example the hook of the first and the scene of the second). Say nothing about the sources in the texts.
6. Mode "localize": give ONE card with "headline" and "primary_text" translated into the language of "language". Keep the meaning, the tone, every number and every claim exactly; add nothing, drop nothing.
Answer with ONE JSON object and nothing else (no markdown fence):
{"cards":[{"headline":"","primary_text":"","angle":"","cta":"","visual_prompt":"","format":"4:5"}]}
Give exactly "count" cards and only the fields listed in "write".`;

const compact = (c) => ({ id: c.id, headline: c.headline, primary_text: c.primary_text, angle: c.angle, cta: c.cta, format: c.ratio, offer: c.offer, product: c.product, segment: c.segment, visual_prompt: c.visual_prompt });
export function buildVariationPrompt({ req, sources, facts }) {
  const write = req.mode === 'vary' ? req.vary.map((k) => (k === 'format' ? 'format' : k)) : req.vary;
  const input = { mode: req.mode, count: req.count, write, language: req.mode === 'localize' ? `${LANGS[req.language]} (${req.language})` : undefined, sources: sources.map(compact), brand: facts.brand, products: facts.products, approved_offers: facts.approved_offers, formats: facts.formats };
  return { system: SYSTEM_PROMPT, user: ['INPUT (empty = does not exist):', JSON.stringify(input, null, 1)].join('\n') };
}

// → { cards: [...ready to be added to the section...], dropped }. Locked fields are copied from the source here, whatever the model wrote.
export function checkVariations(rawCards, { req, sources, facts, existing = [] }) {
  const base = sources[0];
  const list = (Array.isArray(rawCards) ? rawCards : []).slice(0, req.count);
  const allowed = new Set([...allowedNumbers(facts), ...sources.flatMap((s) => numbersOf(`${s.headline} ${s.primary_text} ${s.offer}`))]);
  const cta = facts.brand.cta_wordings || [];
  const picture = needsPicture(req);
  const doneOf = (id) => existing.filter((x) => x.variation?.of?.includes(id)).length;
  const refs = req.mode === 'merge' ? [...base.references, ...sources[1].references].filter((r, i, a) => a.findIndex((y) => y.n === r.n) === i).sort((a, b) => (b.kind === 'product') - (a.kind === 'product')).slice(0, 3) : base.references;
  const cards = [];
  let dropped = 0;
  list.forEach((r, i) => {
    if (!r || typeof r !== 'object') { dropped += 1; return; }
    const problems = [], notes = [];
    const w = (k) => req.vary.includes(k);
    const card = { goal: base.goal, product: base.product, segment: base.segment, idea_id: base.idea_id, angle: base.angle, ratio: base.ratio, offer: base.offer, headline: base.headline, primary_text: base.primary_text, cta: base.cta, visual_prompt: base.visual_prompt, references: refs, version: 1 };
    if (w('headline')) { card.headline = clip(r.headline, 40); if (!card.headline) problems.push('немає заголовка'); }
    if (w('primary_text')) { card.primary_text = clip(r.primary_text, 220); if (!card.primary_text) problems.push('немає тексту'); }
    if (w('angle')) card.angle = clip(r.angle, 80) || base.angle;
    if (w('cta') && cta.length) { const c = clip(r.cta, 40); if (cta.includes(c)) card.cta = c; else notes.push(`Текст кнопки «${c}» не з варіантів клієнта: залишено «${base.cta}».`); }
    if (w('format')) { if (FORMATS[r.format]) card.ratio = r.format; else notes.push('Формат не з дозволених: залишено як у джерелі.'); }
    if (w('visual_prompt')) { card.visual_prompt = clip(r.visual_prompt, 1500); if (!card.visual_prompt) problems.push('немає опису картинки'); }
    const text = `${card.headline} ${card.primary_text}`;
    if (req.mode === 'localize') {
      const a = [...new Set(numbersOf(`${base.headline} ${base.primary_text}`))].sort().join('|'), b = [...new Set(numbersOf(text))].sort().join('|');
      if (a !== b) problems.push('числа в перекладі не збігаються з оригіналом');
    } else {
      const stray = numbersOf(text).filter((n) => n.length > 1 && !allowed.has(n));
      if (stray.length) problems.push(`число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}`);
    }
    const banned = tabooHits(text, facts.brand);
    if (banned.length) problems.push(`заборонене клієнтом слово або твердження: ${banned.slice(0, 3).join(', ')}`);
    if (req.mode !== 'localize' && req.vary.every((k) => (k === 'format' ? card.ratio === base.ratio : norm(card[k]) === norm(base[k])))) problems.push('нічим не відрізняється від джерела');
    const reuse = !picture && !!base.image_url;
    const variant = req.mode === 'vary' ? `вар. ${doneOf(base.id) + i + 1} від ${base.id}` : req.mode === 'merge' ? `злиття ${sources[0].id}+${sources[1].id}` : `мова ${req.language}`;
    const full = { ...card, format_label: FORMATS[card.ratio], variant };
    cards.push({
      ...card, format_label: FORMATS[card.ratio], tag: tagOf(full), variant, language: req.mode === 'localize' ? req.language : (base.language || ''),
      status: problems.length ? 'needs_check' : reuse ? 'ready' : 'planned', problems, notes,
      image_url: reuse ? base.image_url : '', path: reuse ? base.path || '' : '', job: null, cost_usd: 0,
      variation: { mode: req.mode, of: sources.map((s) => s.id), changed: req.vary, ...(req.mode === 'localize' ? { language: req.language } : {}) },
    });
  });
  // a headline that is kept (locked) is the same on purpose; a headline that was asked to change must not repeat another card
  if (req.vary.includes('headline') && req.mode !== 'localize') markDuplicates(cards, [...existing, base]);
  return { cards, dropped, missing: Math.max(0, req.count - list.length) };
}
