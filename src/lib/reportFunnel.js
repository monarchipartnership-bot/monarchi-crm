// The funnel of a report (a request of the management, 2026-11-02): product view → cart → checkout → sale as one picture, so the client sees where the stages sag.
// Pure code over the totals of a report: the stages are metric keys, each stage's number comes from the same calculation the metric table uses.
import { computeMetric } from './reportMetrics.js';
import { cleanFunnelActions } from './googleFunnel.js';

// The metrics that can be a stage (a store's path), in the order of the path. `purchases` is the sale; the others are the extra columns of the Meta cabinet.
export const FUNNEL_CANDIDATES = ['mx_landing_page_views', 'mx_view_content', 'mx_add_to_cart', 'mx_initiate_checkout', 'mx_add_payment_info', 'purchases'];
export const DEFAULT_FUNNEL_STAGES = ['mx_view_content', 'mx_add_to_cart', 'mx_initiate_checkout', 'purchases'];
export const MAX_FUNNEL_STAGES = 7;

const round1 = (n) => Math.round(n * 10) / 10;

// The layout's funnel setting → { enabled, stages, actions? } that is safe to use. Unknown keys and repeats are dropped; fewer than two stages is no funnel.
export function normalizeFunnel(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const stages = [...new Set((Array.isArray(r.stages) ? r.stages : DEFAULT_FUNNEL_STAGES).map((k) => String(k || '').trim()).filter((k) => /^[A-Za-z0-9_]+$/.test(k)))].slice(0, MAX_FUNNEL_STAGES);
  const actions = cleanFunnelActions(r.actions); // Google only: the conversion action chosen for each stage (see googleFunnel.js)
  return { enabled: r.enabled === true && stages.length >= 2, stages: stages.length >= 2 ? stages : [...DEFAULT_FUNNEL_STAGES], ...(Object.keys(actions).length ? { actions } : {}) };
}

// The extra columns the funnel needs from the cabinet (everything but the sale, which is a base field).
export const funnelColumns = (stages = []) => stages.filter((k) => k.startsWith('mx_'));

// total: the totals of the report (as the metric table reads them); prev: the same for the previous period or null; labelOf(key) → the name of a stage.
// → null when there is nothing to draw (fewer than two stages have a number), else
//   { steps: [{ key, label, value, share (0..1 of the widest stage), fromPrev (% of the previous stage, null for the first), fromFirst (% of the first), lost (people lost since the previous stage),
//               delta (% against the previous period or null), weakest }], weakest: key of the stage with the lowest step conversion, skipped: [keys without a number] }
export function funnelModel({ stages = DEFAULT_FUNNEL_STAGES, total, prev = null, custom = [], labelOf = (k) => k }) {
  if (!total) return null;
  const all = stages.map((key) => ({ key, value: computeMetric(key, total, custom) }));
  const skipped = all.filter((s) => s.value == null || !Number.isFinite(s.value)).map((s) => s.key);
  const have = all.filter((s) => !skipped.includes(s.key));
  if (have.length < 2) return null;
  const top = Math.max(...have.map((s) => s.value));
  const steps = have.map((s, i) => {
    const before = i > 0 ? have[i - 1].value : null;
    const was = prev ? computeMetric(s.key, prev, custom) : null;
    return {
      key: s.key, label: labelOf(s.key), value: s.value, share: top > 0 ? s.value / top : 0,
      fromPrev: before == null ? null : before > 0 ? round1((s.value / before) * 100) : null,
      fromFirst: i === 0 ? 100 : have[0].value > 0 ? round1((s.value / have[0].value) * 100) : null,
      lost: before == null ? null : Math.max(0, before - s.value),
      delta: was != null && was > 0 ? round1(((s.value - was) / was) * 100) : null,
      weakest: false,
    };
  });
  // the weakest step is the one where the smallest part of the previous stage goes on (only when there is a real difference to show)
  const rated = steps.filter((s) => s.fromPrev != null);
  const worst = rated.length > 1 ? rated.reduce((a, b) => (b.fromPrev < a.fromPrev ? b : a)) : null;
  if (worst) worst.weakest = true;
  return { steps, weakest: worst?.key ?? null, skipped };
}
