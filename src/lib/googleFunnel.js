// The funnel of a Google Ads report (owner, 2026-11-17, variant B): Meta gives the stages of the store's path (view → cart → checkout) as ready columns,
// Google has none: there are only «conversion actions» the site sends. So for EACH stage the manager picks ONE conversion action of the account
// (the layout keeps its name), and the stage's number is that action's count for the period. One action per stage means nothing is counted twice.
// The sale is the standard «purchases» number of the report, as in Meta's funnel.
// Pure code (the server uses it too): the picked actions travel to the cabinet call as tokens in the platform's `columns` list (`fn:<step>:<action name>`),
// so no call signature along the way (builder, period report, agent run) has to change.
import { count } from './metaColumns.js';

const G = 'Воронка сайту';

export const GOOGLE_FUNNEL_STEPS = [
  { id: 'view', metric: 'mx_g_fn_view', label: 'Перегляд товару', en: 'Product view' },
  { id: 'cart', metric: 'mx_g_fn_cart', label: 'Додано в кошик', en: 'Add to cart' },
  { id: 'checkout', metric: 'mx_g_fn_checkout', label: 'Оформлення замовлення', en: 'Checkout' },
];

// the stage metrics (not in the column picker: they exist only for the funnel); each reads its count x_g_fn_<id>
export const GOOGLE_FUNNEL_METRICS = GOOGLE_FUNNEL_STEPS.map((s) => count(`g_fn_${s.id}`, G, s.label, s.en));
export const GOOGLE_FUNNEL_STAGES = [...GOOGLE_FUNNEL_STEPS.map((s) => s.metric), 'purchases'];
export const isGoogleFunnelMetric = (key) => GOOGLE_FUNNEL_STEPS.some((s) => s.metric === key);
export const googleFunnelCountKey = (id) => `x_g_fn_${id}`;

const STEP_IDS = GOOGLE_FUNNEL_STEPS.map((s) => s.id);
const MAX_NAME = 120;

// what is stored in the layout ({ view: 'Name', ... }) → only known steps with a non-empty name
export function cleanFunnelActions(raw) {
  const out = {};
  if (raw && typeof raw === 'object') STEP_IDS.forEach((id) => { const n = String(raw[id] ?? '').trim().slice(0, MAX_NAME); if (n) out[id] = n; });
  return out;
}

// the chosen actions → tokens for the `columns` list of the platform call
export const funnelTokens = (actions) => STEP_IDS.filter((id) => cleanFunnelActions(actions)[id]).map((id) => `fn:${id}:${cleanFunnelActions(actions)[id]}`);

// a `columns` list → { keys: the real column keys, actions: the chosen actions }
export function splitFunnelTokens(columns) {
  const keys = [];
  const actions = {};
  (Array.isArray(columns) ? columns : []).forEach((c) => {
    const m = typeof c === 'string' ? /^fn:(view|cart|checkout):(.+)$/s.exec(c) : null;
    if (m) { const n = m[2].trim().slice(0, MAX_NAME); if (n) actions[m[1]] = n; } else keys.push(c);
  });
  return { keys, actions };
}

// the layout's columns + its funnel → what to ask the platform for (the tokens are added only for an enabled Google funnel with picked actions)
export function withFunnelTokens(columns, funnel) {
  const list = Array.isArray(columns) ? columns : [];
  return funnel && funnel.enabled && funnel.actions ? [...list, ...funnelTokens(funnel.actions)] : list;
}

// the same for a { platform: [keys] } map, given the layouts { platform: layout }: Google gets the tokens of its layout's funnel
export const columnsWithFunnels = (columns, layouts) => ({ ...(columns || {}), ...(layouts?.google ? { google: withFunnelTokens(columns?.google, layouts.google.funnel) } : {}) });

// rows of the account by conversion action ({ name, conversions }) → { x_g_fn_<step>: count } for the steps that have an action
export function funnelCountsFromRows(rows, actions) {
  const chosen = cleanFunnelActions(actions);
  const out = {};
  STEP_IDS.forEach((id) => {
    if (!chosen[id]) return;
    const sum = (rows || []).filter((r) => String(r.name || '').trim() === chosen[id]).reduce((s, r) => s + Number(r.conversions || 0), 0);
    out[googleFunnelCountKey(id)] = Math.round(sum * 100) / 100;
  });
  return out;
}
