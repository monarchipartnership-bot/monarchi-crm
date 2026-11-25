// The Creator's skill «batch_creatives» (Zeely item 2, owner's decision 2026-11-25): a BATCH of static ads for one product, as many as the image limit of the project allows (at most 20).
// PURE: no network, no model, no clock. Code owns the numbers: how many cards, which idea and which format each card gets, how many the limit can pay for, and the check for repeats.
// The model only writes the words and the picture brief of every card from the facts it is given (the same prompt and the same checks as the first creatives).
export const BATCH_MAX = 20;
export const BATCH_DEFAULT = 6;
const FORMAT_CYCLE = ['4:5', '9:16', '1:1']; // the feed, stories and reels, the square: the batch covers the placements, the first ones are the strongest
const norm = (s) => String(s || '').toLowerCase().replace(/[«»"“”„'’`!?.,:;]/g, '').replace(/\s+/g, ' ').trim();

export function clampCount(n) {
  const x = Math.floor(Number(n));
  return Number.isFinite(x) && x > 0 ? Math.min(x, BATCH_MAX) : BATCH_DEFAULT;
}

// how many cards the money allows: remaining = what is left of the limit after what the project already spent, perImage = the price of one picture. No generator: the texts cost nothing here.
export function affordableCount({ count, remaining, perImage }) {
  if (perImage == null || !(perImage > 0)) return { count, limitedBy: null };
  const can = Math.max(0, Math.floor((remaining + 1e-9) / perImage));
  return can >= count ? { count, limitedBy: null } : { count: can, limitedBy: 'limit', can };
}

// the goals of the batch: a name that is unique inside the product, an idea of the bank for every card (ideas not yet used for this product come first, then the rest again),
// a format by the cycle. → [{ goal, product, assigned_idea, format_hint }]
export function buildBatchGoals({ product, count, ideas = [], existing = [] }) {
  const mine = existing.filter((x) => norm(x.product) === norm(product));
  const used = new Set(mine.map((x) => x.idea_id).filter(Boolean));
  const fresh = ideas.filter((i) => !used.has(i.id)), stale = ideas.filter((i) => used.has(i.id));
  const order = [...fresh, ...stale];
  const base = existing.filter((x) => /^Пакет «/.test(x.goal || '') && norm(x.product) === norm(product)).length;
  const startFormat = base % FORMAT_CYCLE.length;
  return Array.from({ length: count }, (_, i) => ({
    goal: `Пакет «${product}» №${base + i + 1}`, product,
    assigned_idea: order.length ? order[i % order.length].id : '',
    format_hint: FORMAT_CYCLE[(startFormat + i) % FORMAT_CYCLE.length],
  }));
}

// a card that repeats the headline or the text of another card (of this batch or of the cards that exist) is sent to the manager, not thrown away
export function markDuplicates(cards, existing = []) {
  const seen = new Map();
  existing.forEach((x) => { if (x.headline) seen.set(norm(x.headline), x.tag || x.id); });
  for (const c of cards) {
    const key = norm(c.headline);
    if (key && seen.has(key)) { c.problems = [...(c.problems || []), `заголовок повторює інший креатив: «${seen.get(key)}»`]; c.status = 'needs_check'; } else if (key) seen.set(key, c.tag);
  }
  return cards;
}
