// The registry of agent handlers. Every skill of the five agents has a handler; for now they are STAND-INS that write a marked placeholder
// (so the whole chain can be run and tested). The real agents of steps A4-A10 replace them one by one with createHandlers({ researcher: { audit: realAudit } }).
// A handler receives { run, project, ctx } and returns:
//   writes:      [{ key, body, content, sources }]  versions of dossier sections written by the agent
//   stateUpdate: { has_data: true }                  facts for the state of the project
//   approvals:   [{ kind, subject }]                 approvals the run asks for (for example «changes» from the optimiser)
//   steps:       [{ title, status, detail }]         the live steps for the manager
//   output, costUsd
import { unitEconomy } from './skills/unitEconomyAgent.js';
import { intake } from './skills/intake.js';
import { audit } from './skills/auditAgent.js';
import { site } from './skills/siteAgent.js';
import { audience } from './skills/audienceAgent.js';
import { competitors } from './skills/competitorsAgent.js';
const w = (key, body) => ({ key, body: `[заглушка] ${body}`, content: { stub: true }, sources: [] });
const done = (extra = {}) => async () => ({ output: { stub: true }, steps: [{ title: 'Виконано (заглушка)' }], ...extra });

export const STUBS = {
  researcher: {
    intake: async ({ ctx }) => ({ stateUpdate: { has_data: ctx.stubHasData ?? true }, steps: [{ title: 'Перевірено, чи є дані в кабінетах (заглушка)' }] }),
    audit: done({ writes: [w('audit', 'Аудит')] }),
    site: done({ writes: [w('site', 'Рекомендації по сайту')] }),
    audience: done({ writes: [w('audience', 'Цільова аудиторія')] }),
    unit_economy: done({ writes: [w('unit_economy', 'Unit Economy')] }),
    competitors: done({ writes: [w('competitors', 'Ринок і конкуренти')] }),
  },
  creator: {
    materials_ideas: done({ writes: [w('materials', 'Матеріали клієнта'), w('ideas', 'Банк ідей')] }),
    first_creatives: done({ output: { stub: true, creatives: 0 } }),
  },
  strategist: {
    strategy: async ({ run }) => ({ writes: [w('strategy', run.input?.rework_of ? 'Стратегія (доопрацьована)' : 'Стратегія')], steps: [{ title: 'Стратегію складено (заглушка)' }] }),
    monthly_plan: done({ writes: [w('monthly_plan', 'Місячний план')] }),
  },
  mediabuyer: {
    launch: done({ output: { stub: true, snapshot: 'stub' } }),
    optimize: done({ output: { stub: true, actions: 0 } }),
  },
  support: {
    onboarding: done(),
    monthly_report: done(),
  },
};

// The real agents built so far. The cron door (api/wf-tick.js) uses them; the tests of the orchestrator use the stand-ins only.
export const REAL = { researcher: { unit_economy: unitEconomy, intake, audit, site, audience, competitors } };
export function createRealHandlers(overrides = {}) { return createHandlers({ ...REAL, researcher: { ...REAL.researcher, ...(overrides.researcher || {}) }, ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== 'researcher')) }); }

export function createHandlers(overrides = {}) {
  const out = {};
  for (const agent of Object.keys(STUBS)) out[agent] = { ...STUBS[agent], ...(overrides[agent] || {}) };
  return out;
}
