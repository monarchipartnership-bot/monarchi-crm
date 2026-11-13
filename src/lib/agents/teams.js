// The AI teams of a project (owner, 2026-11-11): what a person launches for a client. Three teams, any of them, one or all together:
//   creative    «Креативи»              creatives by requests and by a schedule (the creative department; the operation of mode 'creative')
//   analytics   «Аналітика й оптимізація»  the analysts of the cabinets and the optimizers (the operation of mode 'ads')
//   reports     «Звіти»                  the report agent of the project (weekly and monthly reports to the client)
// Every team has its own list of what it needs from the card of the project; the check before a launch counts ONLY that (a team of reports does not need the offer
// of the client). The dossier and the strategy are not teams: they are fields of the card that a person fills by hand or by a button, and teams read them when they exist.
// Pure code: the screens, the launch and the tests use it.
import { FIELD_LABELS, filledFields, missingFor } from './agentRequirements.js';
import { CREATIVE_OPTIONAL, CREATIVE_REQUIRED, CREATIVE_ROLES } from './creativeTeam.js';
import { COST_PER_AGENT_RUN, modeRoles } from './campaignModes.js';
import { INFO_SECTIONS, INPUT_FIELDS, PROFILE_FIELDS } from './projectCreative.js';
import { CAMPAIGN_ROLES } from './campaignTeam.js';
import { describeSchedule } from './campaignCycles.js';

export const TEAMS = [
  { key: 'creative', title: 'Креативи', mode: 'creative', text: 'Готує креативи й тексти до них: ви описуєте задачу, агенти планують, пишуть і малюють, а ви перевіряєте результат. Працює завданнями: разовими й регулярними.' },
  { key: 'analytics', title: 'Аналітика й оптимізація', mode: 'ads', text: 'Читає рекламні кабінети за розкладом, пояснює, що змінилось, і пропонує дії. У кабінетах нічого не змінюється без вашого рішення.' },
  { key: 'reports', title: 'Звіти', mode: null, text: 'Щотижня й щомісяця збирає звіт клієнту за кабінетами: показники, найкращі креативи й ваші тексти. Готове чекає на ваше затвердження.' },
];
export const teamDef = (key) => TEAMS.find((t) => t.key === key) || null;

// One-off tasks of a project that run at once from the research agents (the creatives and the report of a period go to their own screens): see lib/api/oneoff.js
export const ONEOFF = [
  { key: 'competitors', role: 'competitor_research', title: 'Аналіз конкурентів', text: 'Хто конкуренти клієнта, як вони себе позиціонують і де є шанс виграти. Береться з сайтів конкурентів у картці проєкту.' },
  { key: 'audience', role: 'audience_research', title: 'Дослідження аудиторії', text: 'Хто купує, чому й що їх зупиняє. Береться з картки клієнта та його сайту.' },
  { key: 'business', role: 'business_research', title: 'Дослідження бізнесу', text: 'Що саме продає клієнт, чим сильний і що важливо знати рекламі.' },
  { key: 'strategy', role: 'marketing_strategist', title: 'Маркетингова стратегія', text: 'Зводить усе, що відомо про клієнта, у стратегію реклами. Краще запускати після досліджень вище.' },
];

// ---- which section of the card of the project a field is filled in (for the link «Відкрити в картці»)
const SETTINGS_KEYS = ['restrictions', 'materials', 'cta', 'figma', 'brand', 'copy_rules', 'extra_info', 'examples'];
export function whereToFill(key) {
  if (key === 'client_language') return 'client';
  if (['cabinet', 'cabinet_meta', 'cabinet_google'].includes(key)) return 'main';
  if (['competitor_sites', 'competitor_notes', 'competitors'].includes(key)) return 'competitors';
  if (INFO_SECTIONS.client.includes(key)) return 'client';
  if (SETTINGS_KEYS.includes(key) || INFO_SECTIONS.business.includes(key)) return 'business';
  return 'business';
}
// the fields a person can write right in the window of the check: the text fields of the card (the rest are files, links and the connections of the cabinets)
const INLINE = new Set([...PROFILE_FIELDS, ...INPUT_FIELDS].map((f) => f.key).filter((k) => !['competitor_sites', 'cabinet', 'cabinet_meta', 'cabinet_google'].includes(k))); // a cabinet is a connection (the section «Основне»), not a text
export const canFillInline = (key) => INLINE.has(key);
// the fields that the agents themselves can fill by a button (the dossier and the strategy): a team reads them when they exist
export const AI_FILLABLE = new Set(['business', 'audience', 'competitors', 'strategy']);

const channelsOf = (accounts = []) => ['meta', 'google'].filter((p) => accounts.some((a) => a.platform === p));

// The roles of the creative department and of the team of the campaign that a team puts to work (for the check and the list of agents).
export function teamRoles(teamKey, accounts = []) {
  if (teamKey === 'creative') return CREATIVE_ROLES.map((r) => r.role);
  if (teamKey === 'analytics') return modeRoles('ads', channelsOf(accounts));
  return [];
}

// → { team, required: [{ key, label, agents, where, inline, ai }], recommended: [...], ok: no required field is missing, status: 'ready' | 'warn' | 'blocked' }
// ctx: { settings: the row of project_creative, assets, accounts: project_ad_accounts, project }
export function teamReadiness(teamKey, ctx = {}) {
  const { settings = {}, assets = [], accounts = [] } = ctx;
  const have = filledFields({ settings, assets, accounts });
  let miss;
  if (teamKey === 'reports') {
    // the report agent needs only the cabinets (the layout of the report is made in «Конструктор звіту» and has a default)
    miss = { required: have.has('cabinet') ? [] : [{ key: 'cabinet', label: FIELD_LABELS.cabinet, agents: ['Агент звітів'] }], recommended: [] };
  } else if (teamKey === 'analytics') {
    // without a cabinet there is nothing to read: one clear line instead of the lists of every analyst
    miss = have.has('cabinet') ? missingFor(teamRoles('analytics', accounts), have) : { required: [{ key: 'cabinet', label: FIELD_LABELS.cabinet, agents: ['Аналітики кабінетів'] }], recommended: [] };
  } else {
    // creatives: the agents of the chain that cannot work without a field (the department's analyst needs a cabinet but may be left out: it is optional)
    const roles = CREATIVE_ROLES.map((r) => r.role).filter((r) => r !== 'creative_analyst' && r !== 'creative_scout');
    miss = missingFor(roles, have);
  }
  // the language of the client decides what language the texts for the client are written in: the creative and the report teams do not launch without it
  if ((teamKey === 'creative' || teamKey === 'reports') && !ctx.project?.client_language) miss.required = [{ key: 'client_language', label: 'Мова клієнта', agents: [teamKey === 'reports' ? 'Агент звітів' : 'Усі агенти креативів'] }, ...miss.required];
  const decorate = (x) => ({ ...x, where: whereToFill(x.key), inline: canFillInline(x.key), ai: AI_FILLABLE.has(x.key) });
  const required = miss.required.map(decorate);
  const recommended = miss.recommended.map(decorate);
  return { team: teamKey, required, recommended, ok: required.length === 0, status: required.length ? 'blocked' : recommended.length ? 'warn' : 'ready' };
}

// ---- the teams of a project as they run now. campaigns: ag_campaigns rows of the project; agent: the row of project_agents (or null)
// → { teams: [{ key, def, state: 'none' | 'running' | 'paused', campaign?, agent? }], running } for the three teams
export function teamsOf({ campaigns = [], agent = null } = {}) {
  const alive = campaigns.filter((c) => ['active', 'paused'].includes(c.status));
  const byMode = (mode) => alive.find((c) => (c.config?.mode || 'full') === mode) || null;
  const out = TEAMS.map((def) => {
    if (def.key === 'reports') {
      const on = !!agent;
      return { key: def.key, def, state: !on ? 'none' : agent.enabled ? 'running' : 'paused', agent: agent || null };
    }
    const c = byMode(def.mode);
    return { key: def.key, def, state: !c ? 'none' : c.status === 'active' ? 'running' : 'paused', campaign: c };
  });
  return { teams: out, running: out.filter((t) => t.state !== 'none').length };
}

// ---- the schedules a team starts with: the agents of the team of a campaign and how often each works. A person changes any of them in the launch.
// → [{ role, name, short, schedule: { weekday, time } | { everyDays, time } | null, optional, shared }]  shared: the schedule belongs to the whole creative department (all clients), it is not changed from here
const PRESETS = {
  meta_analyst: { everyDays: 3, time: '09:00' }, google_analyst: { everyDays: 3, time: '09:00' }, tracking_integrity: { everyDays: 3, time: '09:30' },
  meta_optimizer: null, google_optimizer: null, tiktok_analyst: { weekday: 1, time: '09:00' },
};
export function teamAgentPlan(teamKey, accounts = []) {
  if (teamKey === 'analytics') {
    return teamRoles('analytics', accounts).map((role) => {
      const def = CAMPAIGN_ROLES.find((r) => r.role === role);
      return { role, name: def.name, short: def.short, schedule: role in PRESETS ? PRESETS[role] : def.schedule || null, runsAfter: def.trigger === 'upstream', optional: false };
    });
  }
  if (teamKey === 'creative') {
    return CREATIVE_ROLES.map((def) => ({ role: def.role, name: def.name, short: def.short, schedule: def.role === 'creative_analyst' ? def.schedule || null : null, shared: def.role === 'creative_analyst', runsAfter: def.trigger === 'request', optional: CREATIVE_OPTIONAL.includes(def.role), required: CREATIVE_REQUIRED.includes(def.role) }));
  }
  return [];
}

// How many times a schedule starts an agent in 30 days.
export function runsPerMonth(schedule) {
  if (schedule?.weekdays?.length) return Math.round(4.3 * schedule.weekdays.length * 10) / 10;
  if (schedule?.weekday) return 4.3;
  if (Number(schedule?.everyDays) >= 1) return Math.round((30 / Number(schedule.everyDays)) * 10) / 10;
  return 0;
}

// ≈ $ per month of the agents of a team (a rough price from the average of one run; the pictures of Higgsfield are paid apart, by request, and only after the person confirms the price).
// plan: teamAgentPlan with the schedules chosen. An agent that runs after another one (no schedule of its own) works as often as the agents it waits for.
export function estimateMonthly(teamKey, plan = []) {
  if (teamKey === 'reports') return { usd: 1.2, text: 'тижневі й місячні звіти: приблизно 4 тижневих і 1 місячний на місяць' };
  if (teamKey === 'creative') {
    const runs = runsPerMonth(plan[0]?.schedule);
    if (runs) return { usd: Math.round(runs * 0.3 * 100) / 100, runs: Math.round(runs), text: `приблизно ${Math.round(runs)} запусків на місяць за розкладом (≈ $0.3 за запуск агентів); картинки Higgsfield (≈ $0.2 за штуку) окремо, в межах ліміту на завдання` };
    return { usd: 0, text: 'залежить від кількості запусків: кожен коштує за виклики агентів приблизно $0.5–1, картинки Higgsfield (≈ $0.2 за штуку) окремо, в межах ліміту на завдання' };
  }
  const own = plan.filter((p) => p.schedule && p.enabled !== false);
  const base = own.reduce((s, p) => s + runsPerMonth(p.schedule), 0);
  const chained = plan.filter((p) => !p.schedule && p.runsAfter && p.enabled !== false);
  const perChain = own.length ? base / own.length : 0; // a chained agent works about as often as an average analyst
  const runs = base + chained.length * perChain;
  return { usd: Math.round(runs * COST_PER_AGENT_RUN * 100) / 100, runs: Math.round(runs), text: `приблизно ${Math.round(runs)} запусків агентів на місяць` };
}

export const describePlanSchedule = (s) => describeSchedule(s) || 'за ланцюжком: після агентів, від яких залежить';
