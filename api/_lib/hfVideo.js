// Higgsfield VIDEO generation from a picture (Zeely item 5, owner's decisions 2026-11-25): the same REST queue as the pictures (hfImage.js: estimate, submit, status), another model.
//   HF_VIDEO_MODEL        the model path from the Higgsfield console (required), e.g. the image-to-video path of Seedance 2.0
//   HF_VIDEO_START_PARAM  the parameter that takes the first frame (default image_url)
//   HF_VIDEO_EXTRA        JSON with fixed parameters of the model
// The names of the other parameters follow the catalogue of Higgsfield: duration, resolution, aspect_ratio, generate_audio, mode («fast» / «std» of Seedance). A wrong path or parameter is found by the
// FREE estimate before any generation (hfImage.estimate), so nothing is spent on a mistake.
import { estimate, submit } from './hfImage.js';

const BASE = 'https://api.higgsfield.ai';
const clean = (s) => String(s || '').replace(/^\/+/, '').trim();
const headers = (env) => ({ Authorization: `Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json' });

export function profileFromEnv(env = process.env) {
  let extra = {};
  try { extra = JSON.parse(env.HF_VIDEO_EXTRA || '{}'); } catch { extra = {}; }
  return { path: clean(env.HF_VIDEO_MODEL), startParam: String(env.HF_VIDEO_START_PARAM || 'image_url').trim(), extra: extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {} };
}
export const missingConfig = (env = process.env) => ['HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'HF_VIDEO_MODEL'].filter((k) => !String(env[k] || '').trim());
export const isConfigured = (env = process.env) => missingConfig(env).length === 0;

// One video → { path, body }. Pure. The first frame is a public https address (the picture of an approved creative in our storage).
export function buildVideoRequest(v, profile) {
  const body = { ...profile.extra, prompt: String(v.prompt || '').slice(0, 3500), aspect_ratio: v.aspect_ratio || '9:16', duration: v.duration, resolution: v.resolution, mode: v.quality, generate_audio: !!v.audio };
  if (/^https:\/\//i.test(v.start_url || '')) body[profile.startParam] = v.start_url;
  return { path: profile.path, body };
}

// → { state: 'pending' | 'ready' | 'failed', url?, error? }. Failed and moderated requests are not charged.
export async function check({ statusUrl, env = process.env, fetchFn = fetch }) {
  if (!String(statusUrl).startsWith(`${BASE}/`)) return { state: 'failed', error: 'Невірна адреса перевірки статусу.' };
  const res = await fetchFn(statusUrl, { headers: headers(env) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { state: 'pending' }; // a hiccup: look again next time
  if (json.status === 'completed') {
    const url = json.video?.url || json.videos?.[0]?.url || json.output?.video?.url || json.result?.url || json.output?.url;
    return url ? { state: 'ready', url } : { state: 'failed', error: 'Higgsfield завершив, але не повернув відеофайл.' };
  }
  if (json.status === 'failed') return { state: 'failed', error: json.error ? `Higgsfield: ${typeof json.error === 'string' ? json.error : JSON.stringify(json.error)}`.slice(0, 300) : 'Генерація не вдалася.' };
  if (json.status === 'nsfw') return { state: 'failed', error: 'Higgsfield відхилив результат модерацією. Змініть сцену.' };
  if (json.status === 'canceled') return { state: 'failed', error: 'Генерацію скасовано.' };
  return { state: 'pending' };
}

export { estimate, submit };
