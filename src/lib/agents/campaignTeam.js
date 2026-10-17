// The campaign team: the agents that work on ONE client's campaigns (Meta, Google, TikTok or several), as data.
// A campaign gets only the agents of the platforms it runs, linked in a chain: research -> strategy -> channel analysis ->
// optimization and creative -> texts and control -> report -> the client message. Every agent is an ordinary framework agent
// (ag_agents, team 'campaign', scope_id = the campaign id) with its own prompt library, settings, tasks and history.
import { CAMPAIGN_PROMPTS } from './campaignPrompts.js';

export const CAMPAIGN_TEAM = 'campaign';

export const PLATFORMS = {
  meta: { key: 'meta', label: 'Meta Ads', color: '#4C7DFF' },
  google: { key: 'google', label: 'Google Ads', color: '#F2A93B' },
  tiktok: { key: 'tiktok', label: 'TikTok Ads', color: '#18C7C0' },
};
export const PLATFORM_KEYS = Object.keys(PLATFORMS);

// The columns of the chain diagram, left to right.
export const STAGES = [
  { key: 'research', label: 'Дослідження' },
  { key: 'strategy', label: 'Стратегія' },
  { key: 'analysis', label: 'Аналіз каналів' },
  { key: 'action', label: 'Оптимізація і креатив' },
  { key: 'control', label: 'Тексти й контроль' },
  { key: 'report', label: 'Звіт і клієнт' },
];

// trigger: 'initial' = runs when the campaign is launched (and by hand); 'schedule' = weekly (and at launch);
//          'upstream' = runs when the agents it depends on have finished.
// data: what the agent reads from the ad accounts, 'platform:level:period'. fields: the client-specific settings of the agent.
const KPI = { key: 'kpi', label: 'Цільові KPI клієнта', type: 'textarea', hint: 'Наприклад: CPA до $12, ROAS від 3, бюджет $3000 на місяць. Агент звіряє результати з цим.' };
const sched = (weekday, time) => ({ weekday, time });

export const CAMPAIGN_ROLES = [
  { role: 'business_research', name: 'Дослідник бізнесу', short: 'що продає клієнт і кому', stage: 'research', row: 0, platforms: ['*'], trigger: 'initial', registry: 'business-research-agent', data: [], schedule: null,
    description: 'Описує бізнес клієнта за брифом і текстом його сайту, щоб уся команда працювала з одними фактами.',
    fields: [{ key: 'sources', label: 'Адреса сайту й матеріали', type: 'textarea', hint: 'Сайт клієнта, лендінги, прайс: що можна прочитати. Агент читає лише публічні сторінки.' }] },
  { role: 'competitor_research', name: 'Дослідник конкурентів', short: 'як позиціонуються конкуренти', stage: 'research', row: 1, platforms: ['*'], trigger: 'initial', registry: 'competitor-research-agent', data: [], schedule: null,
    description: 'Читає публічні сторінки конкурентів клієнта і показує, чим клієнт може відрізнитись.',
    fields: [{ key: 'competitors', label: 'Конкуренти (назви й адреси сайтів)', type: 'textarea', hint: 'По одному на рядок. Без них агент спиратиметься лише на бриф.' }] },
  { role: 'audience_research', name: 'Дослідник аудиторії', short: 'хто купує і чому', stage: 'research', row: 2, platforms: ['*'], trigger: 'initial', registry: 'audience-research-agent', data: [], schedule: null,
    description: 'Описує аудиторії, на які працюватимуть кампанії, і гіпотези, які варто перевірити.',
    fields: [] },
  { role: 'marketing_strategist', name: 'Маркетинговий стратег', short: 'стратегія кампанії', stage: 'strategy', row: 0, platforms: ['*'], trigger: 'upstream', registry: 'marketing-strategist', data: [], schedule: null,
    description: 'Зводить дослідження й цілі в робочу стратегію: цілі, аудиторії, роль каналів, перші 30 днів.',
    fields: [KPI] },
  { role: 'meta_analyst', name: 'Аналітик Meta Ads', short: 'що змінилось у Meta і чому', stage: 'analysis', row: 0, platforms: ['meta'], trigger: 'schedule', registry: 'meta-ads-analyst', schedule: sched(1, '09:00'),
    data: ['meta:account:last_7d', 'meta:account:last_30d', 'meta:campaign:last_7d', 'meta:campaign:last_30d', 'meta:adset:last_30d'],
    description: 'Щотижня читає кабінет Meta (кабінет, кампанії, групи оголошень) і пояснює, що змінилось і чому.', fields: [KPI] },
  { role: 'google_analyst', name: 'Аналітик Google Ads', short: 'що змінилось у Google і чому', stage: 'analysis', row: 1, platforms: ['google'], trigger: 'schedule', registry: 'google-ads-analyst', schedule: sched(1, '09:00'),
    data: ['google:account:LAST_7_DAYS', 'google:account:LAST_30_DAYS', 'google:campaign:LAST_7_DAYS', 'google:campaign:LAST_30_DAYS', 'google:device:LAST_30_DAYS', 'google:keyword:LAST_30_DAYS'],
    description: 'Щотижня читає кабінет Google Ads (кампанії, пристрої, ключові слова) і пояснює, що змінилось і чому.', fields: [KPI] },
  { role: 'tiktok_analyst', name: 'Аналітик TikTok Ads', short: 'креативи й швидкість тестів', stage: 'analysis', row: 2, platforms: ['tiktok'], trigger: 'schedule', registry: 'tiktok-ads-analyst', schedule: sched(1, '09:00'), data: [],
    description: 'Аналізує дані TikTok, які менеджер вставляє з рекламного кабінету (прямого підключення немає): креативи, швидкість тестування.',
    fields: [KPI, { key: 'pasted', label: 'Дані з TikTok Ads Manager', type: 'textarea', rows: 8, hint: 'Скопіюйте таблицю кампаній і креативів за період. Оновлюйте перед кожним запуском.' }] },
  { role: 'creative_performance_analyst', name: 'Аналітик креативів', short: 'які креативи працюють', stage: 'analysis', row: 3, platforms: ['meta', 'tiktok'], trigger: 'schedule', registry: 'creative-performance-analyst', schedule: sched(1, '09:15'),
    data: ['meta:ad:last_30d', 'meta:ad:last_7d'],
    description: 'Звʼязує кожен креатив з результатами і шукає закономірності: що виграє, що програє.', fields: [] },
  { role: 'tracking_integrity', name: 'Контроль трекінгу', short: 'чи не зламані конверсії', stage: 'analysis', row: 4, platforms: ['meta', 'google'], trigger: 'schedule', registry: 'tracking-data-integrity-agent', schedule: sched(1, '09:30'),
    data: ['meta:account:last_30d', 'google:account:LAST_30_DAYS', 'meta:account:last_7d', 'google:account:LAST_7_DAYS'],
    description: 'Порівнює дані платформ між собою і шукає ознаки зламаного трекінгу: нулі, дублі, різкі стрибки.', fields: [] },
  { role: 'meta_optimizer', name: 'Оптимізатор Meta Ads', short: 'план дій у кабінеті Meta', stage: 'action', row: 0, platforms: ['meta'], trigger: 'upstream', registry: 'meta-optimization-agent', schedule: null, data: [],
    description: 'З діагнозу аналітика і стратегії складає пріоритетний план дій у кабінеті Meta.', fields: [KPI] },
  { role: 'google_optimizer', name: 'Оптимізатор Google Ads', short: 'план дій у кабінеті Google', stage: 'action', row: 1, platforms: ['google'], trigger: 'upstream', registry: 'google-optimization-agent', schedule: null, data: [],
    description: 'З діагнозу аналітика і стратегії складає пріоритетний план дій у кабінеті Google Ads.', fields: [KPI] },
  { role: 'creative_strategist', name: 'Креативний стратег', short: 'система креативних гіпотез', stage: 'action', row: 2, platforms: ['meta', 'tiktok'], trigger: 'upstream', registry: 'creative-strategist', schedule: null, data: [],
    description: 'Будує систему креативних гіпотез із планом тестів на два тижні, а не список ідей.',
    fields: [{ key: 'formats', label: 'Формати й обмеження', type: 'textarea', hint: 'Які формати можемо зробити (відео, статика, UGC), чого не можна показувати.' }] },
  { role: 'performance_copywriter', name: 'Копірайтер реклами', short: 'тексти оголошень', stage: 'control', row: 0, platforms: ['*'], trigger: 'upstream', registry: 'performance-copywriter', schedule: null, data: [],
    description: 'Пише варіанти текстів для рекламних платформ під гіпотези й плани оптимізації.',
    fields: [{ key: 'tone', label: 'Тон і мови оголошень', type: 'textarea', hint: 'Наприклад: українською й англійською, прямий тон, без знижок у тексті.' }] },
  { role: 'quality_controller', name: 'Контролер якості', short: 'перевірка перед менеджером', stage: 'control', row: 1, platforms: ['*'], trigger: 'upstream', registry: 'ai-quality-controller',
    schedule: null, data: ['meta:account:last_7d', 'google:account:LAST_7_DAYS'],
    description: 'Звіряє цифри й твердження в планах і текстах з даними кабінетів і бріфом, показує, що й хто має виправити.', fields: [] },
  { role: 'cross_channel_report', name: 'Міжканальний звіт', short: 'тижневий звіт по всіх каналах', stage: 'report', row: 0, platforms: ['*'], trigger: 'upstream', registry: 'cross-channel-reporting-insights-agent', schedule: null,
    data: ['meta:account:last_7d', 'meta:account:last_30d', 'google:account:LAST_7_DAYS', 'google:account:LAST_30_DAYS'],
    description: 'Зводить висновки аналітиків, плани й перевірки в один тижневий звіт: що сталося, що це означає разом, що далі.',
    fields: [{ key: 'audience', label: 'Для кого звіт', type: 'text', hint: 'Наприклад: власник бізнесу, маркетинг-директор.' }] },
  { role: 'account_manager', name: 'AI-акаунт-менеджер', short: 'чернетка листа клієнту', stage: 'report', row: 1, platforms: ['*'], trigger: 'upstream', registry: 'ai-account-manager', schedule: null, data: [],
    description: 'Готує чернетку повідомлення клієнту за тижневим звітом. Людина читає й правит, нічого не надсилається саме.',
    fields: [{ key: 'contact', label: 'Контактна особа й тон листа', type: 'textarea', hint: 'Імʼя, як звертатись, коротко чи детально, якою мовою.' }] },
];

// from -> to. required = the downstream agent stops when the upstream one is switched off or has nothing to give.
export const CAMPAIGN_LINKS = [
  { from: 'business_research', to: 'marketing_strategist', required: false },
  { from: 'competitor_research', to: 'marketing_strategist', required: false },
  { from: 'audience_research', to: 'marketing_strategist', required: false },
  { from: 'marketing_strategist', to: 'meta_optimizer', required: false },
  { from: 'marketing_strategist', to: 'google_optimizer', required: false },
  { from: 'marketing_strategist', to: 'creative_strategist', required: false },
  { from: 'meta_analyst', to: 'meta_optimizer', required: true },
  { from: 'google_analyst', to: 'google_optimizer', required: true },
  { from: 'creative_performance_analyst', to: 'creative_strategist', required: false },
  { from: 'tiktok_analyst', to: 'creative_strategist', required: false },
  { from: 'creative_strategist', to: 'performance_copywriter', required: true },
  { from: 'google_optimizer', to: 'performance_copywriter', required: false },
  { from: 'performance_copywriter', to: 'quality_controller', required: true },
  { from: 'meta_optimizer', to: 'quality_controller', required: false },
  { from: 'google_optimizer', to: 'quality_controller', required: false },
  { from: 'meta_analyst', to: 'cross_channel_report', required: false },
  { from: 'google_analyst', to: 'cross_channel_report', required: false },
  { from: 'tiktok_analyst', to: 'cross_channel_report', required: false },
  { from: 'tracking_integrity', to: 'cross_channel_report', required: false },
  { from: 'meta_optimizer', to: 'cross_channel_report', required: false },
  { from: 'google_optimizer', to: 'cross_channel_report', required: false },
  { from: 'quality_controller', to: 'cross_channel_report', required: false },
  { from: 'cross_channel_report', to: 'account_manager', required: true },
];

export const roleDef = (role) => CAMPAIGN_ROLES.find((r) => r.role === role) || null;

// Does this role work on a campaign with these platforms? '*' = every campaign, otherwise at least one of the campaign's platforms.
export const takesPart = (def, platforms) => def.platforms.includes('*') || def.platforms.some((p) => platforms.includes(p));
export const participants = (platforms) => CAMPAIGN_ROLES.filter((r) => takesPart(r, platforms));
export const linksFor = (platforms) => {
  const on = new Set(participants(platforms).map((r) => r.role));
  return CAMPAIGN_LINKS.filter((l) => on.has(l.from) && on.has(l.to));
};

// Makes sure the campaign has an agent for every role that takes part (platforms may be added later), the links between them and a
// starting prompt for each. Only missing things are added. db: a Supabase client. → { agents, links }
export async function ensureCampaignTeam(db, campaign, email = null) {
  const must = (r) => { if (r.error) throw r.error; return r.data; };
  const scope = String(campaign.id);
  const wanted = participants(campaign.platforms || []);
  let agents = must(await db.from('ag_agents').select('*').eq('team', CAMPAIGN_TEAM).eq('scope_type', 'client').eq('scope_id', scope)) || [];
  const have = new Set(agents.map((a) => a.role));
  const missing = wanted.filter((r) => !have.has(r.role));
  if (missing.length) {
    must(await db.from('ag_agents').insert(missing.map((r, i) => ({
      team: CAMPAIGN_TEAM, scope_type: 'client', scope_id: scope, role: r.role, name: r.name, description: r.description, enabled: false,
      config: { trigger: r.trigger }, schedule: r.schedule || null, sort: CAMPAIGN_ROLES.indexOf(r) + 1, updated_by: email,
    }))).select());
    agents = must(await db.from('ag_agents').select('*').eq('team', CAMPAIGN_TEAM).eq('scope_type', 'client').eq('scope_id', scope));
  }
  const byRole = new Map(agents.map((a) => [a.role, a]));
  const ids = agents.map((a) => a.id);
  let links = ids.length ? must(await db.from('ag_links').select('*').in('from_agent_id', ids)) || [] : [];
  const haveLink = new Set(links.map((l) => `${l.from_agent_id}>${l.to_agent_id}`));
  const newLinks = linksFor(campaign.platforms || []).map((l) => ({ from_agent_id: byRole.get(l.from)?.id, to_agent_id: byRole.get(l.to)?.id, required: l.required }))
    .filter((l) => l.from_agent_id && l.to_agent_id && !haveLink.has(`${l.from_agent_id}>${l.to_agent_id}`));
  if (newLinks.length) {
    must(await db.from('ag_links').insert(newLinks).select());
    links = must(await db.from('ag_links').select('*').in('from_agent_id', ids));
  }
  const prompts = ids.length ? must(await db.from('ag_prompts').select('agent_id').in('agent_id', ids)) || [] : [];
  const hasPrompt = new Set(prompts.map((p) => p.agent_id));
  const newPrompts = agents.filter((a) => !hasPrompt.has(a.id) && CAMPAIGN_PROMPTS[a.role]).map((a) => ({ agent_id: a.id, name: 'Стартовий промт', body: CAMPAIGN_PROMPTS[a.role], is_default: true, current_version: 1, note: 'Стартовий промт', created_by: email }));
  if (newPrompts.length) {
    const created = must(await db.from('ag_prompts').insert(newPrompts).select());
    must(await db.from('ag_prompt_versions').insert(created.map((p) => ({ prompt_id: p.id, version: 1, body: p.body, note: 'Стартовий промт', created_by: email }))));
  }
  return { agents: agents.sort((a, b) => a.sort - b.sort), links };
}
