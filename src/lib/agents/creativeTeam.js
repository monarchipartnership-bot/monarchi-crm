// The creative department: six agents, each ONE worker with a queue of clients (docs/agent-model-spec.md). They are ordinary framework agents
// (ag_agents, team 'creative', scope internal), the client is attached to an agent by a link row (ag_agent_clients: on/off, mode, priority,
// the client's own settings). The chain of ONE request (ag_creative_requests):
//   analyst (weekly, per client) ──> strategist ──> brief ──┬─> copywriter ─┐
//                                                           └─> maker ──────┴─> quality ──> the person approves
// A request starts the strategist; every finished task starts the agents below it for the same client and request.
import { CREATIVE_PROMPTS } from './creativePrompts.js';

export const CREATIVE_TEAM = 'creative';

export const CREATIVE_STAGES = [
  { key: 'data', label: 'Дані' },
  { key: 'plan', label: 'План' },
  { key: 'brief', label: 'Технічне завдання' },
  { key: 'make', label: 'Виробництво' },
  { key: 'check', label: 'Перевірка' },
];

const text = (key, label, hint, rows = 4) => ({ key, label, type: 'textarea', rows, hint });

// trigger: 'request' = works on the requests of the clients; 'schedule' = weekly, once per client.
// fields: the department-wide settings of the agent (agent.config); clientFields: what is asked per client (ag_agent_clients.config).
export const CREATIVE_ROLES = [
  { role: 'creative_analyst', name: 'Агент аналітик креативів', short: 'які креативи працюють', stage: 'data', row: 0, trigger: 'schedule', schedule: { weekday: 1, time: '09:15' },
    description: 'Раз на тиждень по кожному клієнту зв’язує креативи з результатами, шукає закономірності й віддає висновки Агенту креативний стратег.',
    fields: [], clientFields: [] },
  { role: 'creative_strategy', name: 'Агент креативний стратег', short: 'план по клієнту, до 3 напрямків', stage: 'plan', row: 0, trigger: 'request', entry: true,
    description: 'Керівник відділу: з запиту менеджера, картки проєкту, досліджень і аналізу креативів складає план (до трьох напрямків) і ставить задачу Агенту по ТЗ.',
    fields: [text('rules', 'Правила відділу креативів', 'Що ми завжди враховуємо в планах: підхід, пріоритети, що вважаємо успіхом.', 4)],
    clientFields: [text('kpi', 'Цілі й KPI клієнта', 'Наприклад: CPA до $12, ROAS від 3.', 3), text('limits', 'Обмеження клієнта', 'Що не можна показувати чи обіцяти.', 3), text('budget', 'Бюджет на креативи', 'Скільки можна витратити на цей цикл.', 2)] },
  { role: 'creative_brief', name: 'Агент по ТЗ', short: 'технічне завдання на креативи й тексти', stage: 'brief', row: 0, trigger: 'request',
    description: 'З плану стратега складає технічні завдання: для Агента креативщик (картинка, формати, референси) і для Агента копірайтер (що писати), якщо текст потрібен.',
    fields: [text('rules', 'Наші правила для креативів', 'Стиль, композиція, обовʼязкові елементи, тон.', 4), text('avoid', 'Чого не робимо', 'Що не можна показувати чи обіцяти в креативах.', 3), text('formats', 'Формати й обмеження', 'Які формати та розміри ми робимо.', 2)],
    clientFields: [] },
  { role: 'creative_copywriter', name: 'Агент копірайтер', short: 'тексти до креативів', stage: 'make', row: 0, trigger: 'request',
    description: 'Пише рекламні тексти за технічним завданням: заголовок, основний текст, опис, заклик. Текст ніколи не вставляється в картинку.',
    fields: [text('tone', 'Тон і мови текстів', 'Наприклад: українською й англійською, прямий тон, без знижок у тексті.', 3)], clientFields: [] },
  { role: 'creative_maker', name: 'Агент креативщик', short: 'запит у Higgsfield і готові картинки', stage: 'make', row: 1, trigger: 'request',
    description: 'За технічним завданням готує запит у Higgsfield (з матеріалами клієнта як референсами), отримує статичні креативи й передає їх на перевірку.',
    fields: [text('style', 'Стиль зображень за замовчуванням', 'Світло, кольори, настрій, який ми любимо. Додається до кожного запиту.', 3)], clientFields: [] },
  { role: 'creative_quality', name: 'Агент перевірки якості', short: 'перевірка перед менеджером', stage: 'check', row: 0, trigger: 'request',
    description: 'Перевіряє роботу Агента копірайтер і Агента креативщик, шукає очевидні помилки й повертає на переробку; готове віддає менеджеру.',
    fields: [], clientFields: [] },
];

export const CREATIVE_ROLE_KEYS = new Set(CREATIVE_ROLES.map((r) => r.role));
export const isCreativeRole = (role) => CREATIVE_ROLE_KEYS.has(role);
export const creativeRoleDef = (role) => CREATIVE_ROLES.find((r) => r.role === role) || null;
export const REQUEST_ENTRY_ROLE = CREATIVE_ROLES.find((r) => r.entry).role;

// from -> to. required = the downstream agent stops when the upstream one is switched off. The analyst feeds the strategist but never stops it;
// the maker cannot work without the brief, and the checker needs the maker.
export const CREATIVE_LINKS = [
  { from: 'creative_analyst', to: 'creative_strategy', required: false },
  { from: 'creative_strategy', to: 'creative_brief', required: true },
  { from: 'creative_brief', to: 'creative_copywriter', required: false },
  { from: 'creative_brief', to: 'creative_maker', required: true },
  { from: 'creative_copywriter', to: 'creative_quality', required: false },
  { from: 'creative_maker', to: 'creative_quality', required: false },
];

// The agents that take part in a request go by the 'request' trigger.
export const requestRoles = () => CREATIVE_ROLES.filter((r) => r.trigger === 'request').map((r) => r.role);

// The request form: what the manager fills in. `ratios` are the formats the maker makes (Higgsfield aspect ratios).
export const REQUEST_RATIOS = [
  { key: '1:1', label: 'Квадрат 1:1' },
  { key: '4:5', label: 'Вертикальний 4:5' },
  { key: '9:16', label: 'Сторіз 9:16' },
  { key: '16:9', label: 'Горизонтальний 16:9' },
];
export const REQUEST_LANGUAGES = { uk: 'Українська', en: 'English' };
export const TEXT_MODES = { auto: 'Агент вирішує', yes: 'Потрібні', no: 'Не потрібні' };
export const MATERIAL_KINDS = { logo: 'Логотип', product: 'Фото продукту', style: 'Приклад стилю', other: 'Інше' };
export const MAX_CONCEPTS = 3; // the strategist makes at most three directions, the brief one concept per direction

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
    count: Math.min(MAX_CONCEPTS, Math.max(1, Math.round(Number(input.count)) || MAX_CONCEPTS)),
    texts: TEXT_MODES[input.texts] ? input.texts : 'auto',
    language: REQUEST_LANGUAGES[input.language] ? input.language : 'uk',
  };
  if (!brief.goal) throw new Error('Опишіть, що потрібно від креативів.');
  const materials = (Array.isArray(input.materials) ? input.materials : []).slice(0, 12).map((m) => ({
    name: clip(m?.name, 160), url: clip(m?.url, 600), path: clip(m?.path, 400), kind: MATERIAL_KINDS[m?.kind] ? m.kind : 'other',
  })).filter((m) => m.name && m.url);
  return { title: clip(input.title, 120) || clip(brief.goal, 60), brief, materials };
}

const must = (r) => { if (r.error) throw r.error; return r.data; };
const dup = (r) => r.error && r.error.code === '23505';

// The department itself: one agent per role, the links between them and a starting prompt for each. Only missing things are added; an agent
// renamed in the code gets its new name. Two pages may call this at the same moment (React development mode does): the unique keys let one
// insert win and the loser leaves the rest to the winner.
export async function ensureCreativeDepartment(db, email = null) {
  let agents = must(await db.from('ag_agents').select('*').eq('team', CREATIVE_TEAM).eq('scope_type', 'internal').eq('scope_id', '')) || [];
  const have = new Set(agents.map((a) => a.role));
  const missing = CREATIVE_ROLES.filter((r) => !have.has(r.role));
  let lost = false;
  if (missing.length) {
    const ins = await db.from('ag_agents').insert(missing.map((r) => ({
      team: CREATIVE_TEAM, scope_type: 'internal', scope_id: '', role: r.role, name: r.name, description: r.description, enabled: true,
      config: { trigger: r.trigger }, schedule: r.schedule || null, sort: 200 + CREATIVE_ROLES.indexOf(r), updated_by: email,
    }))).select();
    if (ins.error) { if (dup(ins)) lost = true; else throw ins.error; }
    agents = must(await db.from('ag_agents').select('*').eq('team', CREATIVE_TEAM).eq('scope_type', 'internal').eq('scope_id', ''));
  }
  for (const a of agents) {
    const def = creativeRoleDef(a.role);
    if (def && a.name !== def.name) { await db.from('ag_agents').update({ name: def.name }).eq('id', a.id); a.name = def.name; }
  }
  const byRole = new Map(agents.map((a) => [a.role, a]));
  const ids = agents.map((a) => a.id);
  let links = ids.length ? must(await db.from('ag_links').select('*').in('from_agent_id', ids)) || [] : [];
  const haveLink = new Set(links.map((l) => `${l.from_agent_id}>${l.to_agent_id}`));
  const newLinks = CREATIVE_LINKS.map((l) => ({ from_agent_id: byRole.get(l.from)?.id, to_agent_id: byRole.get(l.to)?.id, required: l.required }))
    .filter((l) => l.from_agent_id && l.to_agent_id && !haveLink.has(`${l.from_agent_id}>${l.to_agent_id}`));
  if (newLinks.length && !lost) {
    const ins = await db.from('ag_links').insert(newLinks).select();
    if (ins.error && !dup(ins)) throw ins.error;
    links = must(await db.from('ag_links').select('*').in('from_agent_id', ids));
  }
  const prompts = ids.length ? must(await db.from('ag_prompts').select('agent_id').in('agent_id', ids)) || [] : [];
  const hasPrompt = new Set(prompts.map((p) => p.agent_id));
  const newPrompts = agents.filter((a) => !hasPrompt.has(a.id) && CREATIVE_PROMPTS[a.role]).map((a) => ({ agent_id: a.id, name: 'Стартовий промт', body: CREATIVE_PROMPTS[a.role], is_default: true, current_version: 1, note: 'Стартовий промт', created_by: email }));
  if (newPrompts.length && !lost) {
    const created = must(await db.from('ag_prompts').insert(newPrompts).select());
    must(await db.from('ag_prompt_versions').insert(created.map((p) => ({ prompt_id: p.id, version: 1, body: p.body, note: 'Стартовий промт', created_by: email }))));
  }
  return { agents: agents.sort((a, b) => a.sort - b.sort), links };
}

// A client (campaign) is connected to the agents of the department: one link row per agent, all on and in auto mode, the priority after the
// clients already there. `only` (roles) connects a part of the department. → the link rows of the client.
export async function connectCampaign(db, campaign, { email = null, only = null } = {}) {
  const { agents } = await ensureCreativeDepartment(db, email);
  const want = agents.filter((a) => !only || only.includes(a.role));
  const have = (must(await db.from('ag_agent_clients').select('agent_id').eq('campaign_id', campaign.id)) || []).map((r) => r.agent_id);
  const rows = want.filter((a) => !have.includes(a.id)).map((a) => ({ agent_id: a.id, campaign_id: campaign.id, enabled: true, mode: 'auto', priority: 100, confirm_before_pass: false, config: {} }));
  if (rows.length) {
    const ins = await db.from('ag_agent_clients').insert(rows).select();
    if (ins.error && !dup(ins)) throw ins.error;
  }
  return must(await db.from('ag_agent_clients').select('*').eq('campaign_id', campaign.id)) || [];
}
