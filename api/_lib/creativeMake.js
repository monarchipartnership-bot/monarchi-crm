// The creative maker's pictures: the rows of ag_creatives (one per concept and format, with the prompt and the reference pictures) are sent to Higgsfield,
// followed until they are ready, and copied into our storage. Money is spent only here, so:
//   - the price of every picture is ASKED FIRST (the estimate is free) and recorded as the cost of the creative;
//   - one request may spend at most the limit of the maker agent (setting «Ліміт витрат Higgsfield на один запит», $3 by default): what does not fit
//     stays «planned»;
//   - a failed or moderated picture is not charged by Higgsfield, so its recorded cost goes back to 0;
//   - the whole run can first be only an estimate (estimateOnly), which the page shows to the person before anything is spent.
// The generator is handed in (ctx.hfImage; the real one when its keys and model are set on the server), so tests run it with a stand-in.
import * as hfReal from './hfImage.js';
import * as hfVideoReal from './hfVideo.js';
import { CAP_MESSAGE, cappedCampaigns } from './campaignCycles.js';
import { creativeAutoOf } from '../../src/lib/agents/creativeTeam.js';
import { LOOKS, LOOK_NEGATIVE, REAL_LOOKS, applyLook, cleanLook } from '../../src/lib/creatives/realism.js';
import { logStep } from './taskSteps.js';
import { applyText, inspectLater } from './creativeText.js';

export const DEFAULT_LIMIT_USD = 3;
const STALE_MS = 40 * 60 * 1000; // a picture that is still «producing» after this long is given up
const iso = (d) => new Date(d).toISOString();
const must = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const round = (n) => Math.round(n * 10000) / 10000;

const hfVideoOf = (ctx) => (ctx.hfVideo === undefined ? (hfVideoReal.videoConfigured() ? hfVideoReal.real : null) : ctx.hfVideo);
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
  if (!estimateOnly && ['paused', 'waiting'].includes(req.status)) return { ok: false, held: req.status, error: req.status === 'paused' ? 'Завдання на паузі: картинки не відправляються.' : 'Завдання чекає вашої відповіді: картинки не відправляються.' }; // step 3.7
  // the cycle may carry its own limit (the form of the cycle, «Агент креативщик»); otherwise the limit of the agent
  const cycleMax = Number(req.brief?.agent_settings?.creative_maker?.max_usd);
  const teamMax = creativeAutoOf((await db.from('ag_campaigns').select('config').eq('id', req.campaign_id).maybeSingle()).data).maxUsd; // the limit of one task of the team
  const limit = cycleMax > 0 ? cycleMax : teamMax || limitOf(await makerConfig(db));
  const rows = must(await db.from('ag_creatives').select('*').eq('request_id', requestId).order('id', { ascending: true }), 'creatives') || [];
  const want = ids ? rows.filter((r) => ids.includes(r.id) && r.status !== 'producing') : rows.filter((r) => ['planned', 'failed'].includes(r.status));
  let spent = round(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0)); // what this request already cost (a picture made again adds to its earlier price)
  const profile = hfReal.profileFromEnv();
  const out = { ok: true, estimateUsd: 0, count: 0, submitted: 0, skipped: [], failed: [], spent: 0, limit };
  const who = { request_id: requestId, campaign_id: req.campaign_id, role: 'creative_maker' };
  const label = (row) => `«${row.concept_name || row.concept_key}», ${row.ratio}`;
  const total = want.length;
  for (const [i, row] of want.entries()) {
    const request = hfReal.buildImageRequest({ prompt: promptOf(row), negative_prompt: row.negative_prompt, ratio: row.ratio, references: refsOf(row) }, profile);
    let usd;
    try { usd = await hf.estimate({ request }); } catch (e) {
      if (!estimateOnly) must(await db.from('ag_creatives').update({ status: 'failed', note: String(e.message || e).slice(0, 300), updated_at: iso(ctx.now?.() || new Date()) }).eq('id', row.id), 'creative');
      out.failed.push({ id: row.id, error: String(e.message || e) });
      continue;
    }
    if (spent + usd > limit + 1e-9) { out.skipped.push(row.id); if (!estimateOnly) await logStep(ctx, who, 'Картинка ' + (i + 1) + ' з ' + total + ' (' + label(row) + ') не вміщується в ліміт $' + limit + ': чекає підтвердження', 'info'); continue; }
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
      await logStep(ctx, who, 'Higgsfield: картинка ' + (i + 1) + ' з ' + total + ' (' + label(row) + ') відправлена, очікую результат', 'running');
      await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: requestId, campaign_id: req.campaign_id, usd, kind: 'generation', model: request.path, job_id: job.jobId }); // the ledger of the agent page
    } catch (e) {
      spent = round(spent - usd);
      out.estimateUsd = round(out.estimateUsd - usd);
      out.count -= 1;
      must(await db.from('ag_creatives').update({ status: 'failed', note: String(e.message || e).slice(0, 300), updated_at: iso(ctx.now?.() || new Date()) }).eq('id', row.id), 'creative');
      out.failed.push({ id: row.id, error: String(e.message || e) });
      await logStep(ctx, who, 'Higgsfield: картинка ' + (i + 1) + ' з ' + total + ' не відправилась: ' + String(e.message || e).slice(0, 120), 'failed');
    }
  }
  out.spent = spent;
  return out;
}

// A VIDEO from a finished picture (step 3.5): the picture is the first frame, the motion prompt says what moves; a short clip (3..10 s, 5 by default). The same rules as for pictures: the price is asked first,
// the limit of the task holds (the video counts in the cost of the request), the cap of the operation holds, a refused or failed one is not charged. The new row sits next to the picture in the same request.
// → estimateOnly: { ok, usd, limit, spent, fits, seconds } ; otherwise { ok, submitted, id, usd } or { ok: false, reason | capped | configured: false }.
export async function startVideo(ctx, creativeId, { prompt = '', seconds = hfVideoReal.VIDEO_DEFAULT_S, sound = false, estimateOnly = false } = {}) {
  const { db } = ctx;
  const hfv = hfVideoOf(ctx);
  if (!hfv) return { ok: false, configured: false, error: 'Higgsfield не налаштовано на сервері.' };
  const c = (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c) return { ok: false, reason: 'no-creative' };
  if (c.hf?.kind === 'video') return { ok: false, reason: 'is-video' };
  if (!/^https:\/\//i.test(c.asset_url || '')) return { ok: false, reason: 'no-picture' };
  if (!['review', 'approved', 'rejected'].includes(c.status)) return { ok: false, reason: 'not-ready' };
  const req = must(await db.from('ag_creative_requests').select('id, campaign_id, brief').eq('id', c.request_id).maybeSingle(), 'request');
  if (!estimateOnly && (await cappedCampaigns(db)).has(String(req.campaign_id))) return { ok: false, capped: true, error: CAP_MESSAGE };
  const cycleMax = Number(req.brief?.agent_settings?.creative_maker?.max_usd);
  const teamMax = creativeAutoOf((await db.from('ag_campaigns').select('config').eq('id', req.campaign_id).maybeSingle()).data).maxUsd;
  const limit = cycleMax > 0 ? cycleMax : teamMax || limitOf(await makerConfig(db));
  const rows = must(await db.from('ag_creatives').select('id, cost_usd').eq('request_id', c.request_id), 'creatives') || [];
  const spent = round(rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0));
  const secs = hfVideoReal.clampSeconds(seconds);
  const request = hfVideoReal.buildVideoRequest({ prompt: String(prompt || '').trim() || hfVideoReal.DEFAULT_MOTION, image: c.asset_url, seconds: secs, sound }, hfv.profile());
  let usd;
  try { usd = await hfv.estimate({ request }); } catch (e) { return { ok: false, error: String(e?.message || e).replace(/\(оцінка вартості; перевірте HF_IMAGE_MODEL[^)]*\)/, '(оцінка вартості відео; перевірте HF_VIDEO_MODEL і параметри моделі)') }; }
  usd = round(usd);
  const fits = spent + usd <= limit + 1e-9;
  if (estimateOnly) return { ok: true, usd, limit, spent, fits, seconds: secs };
  if (!fits) return { ok: false, reason: 'over-limit', usd, limit, spent };
  const now = iso(ctx.now?.() || new Date());
  const base = String(c.concept_key).split('~')[0];
  const row = must(await db.from('ag_creatives').insert({ request_id: c.request_id, concept_key: `${base}~video`, concept_name: `${String(c.concept_name || base).split(' · ')[0]} · відео ${secs} с`, ratio: c.ratio, prompt: request.body.prompt, negative_prompt: '', copy: c.copy || {}, status: 'planned', hf: { kind: 'video', source_id: c.id, seconds: secs, sound: !!sound }, updated_at: now }).select().single(), 'creative');
  const who = { request_id: c.request_id, campaign_id: req.campaign_id, role: 'creative_maker' };
  try {
    const job = await hfv.submit({ request, key: `video-${row.id}-g1` });
    must(await db.from('ag_creatives').update({ status: 'producing', cost_usd: usd, generations: 1, hf: { ...(row.hf || {}), status_url: job.statusUrl, submitted_at: now, estimate_usd: usd, charged_before: 0 }, updated_at: now }).eq('id', row.id), 'creative');
    await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: c.request_id, campaign_id: req.campaign_id, usd, kind: 'generation', model: request.path, job_id: job.jobId });
    await logStep(ctx, who, 'Higgsfield: відео ' + secs + ' с з картинки «' + (c.concept_name || c.concept_key) + '» відправлено, очікую результат', 'running');
    return { ok: true, submitted: 1, id: row.id, usd, seconds: secs };
  } catch (e) {
    must(await db.from('ag_creatives').update({ status: 'failed', note: String(e.message || e).slice(0, 300), updated_at: now }).eq('id', row.id), 'creative');
    return { ok: false, error: String(e?.message || e) };
  }
}

// Compares the realism looks on the SAME scene (step 3.4): for the picture the person points at, one new picture per chosen look is made from the same scene prompt with the cues of that look added, next to
// the original in the same request. estimateOnly: only the price. → { ok, looks, count, estimateUsd, limit, skipped, submitted, ids } or { ok: false, reason }.
export async function compareLooks(ctx, creativeId, looks = [], { estimateOnly = false } = {}) {
  const { db } = ctx;
  const c = (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c || !c.prompt) return { ok: false, reason: 'no-creative' };
  const keys = [...new Set((Array.isArray(looks) ? looks : []).map(cleanLook).filter((k) => k && REAL_LOOKS.some((l) => l.key === k)))].slice(0, 3);
  if (!keys.length) return { ok: false, reason: 'no-looks' };
  if (estimateOnly) { // the price of ONE picture of this request times the number of looks
    const one = await generateCreatives(ctx, c.request_id, { ids: [c.id], estimateOnly: true });
    if (one.ok === false) return one;
    return { ok: true, looks: keys, count: keys.length, estimateUsd: round(Number(one.estimateUsd || 0) * keys.length), limit: one.limit, spent: one.spent, fits: Number(one.spent || 0) + Number(one.estimateUsd || 0) * keys.length <= Number(one.limit || 0) + 1e-9 };
  }
  // the scene of the picture without the cues of a look it may already carry (a task with a look): the cues of the chosen looks are added to the clean scene
  let scene = String(c.prompt);
  let negative = String(c.negative_prompt || '');
  REAL_LOOKS.forEach((l) => { scene = scene.split(l.cues).join(''); });
  scene = scene.replace(/\s+\./g, '.').replace(/\.\s*\./g, '.').trim();
  negative = negative.split(LOOK_NEGATIVE).join('').replace(/[\s,;.]+$/, '');
  const base = String(c.concept_key).split('~')[0];
  const made = [];
  for (const key of keys) {
    const look = LOOKS.find((l) => l.key === key);
    const done = applyLook({ prompt: scene, negative }, key);
    const row = must(await db.from('ag_creatives').insert({ request_id: c.request_id, concept_key: `${base}~${key}`, concept_name: `${String(c.concept_name || base).split(' · ')[0]} · ${look.label}`, ratio: c.ratio, prompt: done.prompt, negative_prompt: done.negative, copy: c.copy || {}, hf: { references: c.hf?.references || [], compare_of: c.id, look: key }, status: 'planned', note: null, updated_at: iso(ctx.now?.() || new Date()) }).select().single(), 'creative');
    made.push(row.id);
  }
  const out = await generateCreatives(ctx, c.request_id, { ids: made });
  return { ...out, looks: keys, ids: made };
}

// Looks at the pictures that are being made: a ready one is copied into our storage and goes to the person's review, a failed one is marked (and not charged).
export async function pollCreatives(ctx, { requestId = null } = {}) {
  const hf = hfOf(ctx);
  if (!hf && !hfVideoOf(ctx)) return 0;
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
  const hfv = hfVideoOf(ctx);
  for (const row of rows) {
    const gen = row.hf || {};
    if (!gen.status_url) continue;
    if (gen.kind === 'video') { // a video (step 3.5): checked and copied by the video adapter, no words over it, no picture check
      if (!hfv) continue;
      const late = gen.submitted_at && new Date(now).getTime() - new Date(gen.submitted_at).getTime() > STALE_MS * 2;
      let v;
      try { v = await hfv.check({ statusUrl: gen.status_url }); } catch { v = { state: 'pending' }; }
      const whoV = { request_id: row.request_id, campaign_id: await campaignOf(row.request_id), role: 'creative_maker' };
      if (v.state === 'ready') {
        const saved = await hfv.persist({ db, url: v.url, requestId: row.request_id, creativeId: row.id });
        must(await db.from('ag_creatives').update({ status: 'review', asset_url: saved.url, asset_path: saved.path || null, hf: { ...gen, finished_at: now }, updated_at: now }).eq('id', row.id), 'creative');
        changed += 1;
        await logStep(ctx, whoV, 'Higgsfield: відео «' + (row.concept_name || row.concept_key) + '» готове', 'done');
      } else if (v.state === 'failed' || late) {
        const refused = v.state === 'failed';
        must(await db.from('ag_creatives').update({ status: 'failed', cost_usd: refused ? Number(gen.charged_before || 0) : row.cost_usd, note: v.error || 'Higgsfield не відповів вчасно: відео не отримано.', updated_at: now }).eq('id', row.id), 'creative');
        if (refused && Number(gen.estimate_usd) > 0) await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: row.request_id, campaign_id: await campaignOf(row.request_id), usd: -Number(gen.estimate_usd), kind: 'refund' });
        changed += 1;
        await logStep(ctx, whoV, 'Higgsfield: відео «' + (row.concept_name || row.concept_key) + '» не вдалося: ' + String(v.error || 'довго немає відповіді').slice(0, 120), 'failed');
      }
      continue;
    }
    if (!hf) continue;
    const timedOut = gen.submitted_at && new Date(now).getTime() - new Date(gen.submitted_at).getTime() > STALE_MS;
    let r;
    try { r = await hf.check({ statusUrl: gen.status_url }); } catch { r = { state: 'pending' }; }
    if (r.state === 'ready') {
      const saved = await hf.persist({ db, url: r.url, requestId: row.request_id, creativeId: row.id });
      must(await db.from('ag_creatives').update({ status: 'review', asset_url: saved.url, asset_path: saved.path || null, hf: { ...gen, finished_at: now }, updated_at: now }).eq('id', row.id), 'creative');
      changed += 1;
      const who = { request_id: row.request_id, campaign_id: await campaignOf(row.request_id), role: 'creative_maker' };
      await logStep(ctx, who, 'Higgsfield: картинка «' + (row.concept_name || row.concept_key) + '», ' + row.ratio + ' готова', 'done');
      try { // the words over the clean picture (the copy may still be on its way: then it is done when the copy arrives)
        const t = await applyText(ctx, row.id, { inspect: true });
        if (t.ok) await logStep(ctx, who, 'Текст накладено на картинку «' + (row.concept_name || row.concept_key) + '»', 'done');
        else if (t.reason === 'no-text') await inspectLater(ctx, row.id); // no words wanted on this picture: it is ready for the quality checker as it is
      } catch (e) { await logStep(ctx, who, 'Текст не вдалося накласти: ' + String(e?.message || e).slice(0, 100), 'failed'); }
    } else if (r.state === 'failed' || timedOut) {
      // the provider refused it (failed, moderated, canceled): it does not charge, so the price of this generation goes back. A picture that only
      // took too long may still be made and charged: its price stays.
      const refused = r.state === 'failed';
      must(await db.from('ag_creatives').update({ status: 'failed', cost_usd: refused ? Number(gen.charged_before || 0) : row.cost_usd, note: r.error || 'Higgsfield не відповів вчасно: картинку не отримано.', hf: { ...gen, finished_at: now }, updated_at: now }).eq('id', row.id), 'creative');
      if (refused && Number(gen.estimate_usd) > 0) await db.from('ag_creative_spend').insert({ creative_id: row.id, request_id: row.request_id, campaign_id: await campaignOf(row.request_id), usd: -Number(gen.estimate_usd), kind: 'refund', model: gen.model || null, job_id: gen.job_id || null });
      changed += 1;
      await logStep(ctx, { request_id: row.request_id, campaign_id: await campaignOf(row.request_id), role: 'creative_maker' }, 'Higgsfield: картинка «' + (row.concept_name || row.concept_key) + '», ' + row.ratio + ' не вийшла' + (r.error ? ': ' + String(r.error).slice(0, 100) : ' (не відповів вчасно)'), 'failed');
    }
  }
  return changed;
}
