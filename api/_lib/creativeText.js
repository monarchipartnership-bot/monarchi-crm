// The words on a finished creative (owner, 2026-11-12, step 3.1): the picture comes from Higgsfield CLEAN (the image model is not trusted to spell), and the system puts the headline,
// the line under it, the offer and the button over it, in a real font (api/_lib/composeServer.js), so every creative reaches the person's review with its text on it, in the client's
// language, spelled exactly as written. The text comes from the technical brief (given texts, the offer, the button) and the copywriter (the headline of the first variant).
// The picture without words stays as asset_url; the one with words is final_url (that one is shown and downloaded).
import { composeTextServer } from './composeServer.js';
import { ZONES } from '../../src/lib/creatives/composeText.js';

const BUCKET = 'creative-assets';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// concept: the concept of the technical brief; creative: the ag_creatives row. → { zone, headline, subline, badge, cta } or null when there is nothing to put (no text wanted)
export function overlayFields(concept, creative) {
  if (!concept || !['overlay', 'model'].includes(concept.text_render) || concept.needs_text === false) return null; // a brief made before the rule «the system puts the words» says «model»: the same text, put by the system
  const variant = Array.isArray(creative?.copy?.variants) ? creative.copy.variants[0] : null;
  const own = concept.copy || {};
  const headline = clip(own.headline || variant?.headline, 90);
  const cta = concept.cta?.show === false ? '' : clip(concept.cta?.text || variant?.cta, 28);
  const zone = ZONES.includes(concept.layout?.text_zone) ? concept.layout.text_zone : 'top';
  return { zone, headline, subline: clip(own.subline, 120), badge: clip(own.badge, 40), cta };
}

// The concept of a creative: from the newest finished brief of its request.
async function conceptOf(db, creative) {
  const rows = (await db.from('ag_tasks').select('output').eq('request_id', creative.request_id).eq('status', 'done').order('id', { ascending: false })).data || [];
  const brief = rows.find((r) => Array.isArray(r.output?.json?.concepts));
  return brief?.output?.json?.concepts.find((c) => c.key === creative.concept_key) || null;
}

// Puts the words on ONE creative and saves the result. force: also when it already has them (the button «Накласти текст знову»).
// → { ok, reason? }: reasons: 'no-picture', 'no-text' (the concept wants no text), 'no-headline' (the copy is not ready yet: it is tried again when it arrives), 'has-text'
export async function applyText(ctx, creativeId, { force = false } = {}) {
  const { db } = ctx;
  const c = (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data;
  if (!c || !c.asset_url) return { ok: false, reason: 'no-picture' };
  if (c.final_url && !force) return { ok: false, reason: 'has-text' };
  const f = overlayFields(await conceptOf(db, c), c);
  if (!f) return { ok: false, reason: 'no-text' };
  if (!f.headline) return { ok: false, reason: 'no-headline' };
  const res = await (ctx.fetchImage ? ctx.fetchImage(c.asset_url) : fetch(c.asset_url));
  if (!res.ok) throw new Error(`Не вдалося завантажити картинку для тексту (HTTP ${res.status}).`);
  const out = await composeTextServer({ image: Buffer.from(await res.arrayBuffer()), ...f });
  const path = `requests/${c.request_id}/final-${c.id}-${Date.now()}.png`;
  const up = await db.storage.from(BUCKET).upload(path, out.png, { contentType: 'image/png', upsert: false });
  if (up.error) throw new Error(up.error.message || 'Не вдалося зберегти картинку з текстом.');
  const url = db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;
  await db.from('ag_creatives').update({ final_url: url, final_path: path, updated_at: new Date().toISOString() }).eq('id', c.id);
  return { ok: true, url, zone: out.layout.zone, busy: out.layout.busy };
}

// Every creative of a request that has its picture and not its words yet (called when the copy has arrived and when a picture is ready). Never throws: a creative without words is still a creative.
export async function applyTextForRequest(ctx, requestId) {
  const rows = (await ctx.db.from('ag_creatives').select('id, asset_url, final_url, status').eq('request_id', requestId)).data || [];
  const done = [];
  for (const r of rows.filter((x) => x.asset_url && !x.final_url && ['review', 'approved'].includes(x.status))) {
    try { const out = await applyText(ctx, r.id); if (out.ok) done.push(r.id); } catch (e) { console.warn('applyText failed:', e?.message || e); }
  }
  return done;
}
