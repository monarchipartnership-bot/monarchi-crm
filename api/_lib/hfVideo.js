// Higgsfield VIDEO from a finished picture (owner's plan step 3.5, 2026-11-13): the picture is the first frame, a short motion prompt says what moves. REST queue API, the same protocol and keys as the pictures
// (hfImage.js: estimate, submit); only the model, the body and the finished file differ:
//   POST /estimate/{model path}   the same body -> { usd }         (free: the price is shown to the person before anything is made)
//   POST /{model path}            -> { request_id, status_url }
//   GET  status_url               -> completed: video.url (kept 7 days: the file is copied into our storage)
// The MODEL is configuration with a default: HF_VIDEO_MODEL (default Kling 3.0 Standard image to video: image_url is the FIRST FRAME, duration 3..15 s, the shape follows the picture),
//   HF_VIDEO_IMAGE_PARAM (default image_url), HF_VIDEO_EXTRA (JSON with fixed parameters of the model, e.g. {"cfg_scale":0.5}).
import { estimate as hfEstimate, submit as hfSubmit } from './hfImage.js';

const BASE = 'https://api.higgsfield.ai';
const BUCKET = 'creative-assets';
export const VIDEO_DEFAULT_MODEL = 'kling-video/v3.0/std/image-to-video';
export const VIDEO_MIN_S = 3;
export const VIDEO_MAX_S = 10; // the plan: 5 to 8 seconds; a little more room for the person to choose
export const VIDEO_DEFAULT_S = 5;
export const DEFAULT_MOTION = 'Slow, gentle camera push-in with soft natural light shifts and subtle realistic motion in the scene. Keep the product, its shape, colours and any logo exactly as in the first frame. No new objects, no text.';
const clean = (s) => String(s || '').trim().replace(/^\/+|\/+$/g, '');
const headers = (env) => ({ Authorization: `Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json' });

export function videoProfileFromEnv(env = process.env) {
  let extra = {};
  try { extra = JSON.parse(env.HF_VIDEO_EXTRA || '{}'); } catch { extra = {}; }
  return { path: clean(env.HF_VIDEO_MODEL) || VIDEO_DEFAULT_MODEL, imageParam: String(env.HF_VIDEO_IMAGE_PARAM || 'image_url').trim(), extra: extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {} };
}
export const videoConfigured = (env = process.env) => !!String(env.HF_API_KEY_ID || '').trim() && !!String(env.HF_API_KEY_SECRET || '').trim();

export const clampSeconds = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(VIDEO_MAX_S, Math.max(VIDEO_MIN_S, n)) : VIDEO_DEFAULT_S; };

// One video → { path, body }. Pure. image: a public https address of the first frame. sound: the model's own sound («on» / «off»).
export function buildVideoRequest({ prompt, image, seconds, sound = false }, profile) {
  const body = { ...profile.extra, prompt: String(prompt || DEFAULT_MOTION).trim().slice(0, 2400), [profile.imageParam]: image, duration: clampSeconds(seconds), sound: sound ? 'on' : 'off' };
  return { path: profile.path, body };
}

// → { state: 'pending' | 'ready' | 'failed', url?, error? }. Failed and moderated requests are not charged.
export async function checkVideo({ statusUrl, env = process.env, fetchFn = fetch }) {
  if (!String(statusUrl).startsWith(`${BASE}/`)) return { state: 'failed', error: 'Невірна адреса перевірки статусу.' };
  const res = await fetchFn(statusUrl, { headers: headers(env) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { state: 'pending' };
  if (json.status === 'completed') {
    const url = json.video?.url || json.videos?.[0]?.url;
    return url ? { state: 'ready', url } : { state: 'failed', error: 'Higgsfield завершив, але не повернув відео.' };
  }
  if (json.status === 'failed') return { state: 'failed', error: json.error ? `Higgsfield: ${typeof json.error === 'string' ? json.error : JSON.stringify(json.error)}`.slice(0, 300) : 'Генерація відео не вдалася.' };
  if (json.status === 'nsfw') return { state: 'failed', error: 'Higgsfield відхилив результат модерацією. Змініть опис руху.' };
  if (json.status === 'canceled') return { state: 'failed', error: 'Генерацію скасовано.' };
  return { state: 'pending' };
}

// Copies the finished video into our storage (the provider keeps it only 7 days). → { url, path } (the original address and an empty path if the copy fails).
export async function persistVideo({ db, url, requestId, creativeId, fetchFn = fetch }) {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return { url, path: '' };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = res.headers?.get?.('content-type') || 'video/mp4';
    const path = `requests/${requestId}/video-${creativeId}-${Date.now()}.${type.includes('webm') ? 'webm' : 'mp4'}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) return { url, path: '' };
    return { url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || url, path };
  } catch { return { url, path: '' }; }
}

// The adapter that creativeVideo.js and the poller use (and the tests replace with a stand-in).
export const real = { estimate: hfEstimate, submit: hfSubmit, check: checkVideo, persist: persistVideo, profile: videoProfileFromEnv };
