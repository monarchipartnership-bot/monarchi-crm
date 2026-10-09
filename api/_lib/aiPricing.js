// What a model call costs. Tokens are exact (every API answer reports them); dollars are an ESTIMATE from
// this table, so the figures in the CRM can differ a little from the Anthropic invoice. Keep the table in
// sync with https://platform.claude.com/docs/en/about-claude/pricing — prices below were taken from the
// Claude API reference cached on 2026-10-06. Anthropic's usage page stays the source of truth.
// Prices are USD per million tokens.
export const PRICES = {
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25 },
  'claude-fable-5': { in: 10, out: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2 },
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { in: 5, out: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { in: 3, out: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1 },
};

// A model missing from the table is priced like the most expensive one, so a budget can only err on the safe side.
const UNKNOWN = PRICES['claude-fable-5-1'];
const CACHE_WRITE_FACTOR = 1.25; // writing to the prompt cache costs 1.25x the input price (5-minute cache)

export function priceFor(model) {
  const p = PRICES[model];
  return { ...(p || UNKNOWN), known: Boolean(p) };
}

// usage: the `usage` object of a Messages API answer.
export function costUsd(model, usage = {}) {
  const p = priceFor(model);
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0; // includes thinking tokens: they are billed as output
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheWrite = usage.cache_creation_input_tokens || 0;
  const usd = (input * p.in + output * p.out + cacheRead * p.cacheRead + cacheWrite * p.in * CACHE_WRITE_FACTOR) / 1e6;
  return Math.round(usd * 1e6) / 1e6;
}

// The most a call could cost before it is sent: the prompt (estimated from its length) plus the whole
// max_tokens allowance as output. Used to refuse a call that could exceed its cap.
export function worstCaseUsd(model, params) {
  const p = priceFor(model);
  const chars = JSON.stringify([params.system || '', params.messages || [], params.tools || []]).length;
  const inputTokens = Math.ceil(chars / 2.5); // 2.5 chars per token is deliberately pessimistic (Cyrillic, JSON)
  return Math.round(((inputTokens * p.in + (params.max_tokens || 0) * p.out) / 1e6) * 1e6) / 1e6;
}
