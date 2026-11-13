// The creative department: six agents, each ONE worker with a queue of clients (docs/agent-model-spec.md). They are ordinary framework agents
// (ag_agents, team 'creative', scope internal), the client is attached to an agent by a link row (ag_agent_clients: on/off, mode, priority,
// the client's own settings). The chain of ONE request (ag_creative_requests):
//   analyst (weekly, per client) ──> strategist ──> brief ──┬─> copywriter ─┐
//                                                           └─> maker ──────┴─> quality ──> the person approves
// A request starts the strategist; every finished task starts the agents below it for the same client and request.
import { CREATIVE_PROMPTS } from './creativePrompts.js';
import { isValidLanguage } from './languages.js';
import { cleanManual, isEmptyManual } from './projectStyle.js';
import { cleanLook } from '../creatives/realism.js';

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
  { role: 'creative_scout', name: 'Агент розвідник', short: 'сайт, товари й реклама клієнта', stage: 'data', row: 1, trigger: 'intel',
    description: 'Перед першим креативом вивчає сайт клієнта (товари, ціни, тон, оформлення, фото) і найкращі реклами з кабінету Meta, складає профіль клієнта, який читають усі агенти відділу. Працює один раз при запуску команди, оновлюється кнопкою або раз на 30 днів.',
    fields: [], clientFields: [] },
  { role: 'creative_analyst', name: 'Агент аналітик креативів', short: 'які креативи працюють', stage: 'data', row: 0, trigger: 'schedule', schedule: { weekday: 1, time: '09:15' },
    description: 'Раз на тиждень по кожному клієнту зв’язує креативи з результатами, шукає закономірності й віддає висновки Агенту креативний стратег.',
    fields: [], clientFields: [] },
  { role: 'creative_strategy', name: 'Агент креативний стратег', short: 'план по клієнту, до 10 напрямків', stage: 'plan', row: 0, trigger: 'request', entry: true,
    description: 'Керівник відділу: з запиту менеджера, картки проєкту, досліджень і аналізу креативів складає план (до десяти напрямків) і ставить задачу Агенту по ТЗ.',
    fields: [text('rules', 'Правила відділу креативів', 'Що ми завжди враховуємо в планах: підхід, пріоритети, що вважаємо успіхом.', 4)],
    clientFields: [text('kpi', 'Цілі й KPI клієнта', 'Наприклад: CPA до $12, ROAS від 3.', 3), text('limits', 'Обмеження клієнта', 'Що не можна показувати чи обіцяти.', 3), text('budget', 'Бюджет на креативи', 'Скільки можна витратити на це завдання.', 2)] },
  { role: 'creative_brief', name: 'Агент по ТЗ', short: 'технічне завдання на креативи й тексти', stage: 'brief', row: 0, trigger: 'request',
    description: 'З плану стратега складає технічні завдання: для Агента креативщик (картинка, формати, референси) і для Агента копірайтер (що писати), якщо текст потрібен.',
    fields: [text('rules', 'Наші правила для креативів', 'Стиль, композиція, обовʼязкові елементи, тон.', 4), text('avoid', 'Чого не робимо', 'Що не можна показувати чи обіцяти в креативах.', 3), text('formats', 'Формати й обмеження', 'Які формати та розміри ми робимо.', 2)],
    clientFields: [] },
  { role: 'creative_copywriter', name: 'Агент копірайтер', short: 'тексти до креативів', stage: 'make', row: 0, trigger: 'request',
    description: 'Пише рекламні тексти за технічним завданням: заголовок, основний текст, опис, заклик. Текст ніколи не вставляється в картинку.',
    fields: [text('tone', 'Тон і мови текстів', 'Наприклад: українською й англійською, прямий тон, без знижок у тексті.', 3)], clientFields: [] },
  { role: 'creative_maker', name: 'Агент креативщик', short: 'запит у Higgsfield і готові картинки', stage: 'make', row: 1, trigger: 'request',
    description: 'За технічним завданням готує запит у Higgsfield (з матеріалами клієнта як референсами), отримує статичні креативи й передає їх на перевірку.',
    fields: [
      text('style', 'Стиль зображень за замовчуванням', 'Світло, кольори, настрій, який ми любимо. Додається до кожного запиту.', 3),
      { key: 'max_usd', label: 'Ліміт витрат Higgsfield на один запит, $', type: 'text', hint: 'Скільки найбільше можна витратити на картинки одного запиту. Порожньо: $3. Що не вмістилося, лишається в черзі й не генерується.' },
      { key: 'auto_generate', label: 'Генерувати картинки одразу після технічного завдання', type: 'check', hint: 'Вимкнено: картинки запускає людина кнопкою у вікні запиту, після оцінки вартості. Увімкнено: запускаються самі, у межах ліміту.' },
    ], clientFields: [] },
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
// texts: 'given' = the manager gives the texts (used word for word, one creative per text), 'yes' = the copywriter writes them, 'no' = none,
// 'auto' = the agent decides (older requests).
export const TEXT_MODES = { auto: 'Агент вирішує', yes: 'Напише агент', given: 'Задані менеджером', no: 'Без тексту' };
export const MATERIAL_KINDS = { logo: 'Логотип', product: 'Фото продукту', style: 'Приклад стилю', competitor: 'Реклама конкурента', other: 'Інше' };
export const DEFAULT_CONCEPTS = 3; // how many directions when the request does not say
export const MAX_CONCEPTS = 10; // the strategist makes at most ten directions (owner, 2026-11-11: raised from three), the brief one concept per direction
export const MAX_GIVEN_TEXTS = 10; // with given texts there is one direction (and creative) per text
export const MAX_MATERIALS = 16;
export const IDEA_SOURCES = { competitors: 'Від конкурентів', own: 'Свої / від ШІ', mix: 'Мікс' };

// How many directions (and concepts) a request asks for: one per given text when the manager gave the texts, otherwise up to three.
export function directionLimit(brief = {}) {
  const given = Array.isArray(brief.given_texts) ? brief.given_texts.length : 0;
  if (brief.texts === 'given' && given) return Math.min(MAX_GIVEN_TEXTS, given);
  return Math.min(MAX_CONCEPTS, Math.max(1, Number(brief.count) || DEFAULT_CONCEPTS));
}

// The texts the manager pasted all together → [{ headline, subline, badge }]. Texts are numbered («1)» or «1.») or separated by an empty line; inside
// a text the lines are the headline, the subline and the badge (the offer). Nothing is changed or completed.
export function parseGivenTexts(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  const numbered = /^\s*\d+[).]\s+\S/m.test(raw);
  const blocks = (numbered ? raw.split(/^\s*\d+[).]\s+/m) : raw.split(/\n\s*\n/)).map((b) => b.trim()).filter(Boolean);
  return blocks.slice(0, MAX_GIVEN_TEXTS).map((b) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    return { headline: lines[0] || '', subline: lines[1] || '', badge: lines.slice(2).join(' ') };
  }).filter((t) => t.headline);
}

// The settings of the agents for ONE cycle (owner, 2026-11-11): the same fields the agent has in its own settings (department-wide) and in the link to the client,
// asked again in the form of a cycle. What is filled is added to the prompt of that agent for this cycle only and counts above its general settings; an empty
// field changes nothing. The checker has no settings. → [{ key, label, type, hint, rows? }]
export const CYCLE_AGENT_ROLES = ['creative_strategy', 'creative_brief', 'creative_copywriter', 'creative_maker'];
export function cycleAgentFields(role) {
  const def = creativeRoleDef(role);
  const seen = new Set();
  return def ? [...(def.clientFields || []), ...(def.fields || [])].filter((f) => !seen.has(f.key) && seen.add(f.key)) : [];
}
// input: { role: { key: value } } → the same, cleaned (texts clipped, the limit a positive number, a check only when on). Throws a message the person can read.
export function cleanAgentSettings(input = {}) {
  const out = {};
  CYCLE_AGENT_ROLES.forEach((role) => {
    const mine = {};
    cycleAgentFields(role).forEach((f) => {
      const v = input?.[role]?.[f.key];
      if (f.type === 'check') { if (v === true) mine[f.key] = true; return; }
      const text = String(v ?? '').replace(/\r\n/g, '\n').trim();
      if (!text) return;
      if (f.key === 'max_usd') {
        const n = Number(text.replace(',', '.'));
        if (!Number.isFinite(n) || n <= 0 || n > 1000) throw new Error('Ліміт витрат на завдання — сума в доларах, наприклад 2.5.');
        mine[f.key] = String(Math.round(n * 100) / 100);
      } else mine[f.key] = text.slice(0, 1500);
    });
    if (Object.keys(mine).length) out[role] = mine;
  });
  return out;
}

// A title from a long text: cut at a word, not in the middle of it
export function shortTitle(text, n = 60) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[,;:\-–—\s]+$/, '')}…`;
}

// A request as the form sends it, cleaned: only known keys, bounded sizes. Throws a message the person can read.
export function cleanRequest(input = {}) {
  const clip = (v, n) => String(v ?? '').trim().slice(0, n);
  const ratios = (Array.isArray(input.ratios) ? input.ratios : []).filter((r) => REQUEST_RATIOS.some((x) => x.key === r));
  const given = (Array.isArray(input.given_texts) ? input.given_texts : []).slice(0, MAX_GIVEN_TEXTS)
    .map((t) => ({ headline: clip(t?.headline, 120), subline: clip(t?.subline, 240), badge: clip(t?.badge, 60) })).filter((t) => t.headline || t.subline || t.badge);
  const texts = TEXT_MODES[input.texts] ? input.texts : 'auto';
  const figma = clip(input.figma, 300);
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
    count: texts === 'given' && given.length ? Math.min(MAX_GIVEN_TEXTS, given.length) : Math.min(MAX_CONCEPTS, Math.max(1, Math.round(Number(input.count)) || DEFAULT_CONCEPTS)),
    texts,
    given_texts: texts === 'given' ? given : [],
    idea_source: IDEA_SOURCES[input.idea_source] ? input.idea_source : 'mix',
    figma,
    cta: input.cta !== false,
    cta_text: clip(input.cta_text, 40),
    language: isValidLanguage(input.language) ? input.language : 'uk', // the language of the client (the card of the project); the server stamps it before the agents work
    kind: input.kind === 'regular' ? 'regular' : 'extra', // a cycle of the weekly schedule or a one-off one (lib/agents/operationCycles.js)
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.scheduled_for || ''))) brief.scheduled_for = input.scheduled_for;
  if (/^r[a-z0-9]{1,20}$/.test(String(input.regular_id || ''))) brief.regular_id = input.regular_id; // which regular cycle made it
  const look = cleanLook(input.look);
  if (look) brief.look = look; // the realism look of THIS task (the cues added to every prompt for the pictures); absent = «std», nothing is added
  const style = cleanManual(input.style);
  if (!isEmptyManual(style)) brief.style = style; // the look of THIS task (words on the picture, tone of the pictures and of the copy): it wins over what the scout decided for the client
  const agentSettings = cleanAgentSettings(input.agent_settings);
  if (Object.keys(agentSettings).length) brief.agent_settings = agentSettings; // what the person asked of each agent for this cycle
  if (!brief.goal) throw new Error('Опишіть, що потрібно від креативів.');
  if (figma && !/^https?:\/\//i.test(figma)) throw new Error('Посилання на Figma має починатися з https://');
  if (texts === 'given' && !given.length) throw new Error('Додайте хоча б один текст або оберіть інший режим текстів.');
  const materials = (Array.isArray(input.materials) ? input.materials : []).slice(0, MAX_MATERIALS).map((m) => ({
    name: clip(m?.name, 160), url: clip(m?.url, 600), path: clip(m?.path, 400), kind: MATERIAL_KINDS[m?.kind] ? m.kind : 'other',
  })).filter((m) => m.name && m.url);
  return { title: clip(input.title, 100) || shortTitle(brief.goal, 60), brief, materials };
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

// ---------------------------------------------------------------------------------------------------------------- connecting a client (campaign wizard)
// The agents without which a request cannot be made: the scout studies the client first, the strategist starts the request, the brief writer turns the plan into a brief, the maker makes the
// pictures (see the required links). The others (the weekly analyst, the copywriter, the quality checker) can be left out for a client.
export const CREATIVE_REQUIRED = ['creative_scout', 'creative_strategy', 'creative_brief', 'creative_maker'];
export const CREATIVE_OPTIONAL = CREATIVE_ROLES.map((r) => r.role).filter((r) => !CREATIVE_REQUIRED.includes(r));

// The pictures of a task (owner, 2026-11-12: «агенты делают задание вплоть до готового креатива, я утверждаю его, когда он готов»): they are generated at once, within a limit,
// and the person is asked only when something does not fit the limit. campaign.config.creative = { …, autoGenerate (on unless it says false), maxUsd (one task; empty: the limit of the maker) }
export const DEFAULT_PICTURES_LIMIT_USD = 3;
export function creativeAutoOf(campaign) {
  const c = campaign?.config?.creative;
  const max = Number(c?.maxUsd);
  return { auto: true, maxUsd: max > 0 ? max : null }; // owner, 2026-11-12: the pictures are always made automatically, the spending is held by the limits (of the task and of the team)
}

// What the wizard decided for a campaign (campaign.config.creative = { enabled, roles }). A campaign that was never through the wizard step keeps the
// old behaviour: the whole department.
export function creativeSetupOf(campaign) {
  const c = campaign?.config?.creative;
  if (!c || typeof c !== 'object') return { configured: false, enabled: true, roles: CREATIVE_ROLES.map((r) => r.role) };
  if (c.enabled === false) return { configured: true, enabled: false, roles: [] };
  const roles = [...new Set([...CREATIVE_REQUIRED, ...(Array.isArray(c.roles) ? c.roles : [])])].filter(isCreativeRole);
  return { configured: true, enabled: true, roles };
}

// The client is connected to exactly these roles: missing link rows are created, the rows of the other roles are switched off (never deleted, so
// their settings and history stay), the ones asked for are switched on. → the link rows of the client.
export async function setCreativeRoles(db, campaign, roles, { email = null } = {}) {
  const want = new Set((roles || []).filter(isCreativeRole));
  const { agents } = await ensureCreativeDepartment(db, email);
  const rows = want.size ? await connectCampaign(db, campaign, { email, only: [...want] }) : must(await db.from('ag_agent_clients').select('*').eq('campaign_id', campaign.id)) || [];
  const roleOf = new Map(agents.map((a) => [a.id, a.role]));
  for (const r of rows) {
    const on = want.has(roleOf.get(r.agent_id));
    if (r.enabled !== on) must(await db.from('ag_agent_clients').update({ enabled: on, updated_at: new Date().toISOString() }).eq('id', r.id));
  }
  return must(await db.from('ag_agent_clients').select('*').eq('campaign_id', campaign.id)) || [];
}

// What the wizard fills in for the client's fields of an agent by itself, and from where (shown next to the field so the person can check it):
// the goals typed in the first part of the step, the restrictions kept in the project's «Креативи» tab. The rest stays empty: nothing is invented.
export function creativeAutofill({ project = {}, goals = '', projectCreative = null } = {}) {
  const clip = (v, n) => String(v ?? '').trim().slice(0, n);
  // what the person wrote in the card of the project («Інформація по проєкту») counts too: the goals and the budget of the client (owner, 2026-11-11)
  const cardBody = (k) => clip(projectCreative?.inputs?.[k]?.body, 600);
  const fields = { kpi: clip(goals, 400) || cardBody('goals'), limits: clip(projectCreative?.restrictions, 600), budget: cardBody('budget') };
  const from = { kpi: clip(goals, 400) ? 'campaign' : fields.kpi ? 'card' : null, limits: fields.limits ? 'project' : null, budget: fields.budget ? 'card' : null };
  const facts = [['Сайт', project.website], ['Країна', project.country], ['Тип бізнесу', project.business_type], ['Менеджер', project.manager]].filter(([, v]) => String(v || '').trim()).map(([k, v]) => [k, clip(v, 80)]);
  return { fields, from, facts };
}
