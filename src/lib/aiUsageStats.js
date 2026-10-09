// Turns the usage log (ai_calls) into the figures of the «Витрати» view. Pure code. Tokens are exact (they
// come from every API answer); dollars are an ESTIMATE from the price table (api/_lib/aiPricing.js), so
// they can differ a little from the Anthropic invoice. Days and months are cut on the Kyiv clock.
import { kyivInstant, kyivParts } from './agentSchedule.js';

// Names of the callers whose key is not a known agent's key (the server-side feature names).
export const CALLER_LABELS = {
  'report-work-summary': 'Текст «What was done» у звітах',
  'project-report': 'AI-агент проєктів',
  followup: 'Follow-up Generator',
  'chief-of-staff': 'AI Chief of Staff',
  'account-manager': 'AI Account Manager',
  'account-enrichment': 'Account Enrichment',
  'audience-research': 'Audience Research',
  'business-research': 'Business Research',
  'competitor-research': 'Competitor Research',
  'case-selector': 'Portfolio Case Selector',
  'cover-letter': 'Cover Letter Agent',
  'google-optimization': 'Google Optimization Agent',
  'job-post-analyzer': 'Job Post Analyzer',
  'lead-qualification': 'Lead Qualification Agent',
  'marketing-strategist': 'Marketing Strategist',
  'onboarding-meeting-coordinator': 'Client Onboarding & Meeting Coordinator',
  'performance-copywriter': 'Performance Copywriter',
  'quality-controller': 'AI Quality Controller',
  'reply-analyzer': 'Reply Analyzer',
  'task-orchestrator': 'Task Orchestrator',
  'ads-insights-analyst': 'Ads Insights Analyst',
  proxy: 'Інші виклики',
};

const round6 = (n) => Math.round(n * 1e6) / 1e6;
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayOf = (iso) => kyivParts(new Date(iso)).date;

// First instants of "today" and "this month" on the Kyiv clock.
export function windows(now = new Date()) {
  const k = kyivParts(now);
  return {
    today: kyivInstant(k.date, '00:00'),
    week: kyivInstant(addDays(k.date, -6), '00:00'), // today and the 6 days before it
    month: kyivInstant(k.date.slice(0, 8) + '01', '00:00'),
    todayDate: k.date,
  };
}

const blank = () => ({ calls: 0, ok: 0, failed: 0, retries: 0, inTokens: 0, outTokens: 0, cost: 0, ms: 0 });
function add(acc, c) {
  acc.calls += 1;
  if (c.status === 'ok') acc.ok += 1; else acc.failed += 1;
  acc.retries += c.retries || 0;
  acc.inTokens += (c.input_tokens || 0) + (c.cache_read_tokens || 0) + (c.cache_write_tokens || 0);
  acc.outTokens += c.output_tokens || 0;
  acc.cost = round6(acc.cost + Number(c.cost_usd || 0));
  acc.ms += c.duration_ms || 0;
  return acc;
}

// calls: ai_calls rows; names(key) → display name; projectName(id) → name.
export function summarize(calls, { now = new Date(), nameOf = (k) => CALLER_LABELS[k] || k, projectNameOf = (id) => `Проєкт ${id}` } = {}) {
  const w = windows(now);
  const total = { today: blank(), week: blank(), month: blank() };
  const byAgent = new Map();
  const byProject = new Map();
  const byDay = new Map();
  for (let i = 29; i >= 0; i -= 1) byDay.set(addDays(w.todayDate, -i), 0);
  const problems = [];

  calls.forEach((c) => {
    const at = new Date(c.created_at);
    if (at >= w.today) add(total.today, c);
    if (at >= w.week) add(total.week, c);
    const day = dayOf(c.created_at);
    if (byDay.has(day)) byDay.set(day, round6(byDay.get(day) + Number(c.cost_usd || 0)));
    if (at >= w.month) {
      add(total.month, c);
      const a = byAgent.get(c.agent_key) || { key: c.agent_key, ...blank() };
      byAgent.set(c.agent_key, add(a, c));
      if (c.project_id != null) {
        const p = byProject.get(c.project_id) || { id: c.project_id, ...blank() };
        byProject.set(c.project_id, add(p, c));
      }
    }
    if (c.status !== 'ok') problems.push(c);
  });

  const finish = (m) => m.map((x) => ({ ...x, avgMs: x.calls ? Math.round(x.ms / x.calls) : 0 }));
  return {
    total,
    byAgent: finish([...byAgent.values()]).map((x) => ({ ...x, name: nameOf(x.key) })).sort((a, b) => b.cost - a.cost),
    byProject: finish([...byProject.values()]).map((x) => ({ ...x, name: projectNameOf(x.id) })).sort((a, b) => b.cost - a.cost),
    byDay: [...byDay.entries()].map(([date, cost]) => ({ date, cost })),
    problems: problems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20),
    spent: { day: total.today.cost, month: total.month.cost },
  };
}

export const money = (n, digits = 2) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const tokens = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' млн' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' тис.' : String(n || 0));
