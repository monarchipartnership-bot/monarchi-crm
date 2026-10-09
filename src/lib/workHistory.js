// "What was done" from the ad accounts' own change history. Two steps:
//   1. collectFacts(): reads the change log of every linked account, throws away what the
//      platforms do by themselves (delivery events, billing, auto-audiences, review states,
//      technical toggles) and turns what people really did into short plain facts,
//      grouped, with counts. Pure code: it never invents anything.
//   2. /api/report-work-summary turns the facts into a client-friendly English list
//      (see api/report-work-summary.js); describeWork() below is the client side of it.
import { authedPost } from './adAccounts.js';

// English amounts for a client text: $30, $12.50, EUR 25.
function formatMoney(value, currency) {
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value); } catch { return String(value); }
}

const MAX_FACTS = 28;
const names = (list, n = 4) => {
  const uniq = [...new Set(list.filter(Boolean))];
  const shown = uniq.slice(0, n).map((x) => `"${x}"`).join(', ');
  return uniq.length > n ? `${shown} and ${uniq.length - n} more` : shown;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ----- Meta ---------------------------------------------------------------------------------
const SYSTEM_ACTORS = new Set(['meta', 'facebook', 'instagram', '']);
const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v || {}; } catch { return {}; } };

// The account UI language is Russian here: 'Активная' / 'Неактивная' / 'Архивирована'. Everything else
// (pending, in review, rejected) is a state Meta moves ads through by itself and is ignored.
function metaState(label) {
  const t = String(label || '').toLowerCase();
  if (t.startsWith('неактив') || t.includes('paused') || t.includes('приостан')) return 'paused';
  if (t.startsWith('актив') || t === 'active') return 'active';
  if (t.startsWith('архив') || t.includes('archiv')) return 'archived';
  return null;
}

// Minor units (cents) for the currencies Meta stores that way.
const metaAmount = (v, currency) => (Number(v) || 0) / (currency === 'JPY' || currency === 'KRW' ? 1 : 100);

export function metaFacts(items, currency = 'USD') {
  const humans = items.filter((i) => !SYSTEM_ACTORS.has(String(i.actor_name || '').toLowerCase()));
  const by = (type) => humans.filter((i) => i.event_type === type);
  const facts = [];

  // Created campaigns (with the daily budget they were created with)
  const camps = new Map();
  by('create_campaign_group').forEach((i) => {
    const x = parse(i.extra_data);
    const budget = x.new_value?.type === 'payment_amount' ? metaAmount(x.new_value.new_value, x.new_value.currency || currency) : null;
    if (!camps.has(i.object_name)) camps.set(i.object_name, budget);
  });
  camps.forEach((budget, name) => facts.push(`Meta: created the campaign "${name}"${budget ? ` with a daily budget of ${formatMoney(budget, currency)}` : ''}.`));

  const adsets = by('create_ad_set').map((i) => i.object_name);
  if (adsets.length) facts.push(`Meta: created ${plural(new Set(adsets).size, 'new ad set', 'new ad sets')}: ${names(adsets)}.`);

  const ads = by('create_ad').map((i) => i.object_name);
  if (ads.length) facts.push(`Meta: launched ${plural(new Set(ads).size, 'new ad', 'new ads')} (${names(ads)}).`);

  // Budget changes: first old value → last new value per object
  const budgets = new Map();
  [...by('update_ad_set_budget'), ...by('update_campaign_budget')].sort((a, b) => String(a.event_time).localeCompare(String(b.event_time))).forEach((i) => {
    const x = parse(i.extra_data);
    const o = x.old_value?.old_value ?? x.old_value;
    const n = x.new_value?.new_value ?? x.new_value;
    if (typeof n !== 'number') return;
    const cur = budgets.get(i.object_name) || { from: typeof o === 'number' ? o : null };
    cur.to = n;
    budgets.set(i.object_name, cur);
  });
  budgets.forEach((b, name) => {
    if (b.from === b.to) return;
    facts.push(`Meta: ${b.from != null ? `changed the daily budget of "${name}" from ${formatMoney(metaAmount(b.from, currency), currency)} to ${formatMoney(metaAmount(b.to, currency), currency)}` : `set the daily budget of "${name}" to ${formatMoney(metaAmount(b.to, currency), currency)}`}.`);
  });

  // On / off: only the final state of each object, ignoring the review states in between
  const runs = new Map();
  ['update_campaign_run_status', 'update_ad_set_run_status', 'update_ad_run_status'].forEach((t) => by(t).forEach((i) => runs.set(`${t}|${i.object_name}`, [...(runs.get(`${t}|${i.object_name}`) || []), i])));
  const KIND = { update_campaign_run_status: ['campaign', 'campaigns'], update_ad_set_run_status: ['ad set', 'ad sets'], update_ad_run_status: ['ad', 'ads'] };
  const paused = {};
  const resumed = {};
  runs.forEach((list, key) => {
    const sorted = [...list].sort((a, b) => String(a.event_time).localeCompare(String(b.event_time)));
    const states = [];
    sorted.forEach((i) => { const x = parse(i.extra_data); [metaState(x.old_value), metaState(x.new_value)].forEach((s) => s && states[states.length - 1] !== s && states.push(s)); });
    if (states.length < 2) return;
    const [type, name] = key.split('|');
    const last = states[states.length - 1];
    if (last === states[0]) return;
    if (last === 'paused') (paused[type] ||= []).push(name);
    else if (last === 'active' && states[0] === 'paused') (resumed[type] ||= []).push(name);
  });
  Object.entries(paused).forEach(([type, list]) => facts.push(`Meta: paused ${plural(list.length, KIND[type][0], KIND[type][1])}: ${names(list)}.`));
  Object.entries(resumed).forEach(([type, list]) => facts.push(`Meta: turned back on ${plural(list.length, KIND[type][0], KIND[type][1])}: ${names(list)}.`));

  const adsetTargeting = [...new Set(by('update_ad_set_target_spec').map((i) => i.object_name))];
  const adTargeting = [...new Set(by('update_ad_targets_spec').map((i) => i.object_name))];
  if (adsetTargeting.length) facts.push(`Meta: updated the audience targeting of ${plural(adsetTargeting.length, 'ad set', 'ad sets')} (${names(adsetTargeting)}).`);
  if (adTargeting.length) facts.push(`Meta: updated the targeting of ${plural(adTargeting.length, 'ad', 'ads')} (${names(adTargeting)}).`);

  const creatives = by('update_ad_creative').map((i) => i.object_name);
  if (creatives.length) facts.push(`Meta: updated the creatives of ${plural(new Set(creatives).size, 'ad', 'ads')} (${names(creatives)}).`);

  const images = by('add_images').length + by('edit_images').length;
  if (images) facts.push(`Meta: added or edited ${plural(images, 'image', 'images')} in the media library.`);

  by('update_ad_set_optimization_goal').forEach((i, idx, arr) => {
    if (arr.findIndex((o) => o.object_name === i.object_name) !== idx) return;
    const x = parse(i.extra_data);
    if (x.new_value) facts.push(`Meta: set the optimization goal of "${i.object_name}" to "${x.new_value}".`);
  });
  const bids = [...new Set(by('update_ad_set_bid_strategy').map((i) => i.object_name))];
  if (bids.length) facts.push(`Meta: changed the bid strategy of ${names(bids)}.`);

  [...by('update_ad_set_name'), ...by('update_campaign_name')].forEach((i) => {
    const x = parse(i.extra_data);
    if (x.old_value && x.new_value && x.old_value !== x.new_value) facts.push(`Meta: renamed "${x.old_value}" to "${x.new_value}".`);
  });
  return facts;
}

// ----- Google ---------------------------------------------------------------------------------
const G_TYPE = { BUDGET: 6, CAMPAIGN: 5, CRITERION: 8, ASSET: 14, CAMPAIGN_ASSET: 16 };
const G_OP = { CREATE: 2, UPDATE: 3, REMOVE: 4 };
const G_CHANNEL = { 2: 'Search', 3: 'Display', 4: 'Shopping', 6: 'Video', 10: 'Performance Max', 14: 'Demand Gen' };
const G_STATUS = { 2: 'enabled', 3: 'paused', 4: 'removed' };

export function googleFacts(items, currency = 'USD') {
  const facts = [];
  const of = (type, op) => items.filter((i) => i.type === type && i.operation === op);
  const fieldsOf = (i) => (Array.isArray(i.fields) ? i.fields.join('+') : String(i.fields || ''));

  // Budgets: first old value → last new value per campaign
  const budgets = new Map();
  [...of(G_TYPE.BUDGET, G_OP.UPDATE)].sort((a, b) => String(a.time).localeCompare(String(b.time))).forEach((i) => {
    if (!fieldsOf(i).includes('amount_micros')) return;
    const o = parse(i.old).campaign_budget?.amount_micros;
    const n = parse(i.next).campaign_budget?.amount_micros;
    if (n == null) return;
    const key = i.campaignName || 'a campaign';
    const cur = budgets.get(key) || { from: o != null ? o / 1e6 : null };
    cur.to = n / 1e6;
    budgets.set(key, cur);
  });
  budgets.forEach((b, name) => {
    if (b.from === b.to) return;
    facts.push(`Google Ads: ${b.from != null ? `changed the daily budget of "${name}" from ${formatMoney(b.from, currency)} to ${formatMoney(b.to, currency)}` : `set the daily budget of "${name}" to ${formatMoney(b.to, currency)}`}.`);
  });

  // New campaigns
  of(G_TYPE.CAMPAIGN, G_OP.CREATE).forEach((i) => {
    const c = parse(i.next).campaign || {};
    const kind = G_CHANNEL[c.advertising_channel_type];
    facts.push(`Google Ads: created ${i.campaignName ? `the campaign "${i.campaignName}"` : 'a new campaign'}${kind ? ` (${kind})` : ''}.`);
  });
  // Pauses / resumes
  const status = new Map();
  of(G_TYPE.CAMPAIGN, G_OP.UPDATE).forEach((i) => {
    const s = G_STATUS[parse(i.next).campaign?.status];
    if (fieldsOf(i).includes('status') && s) status.set(i.campaignName || 'a campaign', s);
  });
  const paused = [...status].filter(([, s]) => s === 'paused').map(([n]) => n);
  const enabled = [...status].filter(([, s]) => s === 'enabled').map(([n]) => n);
  if (paused.length) facts.push(`Google Ads: paused ${plural(paused.length, 'campaign', 'campaigns')}: ${names(paused)}.`);
  if (enabled.length) facts.push(`Google Ads: turned on ${plural(enabled.length, 'campaign', 'campaigns')}: ${names(enabled)}.`);

  // Keywords
  const kws = of(G_TYPE.CRITERION, G_OP.CREATE).map((i) => parse(i.next).campaign_criterion).filter((c) => c?.keyword?.text);
  const negative = kws.filter((c) => c.negative);
  const positive = kws.filter((c) => !c.negative);
  if (negative.length) {
    const camps = new Set(negative.map((c) => c.campaign)).size;
    facts.push(`Google Ads: added ${plural(negative.length, 'negative keyword', 'negative keywords')}${camps > 1 ? ` across ${camps} campaigns` : ''} to cut irrelevant traffic (for example ${names(negative.map((c) => c.keyword.text), 5)}).`);
  }
  if (positive.length) facts.push(`Google Ads: added ${plural(positive.length, 'keyword', 'keywords')} (for example ${names(positive.map((c) => c.keyword.text), 5)}).`);

  // Creative assets
  const assets = of(G_TYPE.ASSET, G_OP.CREATE);
  const texts = assets.map((i) => parse(i.next).asset?.text_asset?.text).filter(Boolean);
  const images = assets.map((i) => parse(i.next).asset?.name).filter(Boolean);
  const linked = of(G_TYPE.CAMPAIGN_ASSET, G_OP.CREATE).length;
  if (texts.length) facts.push(`Google Ads: created ${plural(texts.length, 'new headline or description', 'new headlines and descriptions')} (for example ${names(texts, 3)}).`);
  if (images.length) facts.push(`Google Ads: uploaded ${plural(images.length, 'new image', 'new images')} (${names(images, 3)}).`);
  if (linked) facts.push(`Google Ads: attached ${plural(linked, 'creative asset', 'creative assets')} (logos, images, headlines) to campaigns.`);
  return facts;
}

// ----- Reading + summarising ---------------------------------------------------------------------
// accounts: project_ad_accounts rows. Google keeps ~30 days of history, so older ranges skip it.
export async function collectFacts(accounts, from, to, post = authedPost) {
  const facts = [];
  const errors = {};
  const notes = [];
  await Promise.all(accounts.map(async (a) => {
    try {
      if (a.platform === 'meta') {
        const r = await post('/api/meta-ads-insights', { accountId: a.account_id, activities: true, timeRange: { since: from, until: to } });
        facts.push(...metaFacts(r.items || [], a.currency || 'USD'));
      } else if (a.platform === 'google') {
        const daysAgo = Math.floor((Date.now() - new Date(from + 'T00:00:00Z').getTime()) / 86400000);
        if (daysAgo > 29) { notes.push('Google Ads зберігає історію змін лише 30 днів, тому за цей період її немає.'); return; }
        const r = await post('/api/google-ads-accounts', { action: 'changes', customerId: a.account_id, from, to });
        facts.push(...googleFacts(r.items || [], a.currency || 'USD'));
      }
    } catch (e) {
      errors[a.platform] = e.message || 'Не вдалося прочитати історію змін.';
    }
  }));
  return { facts: facts.slice(0, MAX_FACTS), errors, notes };
}

// Facts → client-ready English bullets ("- ..." lines). Falls back to the facts themselves when the writer is unavailable.
export async function describeWork({ facts, projectName, note, from, to, periodType }, post = authedPost) {
  if (!facts.length) return { text: '', writer: 'none' };
  try {
    const r = await post('/api/report-work-summary', { action: 'describe', facts, projectName, note, from, to, periodType });
    if (r.text) return { text: r.text, writer: 'ai' };
  } catch { /* fall through to the plain list */ }
  return { text: facts.map((f) => '- ' + f.replace(/^(Meta|Google Ads): /, '')).join('\n'), writer: 'plain' };
}

// A month's list from the weekly lists already written for it.
export async function mergeWeeks({ weeks, projectName, note, from, to }, post = authedPost) {
  const texts = weeks.filter((w) => w.text?.trim());
  if (!texts.length) return { text: '', writer: 'none' };
  try {
    const r = await post('/api/report-work-summary', { action: 'merge', weeks: texts, projectName, note, from, to });
    if (r.text) return { text: r.text, writer: 'ai' };
  } catch { /* fall through */ }
  const lines = [];
  const seen = new Set();
  texts.forEach((w) => String(w.text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => { const k = l.toLowerCase(); if (!seen.has(k)) { seen.add(k); lines.push(l.startsWith('-') ? l : '- ' + l); } }));
  return { text: lines.join('\n'), writer: 'plain' };
}
