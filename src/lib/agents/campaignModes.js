// The five modes of the «Створити операцію» wizard (design decision 2026-11-01, picker B). A mode is a set of QUARTERS of the client district:
//   0 Дослідження і стратегія   researchers + the marketing strategist (agents of the campaign team)
//   1 Креативи                  the creative department (shared agents, work on requests: not a part of the campaign team)
//   2 Ведення реклами           channel analysts, client tracking control, optimizers
//   3 Звіти і клієнт            the cross-channel report and the AI account manager
// The campaign team still holds four copies of creative roles (creative strategist, creative analyst, copywriter, quality controller): the department
// does that work now, so no mode ever switches them on.
import { CAMPAIGN_ROLES, PLATFORMS, participants } from './campaignTeam.js';
import { CREATIVE_ROLES } from './creativeTeam.js';

export const COST_PER_AGENT_RUN = 0.07; // a rough price of one agent run, for the estimate only

export const QUARTERS = [
  { key: 'research', label: 'Дослідження і стратегія', roles: ['business_research', 'competitor_research', 'audience_research', 'marketing_strategist'] },
  { key: 'creative', label: 'Креативи', roles: [] },
  { key: 'ads', label: 'Ведення реклами', roles: ['meta_analyst', 'google_analyst', 'tiktok_analyst', 'tracking_integrity', 'meta_optimizer', 'google_optimizer'] },
  { key: 'report', label: 'Звіти і клієнт', roles: ['cross_channel_report', 'account_manager'] },
];

export const LEGACY_CREATIVE_ROLES = ['creative_performance_analyst', 'creative_strategist', 'performance_copywriter', 'quality_controller'];

export const MODE_ORDER = ['creative', 'full', 'strategy', 'ads', 'report'];

// channels: the mode needs the ad channels; brief: the «Загальне про операцію» page; safe: nothing starts by itself; repeat: works every week
export const MODES = {
  creative: {
    title: 'Тільки креативи', icon: 'spark', quarters: [1], channels: false, brief: false, safe: true, repeat: false, start: 'лише за запитом', cost: 'тільки за запит',
    sub: 'квартал «Креативи», за запитом',
    text: 'Підключаємо клієнта до відділу креативів. Агенти працюють лише коли менеджер створює запит. Нічого не стартує саме.',
    flow: ['Відкриється сторінка клієнта з блоком «Відділ креативів».', 'Одразу відкриється форма «Нове завдання (запит на креативи)»: опишіть, що потрібно (канал, формати, настрій).', 'Стратег складе план, агент по ТЗ сформує завдання, копірайтер і креативщик підготують матеріали.', 'Готове перевірить контролер і віддасть вам на затвердження.'],
  },
  full: {
    title: 'Повна операція', icon: 'team', quarters: [0, 1, 2, 3], channels: true, brief: true, safe: false, repeat: true, start: 'одразу, далі щотижня', cost: 'щотижня',
    sub: 'усі чотири квартали по черзі',
    text: 'Усі чотири квартали ведуть клієнта по черзі: дослідження і стратегія, креативи, ведення реклами, звіти. Дослідники й аналітики стартують одразу.',
    flow: ['Одразу стартують дослідники й аналітики каналів: читають бриф, сайти й дані кабінетів.', 'Стратег зводить дослідження, оптимізатори складають план дій, далі працює звітний квартал.', 'Звіт і чернетка листа клієнту зʼявляються в кінці. Нічого не змінюється в кабінетах.', 'Креативи чекають запитів менеджера. Далі аналітики запускаються щотижня.'],
  },
  strategy: {
    title: 'Тільки стратегія', icon: 'compass', quarters: [0], channels: false, brief: true, safe: false, repeat: false, start: 'одразу, один раз', cost: 'разово',
    sub: 'квартал «Дослідження і стратегія»',
    text: 'Дослідники вивчають бізнес, конкурентів і аудиторію, стратег зводить усе в стратегію. Без креативів і без доступу до кабінетів.',
    flow: ['Дослідники читають бриф, сайт клієнта й відкриті джерела.', 'Стратег зводить дослідження в стратегію операції.', 'Стратегія зʼявиться на сторінці операції й чекає вашого рішення. Далі нічого не запускається саме.'],
  },
  ads: {
    title: 'Аналіз і оптимізація', icon: 'chart', quarters: [2], channels: true, brief: false, safe: false, repeat: true, start: 'одразу, далі щотижня', cost: 'щотижня',
    sub: 'квартал «Ведення реклами»',
    text: 'Аналітики каналів читають результати кабінетів, оптимізатори пропонують дії, контроль трекінгу стежить за конверсіями. У кабінетах нічого не змінюється без вашого рішення.',
    flow: ['Аналітики обраних каналів читають дані кабінетів.', 'Оптимізатори складають план дій, контроль трекінгу перевіряє конверсії.', 'План лягає на сторінку операції й чекає вашого рішення.', 'Далі аналітики запускаються щотижня.'],
  },
  report: {
    title: 'Тільки звіт', icon: 'doc', quarters: [3], channels: true, brief: false, safe: false, repeat: true, start: 'за розкладом, щотижня', cost: 'щотижня',
    sub: 'квартал «Звіти і клієнт»',
    text: 'Міжканальний звіт збирає тижневий звіт із наявних результатів агентів, акаунт-менеджер готує чернетку листа клієнту. Нових даних із кабінетів цей режим не збирає.',
    flow: ['Звіт збирається за розкладом щопонеділка з уже наявних результатів агентів.', 'Акаунт-менеджер готує чернетку листа клієнту.', 'Звіт і чернетка чекають на ваше рішення. Нічого не надсилається клієнту.', 'Далі звіт збирається щотижня.'],
  },
};

// The roles of the campaign team a mode switches ON for these channels: the roles of its quarters that take part for the channels. A mode never
// switches on the legacy creative copies.
export function modeRoles(mode, platforms) {
  const def = MODES[mode];
  if (!def) return [];
  const taking = new Set(participants(platforms).map((r) => r.role));
  const out = [];
  def.quarters.forEach((q) => QUARTERS[q].roles.forEach((role) => { if (taking.has(role) && !LEGACY_CREATIVE_ROLES.includes(role)) out.push(role); }));
  return out;
}

export const modeHasDepartment = (mode, departmentWanted = true) => (mode === 'creative' ? true : mode === 'full' ? Boolean(departmentWanted) : false);

// ≈ $ of one start of the agents of the mode (the department is paid per request, so it is not counted)
export const modeEstimate = (mode, platforms) => Math.round(modeRoles(mode, platforms).length * COST_PER_AGENT_RUN * 100) / 100;

// The scheme of the wizard: four quarters, the agents of the campaign team and of the creative department, the links between them.
const TEAM = Object.fromEntries(CAMPAIGN_ROLES.map((r) => [r.role, r]));
const DEPT = Object.fromEntries(CREATIVE_ROLES.map((r) => [r.role, r]));
export const shortName = (name) => { const n = String(name).replace(/^Агент /, ''); return n.charAt(0).toUpperCase() + n.slice(1); };
const node = (id, quarter, row, source, extra = {}) => {
  const def = (source === 'dept' ? DEPT : TEAM)[id];
  return { id, name: shortName(def.name), short: def.short, quarter, row, platforms: def.platforms || ['*'], source, ...extra };
};
// The agents stand so that the links are short and straight: inside a quarter the next agent is the card below (a vertical arrow), a fork is a bracket on
// the left (one agent feeds several), a join is a bracket on the right (several feed one). Between quarters there is one wide arrow per flow.
export const QUARTER_NODES = [
  node('business_research', 0, 0, 'team'), node('competitor_research', 0, 1, 'team'), node('audience_research', 0, 2, 'team'), node('marketing_strategist', 0, 3, 'team'),
  node('creative_analyst', 1, 0, 'dept'), node('creative_strategy', 1, 1, 'dept'), node('creative_brief', 1, 2, 'dept'), node('creative_copywriter', 1, 3, 'dept'),
  node('creative_maker', 1, 4, 'dept'), node('creative_quality', 1, 5, 'dept'),
  node('meta_analyst', 2, 0, 'team'), node('meta_optimizer', 2, 1, 'team'), node('google_analyst', 2, 2, 'team'), node('google_optimizer', 2, 3, 'team'),
  node('tiktok_analyst', 2, 4, 'team'), { id: 'tiktok_optimizer', name: 'Оптимізатор TikTok', short: 'ще не збудований', quarter: 2, row: 5, platforms: ['tiktok'], source: 'planned', planned: true },
  node('tracking_integrity', 2, 6, 'team'),
  node('cross_channel_report', 3, 0, 'team'), node('account_manager', 3, 1, 'team'),
];
// kind: where the link leaves and enters. 'across' joins agents of different quarters: it leaves the right side of the first and enters the left side of
// the next (a smooth curve to the right). Inside a quarter: 'down' = the agent right below (a straight arrow), 'left' / 'right' = the link leaves and
// enters on the same side (a smooth bulge on that side), so it never loops around a card. 'around' skips a quarter: it dips under the panels and comes
// up in front of its target, so it never passes behind a card that is not its own.
const L = (from, to, kind, required = false) => ({ from, to, kind, required });
export const QUARTER_LINKS = [
  L('business_research', 'marketing_strategist', 'left'), L('competitor_research', 'marketing_strategist', 'left'), L('audience_research', 'marketing_strategist', 'left'),
  L('marketing_strategist', 'creative_strategy', 'across'), L('marketing_strategist', 'meta_optimizer', 'around'), L('marketing_strategist', 'google_optimizer', 'around'),
  L('creative_analyst', 'creative_strategy', 'down'), L('creative_strategy', 'creative_brief', 'down', true),
  L('creative_brief', 'creative_copywriter', 'down'), L('creative_brief', 'creative_maker', 'left', true),
  L('creative_copywriter', 'creative_quality', 'right'), L('creative_maker', 'creative_quality', 'down', true),
  L('meta_analyst', 'meta_optimizer', 'down', true), L('google_analyst', 'google_optimizer', 'down', true), L('tiktok_analyst', 'tiktok_optimizer', 'down'),
  L('meta_analyst', 'cross_channel_report', 'across'), L('google_analyst', 'cross_channel_report', 'across'), L('tiktok_analyst', 'cross_channel_report', 'across'),
  L('tracking_integrity', 'cross_channel_report', 'across'), L('meta_optimizer', 'cross_channel_report', 'across'), L('google_optimizer', 'cross_channel_report', 'across'),
  L('creative_quality', 'cross_channel_report', 'around'), L('cross_channel_report', 'account_manager', 'down', true),
];

// → the ids of the nodes that glow for this mode and these channels: the agents of its quarters; the department agents only where the department works;
// an agent of another channel fades; the planned agent never glows.
export function litNodes(mode, platforms, { departmentWanted = true, optional = {} } = {}) {
  const def = MODES[mode];
  const lit = new Set();
  if (!def) return lit;
  const chosen = (platforms || []).filter((p) => PLATFORMS[p]);
  QUARTER_NODES.forEach((n) => {
    if (n.planned || !def.quarters.includes(n.quarter)) return;
    if (n.source === 'dept') { if (!modeHasDepartment(mode, departmentWanted)) return; if (optional[n.id] === false) return; }
    if (n.platforms.includes('*') || n.platforms.some((p) => chosen.includes(p))) lit.add(n.id);
  });
  return lit;
}
