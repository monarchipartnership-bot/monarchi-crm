// What the creative department knows about a client, kept on the project (tables project_creative and project_creative_assets, migration
// 20261042). Pure code: the project page, the request form, the strategist on the server and the tests all use the same rules.

// The data other departments' agents deliver for the strategist. The agents are not built yet: the fields exist, say WHO fills each of them, and
// can be filled by hand meanwhile. An agent that gets built writes project_creative.inputs[key] = { body, source: 'agent', by, filled_at }.
export const INPUT_FIELDS = [
  { key: 'business', label: 'Дослідження бізнесу', agent: 'Агент дослідження бізнесу', hint: 'Що продає клієнт, кому, чим відрізняється.' },
  { key: 'competitors', label: 'Конкуренти', agent: 'Агент дослідження конкурентів', hint: 'Хто конкуренти, як вони себе подають, у чому сильні й слабкі.' },
  { key: 'audience', label: 'Аудиторія', agent: 'Агент дослідження аудиторії', hint: 'Хто купує, чому, що його зупиняє.' },
  { key: 'strategy', label: 'Стратегія кампанії', agent: 'Маркетинговий стратег', hint: 'Позиціонування й ключові меседжі кампанії.' },
  { key: 'cabinet', label: 'Результати кабінету', agent: 'Аналітик Meta Ads, Аналітик Google Ads', hint: 'Витрати, CPA, ROAS за кампаніями за останній період.' },
  { key: 'tracking', label: 'Проблеми з трекінгом', agent: 'Агент контролю трекінгу та цілісності даних', hint: 'Чи можна довіряти цифрам кабінету.' },
];
export const INPUT_KEYS = INPUT_FIELDS.map((f) => f.key);
export const FRESH_DAYS = 14; // older than this: «Застарів»

export const ASSET_KINDS = { logo: 'Логотип', product: 'Фото продукту', style: 'Приклад стилю', other: 'Інше' };
export const CTA_MODES = { always: 'Завжди', none: 'Не потрібна (естетика)' };

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// 'wait' = nothing yet, 'ok' = filled and fresh, 'old' = filled more than FRESH_DAYS ago.
export function inputState(item, now = new Date()) {
  if (!item || !String(item.body || '').trim()) return { state: 'wait', days: null };
  const t = item.filled_at ? new Date(item.filled_at).getTime() : NaN;
  if (Number.isNaN(t)) return { state: 'ok', days: null };
  const days = Math.max(0, Math.round((now.getTime() - t) / 86400000));
  return { state: days > FRESH_DAYS ? 'old' : 'ok', days };
}

// What a person typed into a field → the stored item.
export function manualInput(body, by = null, now = new Date()) {
  const text = clip(body, 8000);
  return text ? { body: text, source: 'manual', by: by || null, filled_at: now.toISOString() } : null;
}

export function cleanSettings(input = {}) {
  const url = clip(input.figma_url, 300);
  if (url && !/^https?:\/\//i.test(url)) throw new Error('Посилання на Figma має починатися з https://');
  return {
    figma_url: url,
    cta_mode: CTA_MODES[input.cta_mode] ? input.cta_mode : 'always',
    cta_text: clip(input.cta_text, 40),
    restrictions: clip(input.restrictions, 2000),
  };
}

// The formats of the ad platforms of a campaign: the request form starts with them (the manager can change them).
// Meta: feed 4:5 and stories/reels 9:16. Google: the sizes are still to be checked against Google's documentation, square and landscape for now.
export const PLATFORM_RATIOS = { meta: ['4:5', '9:16'], google: ['1:1', '16:9'], tiktok: ['9:16'] };
export function defaultRatios(platforms = []) {
  const out = [];
  (Array.isArray(platforms) ? platforms : []).forEach((p) => (PLATFORM_RATIOS[p] || []).forEach((r) => { if (!out.includes(r)) out.push(r); }));
  return out.length ? out : ['1:1'];
}
