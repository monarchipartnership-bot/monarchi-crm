// The creative studio of a campaign: the agents that turn ONE request of the client (requirements + materials) into a technical brief, ad
// texts and finished creatives for approval. They are ordinary framework agents (ag_agents, team 'campaign', scope_id = the campaign id) but
// they work per REQUEST (ag_creative_requests), not weekly:
//   client analyst ┐
//                  ├─> brief writer ─┬─> copywriter
//   competitor analyst ┘             └─> producer (Higgsfield) -> the person approves
// The chain is started by a request (api action `start_request`), every task carries its request_id.
import { STUDIO_PROMPTS } from './studioPrompts.js';

export const STUDIO_STAGES = [
  { key: 'in', label: 'Аналіз' },
  { key: 'brief', label: 'Технічне завдання' },
  { key: 'make', label: 'Виробництво' },
];

const text = (key, label, hint, rows = 4) => ({ key, label, type: 'textarea', rows, hint });

export const STUDIO_ROLES = [
  { role: 'studio_client_analyst', name: 'Аналітик клієнта', short: 'вимоги, сайт і поточні креативи', stage: 'in', row: 0, trigger: 'request',
    description: 'Розбирає вимоги запиту, читає сайт клієнта, дивиться поточні креативи в кабінеті (якщо вони є) і робить висновки для ТЗ.',
    fields: [text('sources', 'Сайт клієнта за замовчуванням', 'Якщо в запиті немає адреси сайту, агент візьме її звідси.', 2)] },
  { role: 'studio_competitor_analyst', name: 'Аналітик конкурентів', short: 'що роблять конкуренти у ніші', stage: 'in', row: 1, trigger: 'request',
    description: 'Вивчає конкурентів клієнта в тій самій ніші: пропозиції, обіцянки, візуальні підходи. Працює з їхніми сайтами й прикладами, які дав менеджер.',
    fields: [text('competitors', 'Конкуренти за замовчуванням', 'По одному на рядок: назва й сайт. Якщо в запиті конкурентів немає, агент візьме цей список.', 3)] },
  { role: 'studio_brief_writer', name: 'Автор ТЗ', short: 'технічне завдання на креативи', stage: 'brief', row: 0, trigger: 'request',
    description: 'З аналізів, вимог клієнта і наших правил складає технічне завдання: концепції креативів, формати, що брати з матеріалів клієнта, чи потрібен текст.',
    fields: [
      text('rules', 'Наші правила для креативів', 'Що ми завжди робимо: стиль, композиція, обовʼязкові елементи, тон.', 4),
      text('avoid', 'Чого не робимо', 'Що не можна показувати чи обіцяти в креативах.', 3),
      text('formats', 'Формати й обмеження', 'Які формати та розміри ми робимо. Наприклад: квадрат і сторіз, без відео.', 2),
    ] },
  { role: 'studio_copywriter', name: 'Копірайтер креативів', short: 'тексти до креативів', stage: 'make', row: 0, trigger: 'request',
    description: 'Пише тексти до концепцій із ТЗ, якщо вони потрібні: заголовок, основний текст, опис, заклик. Текст ніколи не вставляється в картинку.',
    fields: [text('tone', 'Тон і мови текстів', 'Наприклад: українською й англійською, прямий тон, без знижок у тексті.', 3)] },
  { role: 'studio_producer', name: 'Виробник креативів', short: 'готує запит у Higgsfield і збирає результат', stage: 'make', row: 1, trigger: 'request',
    description: 'Для кожної концепції й формату пише точний запит для Higgsfield (з матеріалами клієнта як референсами). Коли Higgsfield підключено, отримує готові картинки й виносить їх на затвердження.',
    fields: [text('style', 'Стиль зображень за замовчуванням', 'Світло, кольори, настрій, який ми любимо. Додається до кожного запиту.', 3)] },
];

export const STUDIO_ROLE_KEYS = new Set(STUDIO_ROLES.map((r) => r.role));
export const isStudioRole = (role) => STUDIO_ROLE_KEYS.has(role);
export const studioRoleDef = (role) => STUDIO_ROLES.find((r) => r.role === role) || null;

// from -> to. required = the downstream agent stops when the upstream one is switched off. The analysts are optional: the brief is written
// from whatever analysis exists. The producer cannot work without the brief.
export const STUDIO_LINKS = [
  { from: 'studio_client_analyst', to: 'studio_brief_writer', required: false },
  { from: 'studio_competitor_analyst', to: 'studio_brief_writer', required: false },
  { from: 'studio_brief_writer', to: 'studio_copywriter', required: false },
  { from: 'studio_brief_writer', to: 'studio_producer', required: true },
];

// The request form: what the manager fills in. `ratios` are the formats the producer makes (Higgsfield aspect ratios).
export const REQUEST_RATIOS = [
  { key: '1:1', label: 'Квадрат 1:1' },
  { key: '4:5', label: 'Вертикальний 4:5' },
  { key: '9:16', label: 'Сторіз 9:16' },
  { key: '16:9', label: 'Горизонтальний 16:9' },
];
export const REQUEST_LANGUAGES = { uk: 'Українська', en: 'English' };
export const TEXT_MODES = { auto: 'Агент вирішує', yes: 'Потрібні', no: 'Не потрібні' };
export const MATERIAL_KINDS = { logo: 'Логотип', product: 'Фото продукту', style: 'Приклад стилю', other: 'Інше' };
export const MAX_CONCEPTS = 6;

// A request as the form sends it, cleaned: only known keys, bounded sizes. Throws a message the person can read.
export function cleanRequest(input = {}) {
  const clip = (v, n) => String(v ?? '').trim().slice(0, n);
  const ratios = (Array.isArray(input.ratios) ? input.ratios : []).filter((r) => REQUEST_RATIOS.some((x) => x.key === r));
  const brief = {
    goal: clip(input.goal, 3000),
    product: clip(input.product, 1500),
    audience: clip(input.audience, 1500),
    message: clip(input.message, 1500),
    tone: clip(input.tone, 800),
    must: clip(input.must, 1500),
    avoid: clip(input.avoid, 1500),
    site: clip(input.site, 300),
    competitors: clip(input.competitors, 2000),
    examples: clip(input.examples, 3000),
    ratios: ratios.length ? ratios : ['1:1'],
    count: Math.min(MAX_CONCEPTS, Math.max(1, Math.round(Number(input.count)) || 3)),
    texts: TEXT_MODES[input.texts] ? input.texts : 'auto',
    language: REQUEST_LANGUAGES[input.language] ? input.language : 'uk',
  };
  if (!brief.goal) throw new Error('Опишіть, що потрібно від креативів.');
  const materials = (Array.isArray(input.materials) ? input.materials : []).slice(0, 12).map((m) => ({
    name: clip(m?.name, 160), url: clip(m?.url, 600), path: clip(m?.path, 400), kind: MATERIAL_KINDS[m?.kind] ? m.kind : 'other',
  })).filter((m) => m.name && m.url);
  return { title: clip(input.title, 120) || clip(brief.goal, 60), brief, materials };
}

// Makes sure the campaign has its studio agents, the links between them and a starting prompt for each. Only missing things are added.
// The studio agents are switched ON from the start: they have no schedule and do nothing until a request starts them.
export async function ensureStudioTeam(db, campaign, email = null) {
  const must = (r) => { if (r.error) throw r.error; return r.data; };
  const scope = String(campaign.id);
  const TEAM = 'campaign';
  let agents = must(await db.from('ag_agents').select('*').eq('team', TEAM).eq('scope_type', 'client').eq('scope_id', scope)) || [];
  const have = new Set(agents.map((a) => a.role));
  const missing = STUDIO_ROLES.filter((r) => !have.has(r.role));
  // Two pages may open the studio at the same moment (React development mode does): the unique key of ag_agents lets only one insert win,
  // the loser leaves the rest (links, prompts) to the winner.
  let lost = false;
  if (missing.length) {
    const ins = await db.from('ag_agents').insert(missing.map((r) => ({
      team: TEAM, scope_type: 'client', scope_id: scope, role: r.role, name: r.name, description: r.description, enabled: true,
      config: { trigger: r.trigger }, schedule: null, sort: 100 + STUDIO_ROLES.indexOf(r), updated_by: email,
    }))).select();
    if (ins.error) { if (ins.error.code === '23505') lost = true; else throw ins.error; }
    agents = must(await db.from('ag_agents').select('*').eq('team', TEAM).eq('scope_type', 'client').eq('scope_id', scope));
  }
  const mine = agents.filter((a) => isStudioRole(a.role));
  const byRole = new Map(mine.map((a) => [a.role, a]));
  const ids = mine.map((a) => a.id);
  let links = ids.length ? must(await db.from('ag_links').select('*').in('from_agent_id', ids)) || [] : [];
  const haveLink = new Set(links.map((l) => `${l.from_agent_id}>${l.to_agent_id}`));
  const newLinks = STUDIO_LINKS.map((l) => ({ from_agent_id: byRole.get(l.from)?.id, to_agent_id: byRole.get(l.to)?.id, required: l.required }))
    .filter((l) => l.from_agent_id && l.to_agent_id && !haveLink.has(`${l.from_agent_id}>${l.to_agent_id}`));
  if (newLinks.length && !lost) {
    const ins = await db.from('ag_links').insert(newLinks).select();
    if (ins.error && ins.error.code !== '23505') throw ins.error;
    links = must(await db.from('ag_links').select('*').in('from_agent_id', ids));
  }
  const prompts = ids.length ? must(await db.from('ag_prompts').select('agent_id').in('agent_id', ids)) || [] : [];
  const hasPrompt = new Set(prompts.map((p) => p.agent_id));
  const newPrompts = mine.filter((a) => !hasPrompt.has(a.id) && STUDIO_PROMPTS[a.role]).map((a) => ({ agent_id: a.id, name: 'Стартовий промт', body: STUDIO_PROMPTS[a.role], is_default: true, current_version: 1, note: 'Стартовий промт', created_by: email }));
  if (newPrompts.length && !lost) {
    const created = must(await db.from('ag_prompts').insert(newPrompts).select());
    must(await db.from('ag_prompt_versions').insert(created.map((p) => ({ prompt_id: p.id, version: 1, body: p.body, note: 'Стартовий промт', created_by: email }))));
  }
  return { agents: mine.sort((a, b) => a.sort - b.sort), links };
}
