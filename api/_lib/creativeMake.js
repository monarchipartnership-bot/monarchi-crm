// The creative maker's pictures: the rows of ag_creatives (one per concept and format, with the prompt and the reference pictures) are sent to Higgsfield,
// followed until they are ready, and copied into our storage. Money is spent only here, so:
//   - the price of every picture is ASKED FIRST (the estimate is free) and recorded as the cost of the creative;
//   - one request may spend at most the limit of the maker agent (setting «Ліміт витрат Higgsfield на один запит», $3 by default): what does not fit
//     stays «planned»;
//   - a failed or moderated picture is not charged by Higgsfield, so its recorded cost goes back to 0;
//   - the whole run can first be only an estimate (estimateOnly), which the page shows to the person before anything is spent.
// The generator is handed in (ctx.hfImage; the real one when its keys and model are set on the server), so tests run it with a stand-in.
import * as hfReal from './hfImage.js';
import { CAP_MESSAGE, cappedCampaigns } from './campaignCycles.js';
import { creativeAutoOf } from '../../src/lib/agents/creativeTeam.js';

export const DEFAULT_LIMIT_USD = 3;
const STALE_MS = 40 * 60 * 1000; // a picture that is still «producing» after this long is given up
const iso = (d) => new Date(d).toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const round = (n) => Math.round(n * 10000) / 10000;

const hfOf = (ctx) => (ctx.hfImage === undefined ? (hfReal.isConfigured() ? hfReal : null) : ctx.hfImage);
export const generatorState = (ctx) => (hfOf(ctx) ? { ready: true, missing: [] } : { ready: false, missing: hfReal.missingConfig() });

async function makerConfig(db) {
  const a = (await db.from('ag_agents').select('config').eq('team', 'creative').eq('role', 'creative_maker').maybeSingle()).data;
  return a?.config || {};
}
export const limitOf = (cfg = {}) => (Number(cfg.max_usd) > 0 ? Number(cfg.max_usd) : DEFAULT_LIMIT_USD);

const refsOf = (row) => (row.hf?.references || []).map((r) => r.url).filter(Boolean);
// A picture the person returned is made again with their comment added to the prompt (the comments of the earlier rounds stay in it too).
export const reworkNotes = (row) => [...(Array.isArray(row.hf?.rework) ? row.hf.rework.map((r) => r?.note) : []), row.status === 'rejected' ? row.note : null].map((n) => String(n || '').trim()).filter(Boolean).slice(-3);
export const promptOf = (row) => { const notes = reworkNotes(row); return notes.length ? `${row.prompt}\n\nRevision requested by the manager (apply it, keep everything else): ${notes.join(' | ')}` : row.prompt; };

// Sends the pictures of a request to Higgsfield. ids: only these creatives (any state but «producing»: this is how one is made again); without ids all
// the «planned» and «failed» ones. → { ok, estimateUsd, count, submitted, skipped, failed, spent, limit } or { ok: false, configured: false, missing }.
export async function generateCreatives(ctx, requestId, { ids = null, estimateOnly = false } = {}) {
  const { db } = ctx;
  const hf = hfOf(ctx);
  if (!hf) return { ok: false, configured: false, missing: hfReal.missingConfig(), error: 'Higgsfield не налаштовано на сервері.' };
  const req = must(await db.from('ag_creative_requests').select('id, status, campaign_id, brief').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new Error('Запит не знайдено.');
  if (!estimateOnly && (await cappedCampaigns(db)).has(String(req.campaign_id))) return { ok: false, capped: true, error: CAP_MESSAGE }; // the pictures cost real money: not over the cap
  // the cycle may carry its own limit (the form of the cycle, «Агент креативщик»); otherwise the limit of the agent
  const cycleMax = Number(req.brief?.agent_settings?.creative_maker?.max_usd);
  const teamMax = creativeAutoOf((await db.from('ag_campaigns').select('config').eq('id', req.campaign_id).maybeSingle()).data).maxUsd; // the limit of one task of the team
  const limit = cycleMax > 0 ? cycleMax : teamMax || limitOf(await makerConfig(db));
  const rows = must(await db.from('ag_creatives').select('*').eq('request_id', requestId).order('id', { ascending: true }), 'creatives') || [];
  const want = ids ? rows.filter((r) => ids.includes(r.id) && r.status !== 'producing') : rows.filter((r) => ['planned', 'failed'].includes(r.status));
  let spent = round(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0)); // what this request already cost (a picture made again adds to its earlier price)
  const profile = hfReal.profileFromEnv();
  const out = { ok: true, estimateUsd: 0, count: 0, submitted: 0, skipped: [], failed: [], spent: 0, limit };
  for (const row of want) {
    const request = hfReal.buildImageRequest({ prompt: promptOf(row), negative_prompt: row.negative_prompt, ratio: row.ratio, references: refsOf(row) }, profile);
    let usd;
    try { usd = await hf.estimate({ request }); } catch (e) {
      if (!estimateOnly) must(await db.from('ag_creatives').update({ status: 'failed', note: String(e.message || e).slice(0, 300), updated_at: iso(ctx.now?.() || new Date()) }).eq('id', row.id), 'creative');
      out.failed.push({ id: row.id, error: String(e.message || e) });
      continue;
    }
    if (spent + usd > limit + 1e-9) { out.skipped.push(row.id); continue; }
    spent = round(spent + usd);
    out.estimateUsd = round(out.estimateUsd + usd);
    out.count += 1;
    if (estimateOnly) continue;
    const n = (row.generations || 0) + 1;
    try {
      const job = await hf.submit({ request, key: `creative-${row.id}-g${n}` });
      const now = iso(ctx.now?.() || new Date());
      must(await db.from('ag_creatives').update({
        status: 'producing', cost_usd: round(Number(row.cost_usd || 0) + usd), generations: n, note: null, updated_at: now,
        final_url: null, final_path: null, // the picture with the words over it belonged to the earlier version
        hf: { ...(row.hf || {}), ...(row.status === 'rejected' && String(row.note || '').trim() ? { rework: [...(Array.isArray(row.hf?.rework) ? row.hf.rework : []), { note: String(row.note).trim().slice(0, 600), at: now }].slice(-5) } : {}), model: request.path, job_id: job.jobId, status_url: job.statusUrl, estimate_usd: usd, charged_before: Number(row.cost_usd || 0), submitted_at: now, finished_at: null },
      }).eq('id', row.id), 'creative');
      out.submitted += 1;
      await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: requestId, campaign_id: req.campaign_id, usd, kind: 'generation', model: request.path, job_id: job.jobId }); // the ledger of the agent page
    } catch (e) {
      spent = round(spent - usd);
      out.estimateUsd = round(out.estimateUsd - usd);
      out.count -= 1;
      must(await db.from('ag_creatives').update({ status: 'failed', note: String(e.message || e).slice(0, 300), updated_at: iso(ctx.now?.() || new Date()) }).eq('id', row.id), 'creative');
      out.failed.push({ id: row.id, error: String(e.message || e) });
    }
  }
  out.spent = spent;
  return out;
}

// Looks at the pictures that are being made: a ready one is copied into our storage and goes to the person's review, a failed one is marked (and not charged).
export async function pollCreatives(ctx, { requestId = null } = {}) {
  const hf = hfOf(ctx);
  if (!hf) return 0;
  const { db } = ctx;
  let q = db.from('ag_creatives').select('*').eq('status', 'producing');
  if (requestId) q = q.eq('request_id', requestId);
  const rows = must(await q.order('id', { ascending: true }).limit(40), 'creatives') || [];
  let changed = 0;
  const now = iso(ctx.now?.() || new Date());
  const campaigns = new Map();
  const campaignOf = async (rid) => {
    if (!campaigns.has(rid)) campaigns.set(rid, (await db.from('ag_creative_requests').select('campaign_id').eq('id', rid).maybeSingle()).data?.campaign_id ?? null);
    return campaigns.get(rid);
  };
  for (const row of rows) {
    const gen = row.hf || {};
    if (!gen.status_url) continue;
    const timedOut = gen.submitted_at && new Date(now).getTime() - new Date(gen.submitted_at).getTime() > STALE_MS;
    let r;
    try { r = await hf.check({ statusUrl: gen.status_url }); } catch { r = { state: 'pending' }; }
    if (r.state === 'ready') {
      const saved = await hf.persist({ db, url: r.url, requestId: row.request_id, creativeId: row.id });
      must(await db.from('ag_creatives').update({ status: 'review', asset_url: saved.url, asset_path: saved.path || null, hf: { ...gen, finished_at: now }, updated_at: now }).eq('id', row.id), 'creative');
      changed += 1;
    } else if (r.state === 'failed' || timedOut) {
      // the provider refused it (failed, moderated, canceled): it does not charge, so the price of this generation goes back. A picture that only
      // took too long may still be made and charged: its price stays.
      const refused = r.state === 'failed';
      must(await db.from('ag_creatives').update({ status: 'failed', cost_usd: refused ? Number(gen.charged_before || 0) : row.cost_usd, note: r.error || 'Higgsfield не відповів вчасно: картинку не отримано.', hf: { ...gen, finished_at: now }, updated_at: now }).eq('id', row.id), 'creative');
      if (refused && Number(gen.estimate_usd) > 0) await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: row.request_id, campaign_id: await campaignOf(row.request_id), usd: -Number(gen.estimate_usd), kind: 'refund', model: gen.model || null, job_id: gen.job_id || null });
      changed += 1;
    }
  }
  return changed;
}
