// The SEO agent's work: crawl the public pages of the site, run the checks (code), ask the model for a priority plan, save the audit.
// Used by the «Сайт» tab button (api/smm-seo-audit.js) and by the agent framework (the SEO agent's task). It only reads the site.
// The model is handed in (the shared client, or a recorder around it), so every call is logged.
import { BudgetError, ModelError } from './modelClient.js';
import { auditSite, crawlSite } from './seoAudit.js';
import { buildPlanPrompts, parsePlan } from './seoPlan.js';

const MODEL = 'claude-sonnet-5';

// → { id, summary, findings, plan, planError }. Throws an Error with .status (400 / 502 / 500) and a readable message.
export async function runSeoAudit({ db, model, email, url, trigger = 'user', crawl = crawlSite, traffic = [] }) {
  let crawled;
  try { crawled = await crawl(url); } catch (e) { const err = new Error(e.message); err.status = 400; throw err; }
  if (!crawled.pages.length) { const err = new Error('Не вдалося прочитати жодної сторінки сайту.'); err.status = 502; throw err; }
  const audit = auditSite(crawled.pages, crawled.ctx);

  // The model writes the plan; if it cannot, the audit (all of the checks) is still saved and shown.
  let plan = null;
  let planError = null;
  try {
    const { system, user } = buildPlanPrompts(url, audit, crawled.pages, new Map(), traffic);
    const result = await model.callModel({ agentKey: 'smm-seo', trigger, actor: email, params: { model: MODEL, max_tokens: 2600, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] } });
    plan = parsePlan(result.text);
    if (!plan) planError = 'Модель не повернула придатний план. Результати перевірок збережено.';
  } catch (e) {
    planError = e instanceof BudgetError ? e.message : e instanceof ModelError ? e.message : 'Не вдалося скласти план: ' + e.message;
  }

  const pagesLite = crawled.pages.map((p) => ({ url: p.url, status: p.status, ms: p.ms, title: p.title, description: p.description, h1: p.h1[0] || '', words: p.words }));
  const { data: saved, error } = await db.from('smm_site_audits').insert({ site_url: url, summary: audit.summary, findings: audit.findings, pages: pagesLite, plan, error: planError, created_by: email }).select('id, created_at').single();
  if (error) { const err = new Error('Не вдалося зберегти аудит: ' + error.message); err.status = 500; throw err; }
  return { id: saved.id, summary: audit.summary, findings: audit.findings, plan, planError };
}
