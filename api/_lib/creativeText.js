// The words on a finished creative (owner, 2026-11-12, step 3.1): the picture comes from Higgsfield CLEAN (the image model is not trusted to spell), and the system puts the headline,
// the line under it, the offer and the button over it, in a real font (api/_lib/composeServer.js), so every creative reaches the person's review with its text on it, in the client's
// language, spelled exactly as written. The text comes from the technical brief (given texts, the offer, the button) and the copywriter (the headline of the first variant).
// The picture without words stays as asset_url; the one with words is final_url (that one is shown and downloaded).
import { composeTextServer } from './composeServer.js';
import { ZONES } from '../../src/lib/creatives/composeText.js';
import { composerOptions, effectiveStyle, mergeManual } from '../../src/lib/agents/projectStyle.js';
import { cleanTextEdit } from '../../src/lib/creatives/textEdit.js';

const BUCKET = 'creative-assets';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// concept: the concept of the technical brief; creative: the ag_creatives row. → { zone, headline, subline, badge, cta } or null when there is nothing to put (no text wanted)
export function overlayFields(concept, creative) {
  const edit = creative?.copy?.edit || null; // the words changed by a person on this very creative (step 3.1e): the last word
  if (!edit?.headline && (!concept || !['overlay', 'model'].includes(concept.text_render) || concept.needs_text === false)) return null; // a brief made before the rule «the system puts the words» says «model»: the same text, put by the system
  const variant = Array.isArray(creative?.copy?.variants) ? creative.copy.variants[0] : null;
  const own = concept?.copy || {};
  const pick = (k, base, n) => (typeof edit?.[k] === 'string' ? clip(edit[k], n) : base);
  const headline = pick('headline', clip(own.headline || variant?.headline, 90), 90);
  const cta = pick('cta', concept?.cta?.show === false ? '' : clip(concept?.cta?.text || variant?.cta, 28), 28);
  const zone = ZONES.includes(concept?.layout?.text_zone) ? concept.layout.text_zone : 'top';
  return { zone, headline, subline: pick('subline', clip(own.subline, 120), 120), badge: pick('badge', clip(own.badge, 40), 40), cta };
}

// The concept of a creative: from the newest finished brief of its request.
export async function conceptOf(db, creative) {
  const rows = (await db.from('ag_tasks').select('output').eq('request_id', creative.request_id).eq('status', 'done').order('id', { ascending: false })).data || [];
  const brief = rows.find((r) => Array.isArray(r.output?.json?.concepts));
  return brief?.output?.json?.concepts.find((c) => c.key === creative.concept_key) || null;
}

// The project of a request (through its operation).
async function projectOf(db, requestId) {
  const req = (await db.from('ag_creative_requests').select('campaign_id').eq('id', requestId).maybeSingle()).data;
  const camp = req ? (await db.from('ag_campaigns').select('project_id').eq('id', req.campaign_id).maybeSingle()).data : null;
  return camp?.project_id ?? -1;
}

// The quality checker is asked to look at a finished creative (step 3.2). A dynamic import: the engine imports this module.
export async function inspectLater(ctx, creativeId) {
  try { const { queueInspection } = await import('./creativeEngine.js'); return await queueInspection(ctx, creativeId); } catch (e) { console.warn('queueInspection failed:', e?.message || e); return { queued: false, reason: 'error' }; }
}

// Puts the words on ONE creative and saves the result. force: also when it already has them (the button «Накласти текст знову»).
// → { ok, reason? }: reasons: 'no-picture', 'no-text' (the concept wants no text), 'no-headline' (the copy is not ready yet: it is tried again when it arrives), 'has-text'
export async function applyText(ctx, creativeId, { force = false, inspect = false } = {}) {
  const { db } = ctx;
  const c = (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c || !c.asset_url) return { ok: false, reason: 'no-picture' };
  if (c.final_url && !force) return { ok: false, reason: 'has-text' };
  const f = overlayFields(await conceptOf(db, c), c);
  if (!f) return { ok: false, reason: 'no-text' };
  if (!f.headline) return { ok: false, reason: 'no-headline' };
  const res = await (ctx.fetchImage ? ctx.fetchImage(c.asset_url) : fetch(c.asset_url));
  if (!res.ok) throw new Error(`Не вдалося завантажити картинку для тексту (HTTP ${res.status}).`);
  // the style of the project (the scout decided it, a person corrected it) says where and how the words sit; what it leaves open the picture decides
  const intel = (await db.from('ag_project_intel').select('profile').eq('project_id', await projectOf(db, c.request_id)).maybeSingle()).data;
  const brief = (await db.from('ag_creative_requests').select('brief').eq('id', c.request_id).maybeSingle()).data?.brief || {};
  const style = composerOptions(effectiveStyle(intel?.profile?.style, mergeManual(brief.style, c.copy?.edit?.style)).value.text); // the look of THIS task over the scout's decision, the edit of THIS creative over both
  const out = await composeTextServer({ image: Buffer.from(await res.arrayBuffer()), ...f, style });
  const path = `requests/${c.request_id}/final-${c.id}-${Date.now()}.png`;
  const up = await db.storage.from(BUCKET).upload(path, out.png, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(up.error.message || 'Не вдалося зберегти картинку з текстом.');
  const url = db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;
  await db.from('ag_creatives').update({ final_url: url, final_path: path, updated_at: new Date().toISOString() }).eq('id', c.id);
  if (inspect) await inspectLater(ctx, c.id); // a NEW picture with its words: the quality checker looks at it (not after a hand edit of a person)
  return { ok: true, url, zone: out.layout.zone, busy: out.layout.busy };
}

// Every creative of a request that has its picture and not its words yet (called when the copy has arrived and when a picture is ready). Never throws: a creative without words is still a creative.
export async function applyTextForRequest(ctx, requestId) {
  const rows = (await ctx.db.from('ag_creatives').select('id, asset_url, final_url, status').eq('request_id', requestId)).data || [];
  const done = [];
  for (const r of rows.filter((x) => x.asset_url && !x.final_url && ['review', 'approved'].includes(x.status))) {
    try { const out = await applyText(ctx, r.id, { inspect: true }); if (out.ok) done.push(r.id); } catch (e) { console.warn('applyText failed:', e?.message || e); }
  }
  return done;
}

// What the editor of the words shows: the words that are on the picture now (from the brief, the copywriter and an earlier edit), and the edit itself. → { ok, fields, edit, hasPicture }
export async function textInfo(ctx, creativeId) {
  const c = (await ctx.db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c) return { ok: false, reason: 'no-creative' };
  const fields = overlayFields(await conceptOf(ctx.db, c), c);
  return { ok: true, hasPicture: !!c.asset_url, fields, edit: c.copy?.edit || null };
}

// A person changes the words (and how they sit) of ONE ready creative (step 3.1e): the edit is kept in the creative and the words are put on the same picture again, which is free. edit null: back to what
// the agents made. → the result of applyText
export async function saveTextEdit(ctx, creativeId, rawEdit) {
  const { db } = ctx;
  const c = (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c) return { ok: false, reason: 'no-creative' };
  if (!c.asset_url) return { ok: false, reason: 'no-picture' };
  const edit = rawEdit == null ? null : cleanTextEdit(rawEdit);
  if (rawEdit != null && !edit) return { ok: false, reason: 'empty-edit' };
  const { edit: _old, ...rest } = c.copy || {};
  const copy = edit ? { ...rest, edit } : rest;
  const upd = await db.from('ag_creatives').update({ copy, updated_at: new Date().toISOString() }).eq('id', creativeId);
  if (upd?.error) throw new Error(upd.error.message || 'Не вдалося зберегти правку.');
  return applyText(ctx, creativeId, { force: true });
}
