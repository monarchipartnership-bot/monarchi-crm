// The Creator's skill «first_creatives» (step A6.2; document, step 2, branch A): the part around the model call. PURE: no network, no model, no clock.
// For every GOAL that the manager wrote in the brief («ціль кожного креатива вказує менеджер») the agent makes a short card (завдання на креатив): the rest
// (for whom, which idea, which offer, which format) it takes from the dossier. Then the texts and a picture request. The code, not the model, checks and builds:
//   · the product must be one of the brief, the segment one of the audience, the idea one of the bank
//   · an OFFER may be used only if the client approved it («Оффер подається лише погоджений клієнтом»)
//   · the button text is one of the client's wordings (or none if the client wants no button)
//   · a number in a text must stand in the brief («Цифри тільки з даних»), else the card is marked and the manager sees why
//   · the references of the picture are only files of the client (product photos first), never addresses made up by the model
//   · the TAG of the creative (ціль · товар · для кого · кут · формат · оффер · версія) is built here from the checked fields, so the Media buyer can rely on it
import { inventoryOf } from './ideasEngine.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`]/g, '').replace(/\s+/g, ' ').trim();
const numbersOf = (s) => (String(s || '').match(/\d[\d.,]*\d|\d/g) || []).map((n) => n.replace(/[.,]$/, ''));

export const FORMATS = { '4:5': 'картинка 4:5', '9:16': 'картинка 9:16', '1:1': 'картинка 1:1' };
export const MAX_GOALS = 6;
export const DEFAULT_IMAGE_LIMIT_USD = 5; // used when the project has no cost cap of its own (the cap of the project is the limit of the whole project, owner 2026-11-19)

// the goals of the manager, as written in the brief sheet
export function goalsOf(brief) {
  return (brief?.content?.creative_goals || []).map((g) => ({ goal: clip(g?.goal, 200), product: clip(g?.product, 120) })).filter((g) => g.goal).slice(0, MAX_GOALS);
}

// the files the picture may be made from: the product photos first, then the logo and the style examples; the model names them by number
export function referencePool(materials) {
  const assets = (materials?.assets || []).filter((a) => /^https:\/\//i.test(a?.url || ''));
  const order = { product: 0, style: 1, creative: 2, logo: 3 };
  return assets.filter((a) => a.kind in order).sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 12).map((a, i) => ({ n: i + 1, kind: a.kind, name: clip(a.name, 60), url: a.url }));
}

export function gatherCreativeFacts({ brief, materials, ideas, audience, goals }) {
  const e = brief?.content?.economics || {};
  const inv = inventoryOf(materials);
  const cta = String(materials?.settings?.cta_mode || 'always') === 'none' ? [] : String(materials?.settings?.cta_text || '').split('\n').map((t) => clip(t, 40)).filter(Boolean).slice(0, 6);
  return {
    goals: goals.map((g, i) => ({ goal_index: i + 1, ...g })),
    products: (e.products || []).slice(0, 12).map((p) => ({ name: clip(p.name, 80), price: p.price ?? null })),
    approved_offers: (e.offers || []).filter((o) => o?.approved === true).map((o) => ({ name: clip(o.name, 120), pays: o.pays ?? null })),
    currency: e.currency || null,
    ideas: (ideas?.items || []).filter((x) => x.status === 'ok').slice(0, 14).map((x) => ({ id: x.id, hook: x.hook, angle: x.angle, format: x.format, segment: x.segment, offer: x.offer?.approved ? x.offer.name : null })),
    segments: (audience?.segments || []).map((s) => ({ name: s.name, who: s.who, message: s.message, status: s.status })),
    brand: { tone: inv.notes.tone, copy_rules: inv.notes.copy_rules, restrictions: inv.notes.restrictions, colors_and_fonts: inv.notes.brand, cta_wordings: cta },
    references: referencePool(materials).map((r) => ({ n: r.n, kind: r.kind, name: r.name })),
    formats: Object.keys(FORMATS),
  };
}

export const SYSTEM_PROMPT = `You are the creative maker of an advertising agency. For each GOAL given by the manager you prepare ONE creative card for a Meta ad: texts and a picture brief.
The goal says what we advertise and what we want to get. Everything else you take from the facts: the product (the goal's product, or the best fit from "products"), the segment of the audience ("segments"), the idea from the bank ("ideas": give its id, or leave empty and write your own angle), the offer, the format.
Rules:
1. Use ONLY facts from the input. Never invent a price, a discount, a number, a guarantee, a result or a claim about the product. A number in a text may only be a price or a number that stands in the input.
2. An OFFER (discount, gift, set) may be used only if it is in "approved_offers": give its exact name. Otherwise "offer" is an empty string and the texts mention no offer.
3. "cta" is one of "brand.cta_wordings" (exactly); if that list is empty, "cta" is empty.
4. "headline" at most 40 characters, "primary_text" at most 220 characters. Follow brand.tone, brand.copy_rules and brand.restrictions. Write them in Ukrainian unless the input says otherwise.
5. "format" is one of "formats": 4:5 for the feed, 9:16 for stories and reels, 1:1 as a fallback.
6. "visual_prompt" is in English: a concrete scene for an image generator. It must keep the product from the reference pictures recognisable, must NOT contain any text, letters, logos or prices in the image (the words are added separately), and respects brand.colors_and_fonts and brand.restrictions.
7. "references" are the numbers ("n") of the client's pictures from "references" to base the picture on: the product photos first (at least one), at most 3.
8. "angle" is the side from which the product is shown (gift, saving, guarantee, reviews...).
9. If "rework" is given, the manager or the client returned that card with a comment ("rework" is listed by goal_index, with the previous texts): change what the comment asks and keep the rest of the card as it was.
Answer with ONE JSON object and nothing else (no markdown fence):
{"cards":[{"goal_index":1,"product":"","segment":"","idea_id":"","angle":"","format":"4:5","offer":"","headline":"","primary_text":"","cta":"","visual_prompt":"","references":[1]}]}
Give exactly one card per goal.`;

export function buildCreativesPrompt({ facts, language = 'uk' }) {
  return { system: SYSTEM_PROMPT, user: ['FACTS (null or empty = does not exist):', JSON.stringify(facts, null, 1), '', `Write the texts in ${language === 'en' ? 'English' : 'Ukrainian'}.`].join('\n') };
}

export function parseCreativesAnswer(text) {
  const src = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('Модель відповіла не у форматі JSON: креативи не прочитано.');
  let o; try { o = JSON.parse(src.slice(a, b + 1)); } catch { throw new Error('Модель повернула пошкоджений JSON: креативи не прочитано.'); }
  if (!Array.isArray(o.cards)) throw new Error('У відповіді моделі немає списку креативів.');
  return o.cards;
}

// the tag of a creative: «ціль · товар · для кого · кут · формат · оффер · версія» (document, glossary). Built from CHECKED fields only.
export function tagOf(c) {
  return [clip(c.goal, 40), c.product || 'без товару', c.segment || 'усі', c.angle || '—', c.format_label, c.offer || 'без оффера', 'v' + (c.version || 1)].join(' · ');
}

// the numbers a text may carry: prices and numbers of the brief, of the manager's goal, of the approved offers, of the notes of the brand
function allowedNumbers(facts) {
  return new Set(numbersOf(norm(JSON.stringify({ g: facts.goals, p: facts.products, o: facts.approved_offers, b: facts.brand, i: facts.ideas }))));
}

// → [{ goal_index, goal, ..., status: 'planned' | 'needs_check', problems[], note[] , tag, request pieces }] one per goal; goals the model skipped are reported in `missing`
export function checkCards(rawCards, { facts, pool, version = 1 }) {
  const allowed = allowedNumbers(facts);
  const products = new Set(facts.products.map((p) => norm(p.name)));
  const segs = new Map((facts.segments || []).map((s) => [norm(s.name), s.name]));
  const ideas = new Map((facts.ideas || []).map((i) => [i.id, i]));
  const approved = new Map((facts.approved_offers || []).map((o) => [norm(o.name), o.name]));
  const cta = facts.brand.cta_wordings || [];
  const out = [], seen = new Set();
  for (const r of rawCards) {
    const gi = Number(r?.goal_index);
    const goal = facts.goals.find((g) => g.goal_index === gi);
    if (!goal || seen.has(gi)) continue;
    seen.add(gi);
    const notes = [], problems = [];
    // product: the manager's choice wins, then a valid one of the model, else none
    let product = goal.product && products.has(norm(goal.product)) ? goal.product : '';
    if (!product && r.product && products.has(norm(r.product))) product = facts.products.find((p) => norm(p.name) === norm(r.product)).name;
    if (!product && goal.product) notes.push(`Товару «${goal.product}» немає в брифі: креатив без товару.`);
    const segment = segs.get(norm(r.segment)) || '';
    if (r.segment && !segment) notes.push('Такого сегмента в розділі «Аудиторія» немає: креатив для всіх.');
    const idea = ideas.get(r.idea_id) || null;
    if (r.idea_id && !idea) notes.push('Ідеї з таким номером у банку немає: кут власний.');
    const angle = clip(r.angle, 80) || idea?.angle || '';
    const wantedOffer = clip(r.offer, 120);
    const offer = wantedOffer ? approved.get(norm(wantedOffer)) || '' : '';
    if (wantedOffer && !offer) notes.push(`Оффер «${wantedOffer}» не погоджений клієнтом: у креатив не взято.`);
    const ratio = FORMATS[r.format] ? r.format : '4:5';
    if (!FORMATS[r.format]) notes.push('Формат не з дозволених: взято 4:5.');
    const headline = clip(r.headline, 40), primary = clip(r.primary_text, 220);
    if (!headline || !primary) problems.push('немає заголовка або тексту');
    const stray = numbersOf(`${headline} ${primary}`).filter((n) => n.length > 1 && !allowed.has(n));
    if (stray.length) problems.push(`число без джерела: ${[...new Set(stray)].slice(0, 3).join(', ')}`);
    let button = clip(r.cta, 40);
    if (cta.length) { if (!cta.includes(button)) { if (button) notes.push(`Текст кнопки «${button}» не з варіантів клієнта: взято «${cta[0]}».`); button = cta[0]; } } else button = '';
    const prompt = clip(r.visual_prompt, 1500);
    if (!prompt) problems.push('немає опису картинки');
    // references: the model's numbers that exist in the pool; a product photo is always there (the first one), the model cannot make up an address
    const chosen = [...new Set((Array.isArray(r.references) ? r.references : []).map(Number))].map((n) => pool.find((p) => p.n === n)).filter(Boolean).slice(0, 3);
    const firstPhoto = pool.find((p) => p.kind === 'product');
    if (firstPhoto && !chosen.some((p) => p.kind === 'product')) chosen.unshift(firstPhoto);
    const refs = chosen.slice(0, 3);
    if (!refs.length) problems.push('немає жодної картинки клієнта для референсу');
    const format_label = FORMATS[ratio];
    const card = { goal_index: gi, goal: goal.goal, product, segment, idea_id: idea?.id || '', angle, ratio, format_label, offer, headline, primary_text: primary, cta: button, visual_prompt: prompt, references: refs.map((p) => ({ n: p.n, kind: p.kind, url: p.url })), version };
    out.push({ ...card, tag: tagOf(card), status: problems.length ? 'needs_check' : 'planned', problems, notes });
  }
  return { cards: out, missing: facts.goals.filter((g) => !seen.has(g.goal_index)).map((g) => g.goal) };
}

// ---------------------------------------------------------------- the picture: the request for Higgsfield from a checked card (pure; the generator is handed in)
export function imageRequestOf(card, hf) {
  return hf.buildImageRequest({ prompt: `${card.visual_prompt} No text, letters, logos or prices in the picture.`, ratio: card.ratio, references: card.references.map((r) => r.url) }, hf.profile());
}

const STATUS_LABEL = { planned: 'заплановано', producing: 'генерується', ready: 'готово', failed: 'не вдалося', needs_check: 'потрібна перевірка менеджера', text_only: 'лише тексти' };
export function renderCreativesText(items, { branch, note, spent, limit, open }) {
  const out = [branch === 'B' ? 'Креативи: матеріалів недостатньо, тому креативи ще не створюються.' : 'Креативи (готові): тексти й візуали з тегами.'];
  if (note) out.push(note);
  items.forEach((c, i) => {
    out.push('', `${i + 1}. ${c.tag} [${STATUS_LABEL[c.status] || c.status}]`, `   Ціль: ${c.goal}`, `   Заголовок: ${c.headline}`, `   Текст: ${c.primary_text}`, `   Кнопка: ${c.cta || 'без кнопки'}`, `   Картинка: ${c.image_url || '—'}`);
    (c.problems || []).forEach((p) => out.push(`   Увага: ${p}`));
    (c.notes || []).forEach((p) => out.push(`   Примітка: ${p}`));
  });
  if (items.length) out.push('', `Витрата на картинки: $${Number(spent || 0).toFixed(2)} з ліміту проєкту $${Number(limit || 0).toFixed(2)}.`);
  if (open?.length) { out.push('', 'Відкриті питання'); open.forEach((t) => out.push(`• ${t}`)); }
  return out.join('\n');
}
