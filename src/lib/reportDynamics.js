// A neutral description of how the numbers moved, written by code from the report's own figures
// (never by the model, so it cannot invent a number or a reason). It is what the AI agent puts into
// «Conclusion»: it says WHAT changed and by how much, never whether that is good or bad, and never why.
// One paragraph per platform, starting with the platform's name ("Meta Ads: ..."); the presentation keeps
// only the paragraphs of its own platform.
import { computeMetric, deltaPct, metricMeta } from './reportMetrics.js';
import { fmtValue } from './presentation/buildDeck.js';

const STABLE_WITHIN = 2; // percent: smaller changes are called "stable"
const KEYS = {
  ecom: { totals: ['spend', 'revenue', 'purchases'], ratios: ['roas', 'cpp', 'aov', 'ctr', 'cpc'] },
  leadgen: { totals: ['spend', 'leads'], ratios: ['cpl', 'ctr', 'cpc'] },
};
const NAMES = { spend: 'ad spend', revenue: 'revenue', purchases: 'sales', leads: 'leads' };
const fmtDay =(iso) => iso.split('-').reverse().slice(0, 2).join('.');
const fmtPct = (n) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 1 });
const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function hadDelivery(total) {
  return Boolean(total) && ((total.spend || 0) > 0 || (total.impressions || 0) > 0 || (total.clicks || 0) > 0);
}

// platforms / previous: the report data ({ platforms }, { period, platforms }).
// names: { meta: 'Meta Ads', google: 'Google Ads' }; unequal: the two periods differ in length.
export function describeDynamics({ platforms, previous, kind = 'ecom', custom = [], names = {}, unequal = false }) {
  const set = KEYS[kind] || KEYS.ecom;
  const paragraphs = [];
  Object.entries(platforms || {}).forEach(([platform, p]) => {
    const label = names[platform] || platform;
    const cur = p.total;
    const currency = p.currency || 'USD';
    if (!hadDelivery(cur)) { paragraphs.push(`${label}: there was no ad delivery in this period.`); return; }
    const value = (key, base) => fmtValue(computeMetric(key, base, custom), metricMeta(key, custom).format, currency, 'en');
    const name = (key) => NAMES[key] || metricMeta(key, custom).en;
    const before = previous?.platforms?.[platform]?.total;

    if (!before || !hadDelivery(before)) {
      const parts = [`ad spend was ${value('spend', cur)}`];
      if (kind === 'leadgen') parts.push(`it brought ${value('leads', cur)} leads`);
      else parts.push(`it generated ${value('purchases', cur)} sales and ${value('revenue', cur)} in revenue`);
      const tail = kind === 'leadgen' ? `CPL was ${value('cpl', cur)}` : `ROAS was ${value('roas', cur)}`;
      paragraphs.push(`${label}: during the period, ${list(parts)}; ${tail}, and CTR was ${value('ctr', cur)}.`);
      return;
    }

    // Both periods have delivery: describe the change of each metric. When the periods differ in length
    // the sums are not comparable, so only the ratios (which do not depend on length) are compared.
    const keys = unequal ? set.ratios : [...set.totals, ...set.ratios];
    const up = [];
    const down = [];
    const flat = [];
    keys.forEach((key) => {
      const now = computeMetric(key, cur, custom);
      const was = computeMetric(key, before, custom);
      const delta = deltaPct(now, was);
      if (delta == null) return;
      if (Math.abs(delta) < STABLE_WITHIN) flat.push(name(key));
      else (delta > 0 ? up : down).push(`${name(key)} ${delta > 0 ? 'rose' : 'fell'} by ${fmtPct(delta)}% to ${value(key, cur)}`);
    });
    const range = `${fmtDay(previous.period.start)}–${fmtDay(previous.period.end)}`;
    const sentences = [];
    if (up.length) sentences.push(list(up));
    if (down.length) sentences.push(list(down));
    let text = sentences.length ? `compared with ${range}, ${sentences.join('; ')}.` : `compared with ${range}, the figures were broadly unchanged.`;
    if (flat.length) text += ` ${list(flat.map((f, i) => (i === 0 ? f.charAt(0).toUpperCase() + f.slice(1) : f)))} remained stable (within ${STABLE_WITHIN}%).`;
    if (unequal) text += ' The two periods differ in length, so only ratios are compared, not totals.';
    paragraphs.push(`${label}: ${text}`);
  });
  return paragraphs.join('\n');
}
