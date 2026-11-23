// Higgsfield image generation WITH REFERENCES for the creative maker (REST, https://api.higgsfield.ai, key id + secret from the Higgsfield console set in the
// server environment, never typed in chat or on a page). The queue protocol is the documented one:
//   POST /estimate/{model path}   same body as the generation -> { usd } (free: this is how a wrong path or parameter is found before any spend)
//   POST /{model path}            -> { request_id, status_url }   (queued; the Idempotency-Key header makes a repeated request harmless)
//   GET  status_url               -> queued | in_progress | completed | failed | nsfw | canceled; completed: images[0].url (kept 7 days)
// The MODEL is configuration, not code: the catalogue with the models that take reference images (GPT Image, Marketing Studio, Flux ...) is in the
// Higgsfield console and is not part of the public OpenAPI file, so its path and the name of the reference parameter are set by the team lead:
//   HF_IMAGE_MODEL        the model path from the console, e.g. «vendor/model/variant» (required)
//   HF_IMAGE_REF_PARAM    the parameter that takes the reference pictures (default image_urls)
//   HF_IMAGE_REF_MODE     array (default) or single (only the first reference)
//   HF_IMAGE_EXTRA        JSON with fixed parameters of the model, e.g. {"quality":"high","resolution":"1k"}
//   HF_IMAGE_RATIOS       the aspect ratios the model accepts, comma separated, e.g. «1:1,3:2,2:3,4:3,3:4,16:9,9:16,21:9»; a format outside the list (4:5 of the
//                         Meta feed) is asked as the nearest accepted one and the prompt keeps the important parts away from the edges that Meta trims
// fetch and the database are handed in, so scripts/check-core.mjs runs all of it with a stand-in network.
import { createHash } from 'node:crypto';

const BASE = 'https://api.higgsfield.ai';
const BUCKET = 'creative-assets';
const clean = (s) => String(s || '').replace(/^\/+/, '').trim();
const headers = (env) => ({ Authorization: `Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json' });

export function profileFromEnv(env = process.env) {
  let extra = {};
  try { extra = JSON.parse(env.HF_IMAGE_EXTRA || '{}'); } catch { extra = {}; }
  return {
    path: clean(env.HF_IMAGE_MODEL),
    refParam: String(env.HF_IMAGE_REF_PARAM || 'image_urls').trim(),
    refMode: env.HF_IMAGE_REF_MODE === 'single' ? 'single' : 'array',
    extra: extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {},
    ratios: String(env.HF_IMAGE_RATIOS || '').split(',').map((r) => r.trim()).filter((r) => /^\d+:\d+$/.test(r)),
  };
}

const ratioValue = (r) => { const [w, h] = String(r).split(':').map(Number); return w > 0 && h > 0 ? w / h : null; };
// → the ratio to ask the model for: the wanted one when it is accepted (or the list is unknown), else the nearest accepted one (by proportion).
export function snapRatio(wanted, accepted = []) {
  if (!accepted.length || accepted.includes(wanted)) return wanted;
  const want = ratioValue(wanted);
  if (!want) return wanted;
  let best = accepted[0]; let gap = Infinity;
  accepted.forEach((r) => { const v = ratioValue(r); const d = v ? Math.abs(Math.log(v / want)) : Infinity; if (d < gap) { gap = d; best = r; } });
  return best;
}

export const missingConfig = (env = process.env) => ['HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'HF_IMAGE_MODEL'].filter((k) => !String(env[k] || '').trim());
export const isConfigured = (env = process.env) => missingConfig(env).length === 0;

// One creative → { path, body }. Pure. References are public https addresses (the bucket of the client's materials is public).
export function buildImageRequest(creative, profile) {
  const avoid = creative.negative_prompt ? ` Avoid: ${creative.negative_prompt}.` : '';
  const refs = (creative.references || []).filter((u) => /^https:\/\//i.test(u || '')).slice(0, 6);
  const wanted = creative.ratio || '1:1';
  const asked = snapRatio(wanted, profile.ratios);
  const trim = asked !== wanted ? ` The picture will be cropped to ${wanted}: keep the product, the people and any words well inside the frame, away from the edges.` : '';
  const body = { ...profile.extra, prompt: `${creative.prompt}${avoid}${trim}`.slice(0, 3500), aspect_ratio: asked };
  if (refs.length) body[profile.refParam] = profile.refMode === 'single' ? refs[0] : refs;
  return { path: profile.path, body };
}

const detailOf = (json, status) => {
  const d = json?.detail ?? json?.error ?? json?.message;
  return `Higgsfield: ${typeof d === 'string' ? d : d ? JSON.stringify(d) : `помилка ${status}`}`.slice(0, 300);
};

// A model billed by tokens has no fixed price: Higgsfield describes its rates («Per 1M tokens: text input $5 ... image input $8 ... image output $30. Quality
// defaults to high. Final cost uses actual usage»). The price of one picture is then estimated from the size of the answer the model gives for the asked
// quality and shape (the published sizes of GPT Image: a square, a tall and a wide picture), the words of the prompt and the reference pictures, plus a
// margin, so the real charge is rarely above it. → USD, or NaN when the rates cannot be read.
const OUT_TOKENS = { low: [272, 408, 400], medium: [1056, 1584, 1568], high: [4160, 6240, 6208] }; // [square, tall, wide]
const REF_TOKENS = 2000; // one reference picture read by the model
const MARGIN = 1.15;
export function tokenEstimate(description, body = {}) {
  const d = String(description || '');
  const rate = (re) => { const m = re.exec(d); return m ? Number(m[1]) : NaN; };
  const out = rate(/image output \$([\d.]+)/i), textIn = rate(/(?:^|[^a-z])text input \$([\d.]+)/i), imageIn = rate(/(?:^|[^a-z])image input \$([\d.]+)/i);
  if (!Number.isFinite(out)) return NaN;
  const q = ['low', 'medium', 'high'].includes(String(body.quality || '').toLowerCase()) ? String(body.quality).toLowerCase() : 'high';
  const r = ratioValue(body.aspect_ratio || '1:1') || 1;
  const shape = r < 0.9 ? 1 : r > 1.1 ? 2 : 0;
  const refs = Object.entries(body).reduce((n, [k, v]) => (k === 'prompt' ? n : n + (Array.isArray(v) ? v.filter((x) => /^https:\/\//i.test(String(x))).length : typeof v === 'string' && /^https:\/\//i.test(v) ? 1 : 0)), 0); // the reference pictures, whatever the parameter is called
  const usd = (OUT_TOKENS[q][shape] * out + Math.ceil(String(body.prompt || '').length / 3) * (Number.isFinite(textIn) ? textIn : 0) + refs * REF_TOKENS * (Number.isFinite(imageIn) ? imageIn : 0)) / 1e6;
  return Math.round(usd * MARGIN * 10000) / 10000;
}

// → the price in USD of this request, before it is made. Throws a readable Error (a wrong model path or parameter shows here, without any spend).
// A model billed per second of video («Standard self-serve rates in USD per video second: 720p: $0.0714 ... Total price = selected rate x output duration in seconds»): the highest
// rate named in the description times the length (the resolution and the sound are not told apart: an upper estimate, the real charge is not above it) plus the margin. → USD or NaN.
export function perSecondEstimate(description, body) {
  const text = String(description || '');
  if (!/per\s+(video\s+)?second/i.test(text)) return NaN;
  const rates = [...text.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1])).filter((n) => n > 0);
  const secs = Number(body?.duration);
  if (!rates.length || !(secs > 0)) return NaN;
  return Math.round(Math.max(...rates) * secs * MARGIN * 10000) / 10000;
}

export async function estimate({ request, env = process.env, fetchFn = fetch }) {
  const res = await fetchFn(`${BASE}/estimate/${request.path}`, { method: 'POST', headers: headers(env), body: JSON.stringify(request.body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${detailOf(json, res.status)} (оцінка вартості; перевірте HF_IMAGE_MODEL і параметри моделі)`);
  // the documented answer is { "usd": "0.094" }. A model billed by tokens (Marketing Studio / GPT Image) answers with a DESCRIPTION of its rates instead:
  // the price is then worked out from those rates (tokenEstimate, an upper estimate). Any other answer is shown as it came (it holds no secret).
  const raw = json.usd ?? json.cost_usd ?? json.price_usd ?? json.estimate?.usd ?? json.cost?.usd;
  let usd = raw == null || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(usd) && json.pricing_description) usd = perSecondEstimate(json.pricing_description, request.body);
  if (!Number.isFinite(usd) && json.pricing_description) usd = tokenEstimate(json.pricing_description, request.body);
  if (!Number.isFinite(usd)) throw new Error(`Higgsfield не повернув вартість запиту (модель «${request.path}», відповідь: ${JSON.stringify(json).slice(0, 220)}).`);
  return usd;
}

// → { jobId, statusUrl }. Throws a readable Error.
export async function submit({ request, key, env = process.env, fetchFn = fetch }) {
  if (!/^[ -~]*$/.test(String(key))) key = 'k-' + createHash('sha1').update(String(key)).digest('hex').slice(0, 24); // a header value must be ASCII
  const res = await fetchFn(`${BASE}/${request.path}`, { method: 'POST', headers: { ...headers(env), 'Idempotency-Key': key }, body: JSON.stringify(request.body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.request_id) throw new Error(detailOf(json, res.status));
  return { jobId: json.request_id, statusUrl: json.status_url || `${BASE}/requests/${json.request_id}/status` };
}

// → { state: 'pending' | 'ready' | 'failed', url?, error? }. Failed and moderated requests are not charged.
export async function check({ statusUrl, env = process.env, fetchFn = fetch }) {
  if (!String(statusUrl).startsWith(`${BASE}/`)) return { state: 'failed', error: 'Невірна адреса перевірки статусу.' };
  const res = await fetchFn(statusUrl, { headers: headers(env) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { state: 'pending' }; // a hiccup: look again next time
  if (json.status === 'completed') {
    const url = json.images?.[0]?.url;
    return url ? { state: 'ready', url } : { state: 'failed', error: 'Higgsfield завершив, але не повернув файл.' };
  }
  if (json.status === 'failed') return { state: 'failed', error: json.error ? `Higgsfield: ${typeof json.error === 'string' ? json.error : JSON.stringify(json.error)}`.slice(0, 300) : 'Генерація не вдалася.' };
  if (json.status === 'nsfw') return { state: 'failed', error: 'Higgsfield відхилив результат модерацією. Змініть промт.' };
  if (json.status === 'canceled') return { state: 'failed', error: 'Генерацію скасовано.' };
  return { state: 'pending' };
}

// Copies the finished picture into our storage (the provider keeps it only 7 days). → { url, path } (the original address and an empty path if the copy fails).
export async function persist({ db, url, requestId, creativeId, fetchFn = fetch }) {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return { url, path: '' };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = res.headers?.get?.('content-type') || 'image/png';
    const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
    const path = `requests/${requestId}/creative-${creativeId}-${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) return { url, path: '' };
    return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || url, path };
  } catch { return { url, path: '' }; }
}
