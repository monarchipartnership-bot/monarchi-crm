// The one way our server code talks to the model. Every agent and endpoint goes through callModel(), so:
//  - a transient failure (overload, rate limit, network) is retried with a wait, and the retries are counted;
//  - every call is recorded: who, which model, exact tokens, estimated dollars, retries, duration, outcome;
//  - spending limits are enforced BEFORE the call (per-call cap, per-day and per-month budgets);
//  - an answer with no text (the model used its whole allowance thinking) is an error with a reason, never a silent blank.
// Nothing here knows about Vercel or Supabase: the Anthropic SDK and the database are handed in, which is
// also how scripts/check-core.mjs tests it without a network.
import { costUsd, worstCaseUsd } from './aiPricing.js';

export class BudgetError extends Error {
  constructor(message, kind, details = {}) {
    super(message);
    this.name = 'BudgetError';
    this.kind = kind; // 'call' | 'day' | 'month'
    this.details = details;
  }
}

export class ModelError extends Error {
  constructor(message, { status = null, attempts = 1, reason = 'error' } = {}) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
    this.attempts = attempts;
    this.reason = reason; // 'empty' | 'rejected' | 'overloaded' | 'network' | 'error'
  }
}

// What is worth another try: the platform asking us to slow down or being briefly unavailable, and network failures.
const RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const headerOf = (err, name) => {
  const h = err?.headers;
  if (!h) return null;
  return typeof h.get === 'function' ? h.get(name) : h[name] ?? null;
};

// ----- Budget windows (the team works on Kyiv time) ---------------------------------------------------
function kyivOffset(date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Kyiv', timeZoneName: 'longOffset' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT+03:00';
  return part === 'GMT' ? '+00:00' : part.replace('GMT', '');
}
export function windowStart(period, now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // YYYY-MM-DD
  const day = period === 'month' ? ymd.slice(0, 8) + '01' : ymd;
  return new Date(`${day}T00:00:00${kyivOffset(new Date(`${day}T12:00:00Z`))}`).toISOString();
}

export function createModelClient({ getSdk, store, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), random = Math.random, now = () => new Date(), maxAttempts = 4, maxWaitMs = 30000, defaultCallCapUsd = 0.5 }) {
  async function safeRecord(row) {
    try { await store?.recordCall?.(row); } catch (e) { console.warn('ai_calls insert failed:', e?.message || e); }
  }

  // Refuses the call (throws BudgetError) when it could overshoot its cap or a period budget is already used up.
  async function checkBudgets({ agentKey, params, capUsd }) {
    const worst = worstCaseUsd(params.model, params);
    const cap = capUsd ?? defaultCallCapUsd;
    if (worst > cap) throw new BudgetError(`Запит міг би коштувати до $${worst.toFixed(2)}, ліміт на один запит $${cap.toFixed(2)}.`, 'call', { worst, cap });
    let limits = [];
    try { limits = (await store?.limits?.()) || []; } catch (e) { console.warn('ai_budgets read failed:', e?.message || e); }
    for (const lim of limits) {
      if (lim.scope !== 'global' && lim.scope !== `agent:${agentKey}`) continue;
      const since = windowStart(lim.period, now());
      let spent = 0;
      try { spent = (await store.spentSince(since, lim.scope === 'global' ? null : agentKey)) || 0; } catch (e) { console.warn('ai_calls sum failed:', e?.message || e); continue; }
      if (spent >= Number(lim.limit_usd)) {
        throw new BudgetError(`Досягнуто ${lim.period === 'month' ? 'місячний' : 'денний'} ліміт витрат (${lim.scope === 'global' ? 'усі агенти' : agentKey}): $${spent.toFixed(2)} з $${Number(lim.limit_usd).toFixed(2)}.`, lim.period, { spent, limit: Number(lim.limit_usd), scope: lim.scope });
      }
    }
  }

  // params: the Messages API request (model, max_tokens, system, messages, thinking, tools, ...).
  // → { message, text, usage, costUsd, retries, stopReason }
  async function callModel({ agentKey, projectId = null, runId = null, trigger = 'user', actor = null, params, capUsd }) {
    const started = Date.now();
    const base = { agent_key: agentKey, project_id: projectId, run_id: runId, trigger, actor, model: params.model };

    try {
      await checkBudgets({ agentKey, params, capUsd });
    } catch (e) {
      if (e instanceof BudgetError) await safeRecord({ ...base, status: 'budget_stopped', error: e.message, retries: 0, duration_ms: Date.now() - started });
      throw e;
    }

    let retries = 0;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const message = await getSdk().messages.create(params);
        const usage = message.usage || {};
        const cost = costUsd(params.model, usage);
        const blocks = message.content || [];
        const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        const usedTools = blocks.some((b) => b.type === 'tool_use');
        const row = {
          ...base, status: 'ok', input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0,
          cache_read_tokens: usage.cache_read_input_tokens || 0, cache_write_tokens: usage.cache_creation_input_tokens || 0,
          cost_usd: cost, retries, duration_ms: Date.now() - started, stop_reason: message.stop_reason || null,
        };
        if (!text && !usedTools) {
          const why = `Модель не повернула текст (stop_reason: ${message.stop_reason || '?'}, блоки: ${blocks.map((b) => b.type).join(',') || 'немає'}, токени: ${usage.output_tokens ?? '?'}).`;
          await safeRecord({ ...row, status: 'empty', error: why });
          throw new ModelError(why, { attempts: attempt, reason: 'empty' });
        }
        await safeRecord(row);
        return { message, text, usage, costUsd: cost, retries, stopReason: message.stop_reason || null };
      } catch (e) {
        if (e instanceof ModelError) throw e;
        lastError = e;
        const status = e?.status ?? null;
        const retryable = status === null ? true : RETRYABLE.has(status);
        if (!retryable || attempt === maxAttempts) {
          const reason = status === null ? 'network' : status === 529 || status === 429 ? 'overloaded' : status >= 500 ? 'error' : 'rejected';
          const msg = `Помилка моделі${status ? ` (${status})` : ''}: ${e?.message || e}`;
          await safeRecord({ ...base, status: 'error', error: msg.slice(0, 500), retries, duration_ms: Date.now() - started });
          throw new ModelError(msg, { status, attempts: attempt, reason });
        }
        retries += 1;
        const asked = Number(headerOf(e, 'retry-after'));
        const wait = Math.min(maxWaitMs, Number.isFinite(asked) && asked > 0 ? asked * 1000 : Math.round(1000 * 1.8 ** attempt + random() * 500));
        await sleep(wait);
      }
    }
    throw new ModelError(`Помилка моделі: ${lastError?.message || 'невідомо'}`, { attempts: maxAttempts });
  }

  return { callModel };
}
