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
  { key: 'tracking', label: 'Проблеми з трекінгом', agent: 'Агент контролю трекінгу клієнта', hint: 'Чи можна довіряти цифрам кабінету.' },
];
export const INPUT_KEYS = INPUT_FIELDS.map((f) => f.key);

// What the manager tells about the client here (the section «AI-агенти» of the project card): nobody else delivers it. Stored in the same `inputs` as the data of
// the agents (key -> { body, source: 'manual', by, filled_at }), so the age of a value is known too. Which agent needs which field: lib/agents/agentRequirements.js.
export const PROFILE_FIELDS = [
  { key: 'about', label: 'Опис бізнесу', hint: 'Чим займається клієнт, що продає, де працює, коротка історія й сайт.' },
  { key: 'offer', label: 'Оффер і відмінності', hint: 'Головна пропозиція, чим клієнт відрізняється від конкурентів, акції й умови (лише те, що точно є).' },
  { key: 'tone', label: 'Тон і стиль бренду', hint: 'Як бренд говорить: тепло чи стримано, на «ви» чи на «ти», слова, яких уникати.' },
  { key: 'brand', label: 'Бренд: кольори й шрифти', hint: 'Основні кольори (коди), шрифти, правила використання логотипу.' },
  { key: 'markets', label: 'Ринки й мови', hint: 'У яких країнах рекламуємось і якою мовою пишемо тексти для клієнта: обираються зі списків.' },
  { key: 'seasonality', label: 'Сезонність і акції', hint: 'Коли найбільший попит, які розпродажі й дати плануються.' },
  { key: 'goals', label: 'Цілі та KPI', hint: 'Наприклад: 200 лідів на місяць за CPL до $15, або ROAS від 3.' },
  { key: 'budget', label: 'Бюджет', hint: 'Діапазон на місяць загалом і по каналах.' },
  { key: 'examples', label: 'Посилання на готові креативи', hint: 'Якщо креативи не можна завантажити файлами: посилання на них або на рекламу, яка подобається чи ні.' },
  { key: 'competitor_sites', label: 'Сайти конкурентів', hint: 'Адреси сайтів і сторінок конкурентів, по одній у рядку: їх читає агент дослідження конкурентів.' },
  { key: 'competitor_notes', label: 'Що знаємо про конкурентів', hint: 'Хто головні конкуренти, чим сильні й слабкі, що подобається чи ні в їхній рекламі.' },
  { key: 'copy_rules', label: 'Побажання до текстів на креативах', hint: 'Що має бути в заголовку й додатковому тексті: слоган, акція, дисклеймер; де який текст доречний (наприклад, у сторіз коротше, у банері з ціною).' },
  { key: 'extra_info', label: 'Додаткова інформація', hint: 'Усе інше, що агентам варто знати про бренд, матеріали й побажання клієнта.' },
];
export const PROFILE_KEYS = PROFILE_FIELDS.map((f) => f.key);
export const ALL_INPUT_KEYS = [...INPUT_KEYS, ...PROFILE_KEYS];
export const FRESH_DAYS = 14; // older than this: «Застарів»

export const ASSET_KINDS = { logo: 'Логотип', product: 'Фото продукту', style: 'Приклад стилю', creative: 'Готовий креатив', other: 'Інше' };
// The files of a client by kind, as the card shows them: one place to upload for each kind (owner, 2026-11-11).
export const ASSET_GROUPS = [
  { kind: 'logo', title: 'Логотип', hint: 'Файл логотипа, найкраще PNG з прозорим фоном.' },
  { kind: 'product', title: 'Фото продукту', hint: 'Товар чи послуга клієнта: агенти беруть ці фото як референс для картинок.' },
  { kind: 'style', title: 'Приклади стилю', hint: 'Картинки, що показують бажаний вигляд: кольори, настрій, композицію.' },
  { kind: 'creative', title: 'Приклади готових креативів', hint: 'Реклама клієнта, яка вже працювала або подобається: приклад для аналізу й натхнення.' },
  { kind: 'other', title: 'Інше', hint: 'Усе, що не підходить до розділів вище.' },
];
export const CTA_MODES = { always: 'Потрібна', none: 'Не потрібна' };
// The button on a creative («Shop now», «Купити»): a client may have SEVERAL wordings, the agent takes the one that fits each creative. They are kept in one text
// (project_creative.cta_text), one per line. → the list (each at most 40 characters, at most six)
export const CTA_MAX_VARIANTS = 6;
// → the new text after a wording is added (no doubles, at most CTA_MAX_VARIANTS) or removed; throws a readable Error
export function addCtaVariant(text, raw) {
  const v = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!v) throw new Error('Напишіть текст кнопки.');
  if (v.length > 40) throw new Error('Текст кнопки має бути до 40 символів.');
  const list = ctaVariants(text);
  if (list.some((x) => x.toLowerCase() === v.toLowerCase())) throw new Error('Такий варіант уже є.');
  if (list.length >= CTA_MAX_VARIANTS) throw new Error(`Варіантів може бути до ${CTA_MAX_VARIANTS}: приберіть зайвий.`);
  return [...list, v].join('\n');
}
export const removeCtaVariant = (text, v) => ctaVariants(text).filter((x) => x !== v).join('\n');
export const ctaVariants = (text) => String(text || '').split(/\r?\n|\s*\|\s*/).map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, CTA_MAX_VARIANTS);

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
    cta_text: ctaVariants(input.cta_text).join('\n'),
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

// ---- «Інформація по проєкту» (owner, 2026-11-11): the same fields sorted into the sections a manager thinks in. `agent: true` = the field is meant to be
// filled by an agent of another department (it can be filled by hand meanwhile) and is marked on the screen.
export const INFO_SECTIONS = {
  client: ['tone', 'markets', 'audience'],
  business: ['about', 'offer', 'goals', 'budget', 'seasonality', 'business', 'strategy', 'cabinet', 'tracking'],
  brand: ['examples', 'brand', 'copy_rules', 'extra_info'], // «Бренд і матеріали клієнта»: with the files, the Figma link, the restrictions and the button (kept as settings of the project)
  competitors: ['competitor_notes', 'competitors'], // «Сайти конкурентів» has its own editor of links in that section
};
const FIELD_BY_KEY = new Map([...PROFILE_FIELDS.map((f) => [f.key, { ...f, agent: null }]), ...INPUT_FIELDS.map((f) => [f.key, f])]);
// → the fields of a section in its order: [{ key, label, hint, agent: name | null }] (the manual ones first, then the ones the agents fill)
export function sectionFields(section) {
  const list = (INFO_SECTIONS[section] || []).map((k) => FIELD_BY_KEY.get(k)).filter(Boolean);
  return [...list.filter((f) => !f.agent), ...list.filter((f) => f.agent)];
}

// the list of links kept as text, one per line («Сайти конкурентів»)
export const parseLinks = (text) => String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
// → the address as it is stored (https:// is added to a bare domain); throws a readable Error for something that is not an address
export function cleanLink(raw) {
  const v = String(raw || '').trim();
  if (!v) throw new Error('Вставте адресу сайту конкурента.');
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let host = '';
  try { host = new URL(url).hostname; } catch { host = ''; }
  if (!/^[^\s.]+(\.[^\s.]+)+$/.test(host)) throw new Error('Це не схоже на адресу сайту. Приклад: https://competitor.com');
  return url.slice(0, 300);
}
// → the new text of the field after a link is added (no doubles) or removed
export function addLink(text, raw) {
  const url = cleanLink(raw);
  const list = parseLinks(text);
  if (list.some((x) => x.toLowerCase().replace(/\/+$/, '') === url.toLowerCase().replace(/\/+$/, ''))) throw new Error('Цей сайт уже є у списку.');
  return [...list, url].join('\n');
}
export const removeLink = (text, url) => parseLinks(text).filter((x) => x !== url).join('\n');
