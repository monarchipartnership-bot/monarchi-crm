// Higgsfield (image and video generation) for the visual agent. REST at https://api.higgsfield.ai, key id + secret from the
// Higgsfield console, set by the team lead in the server environment (HF_API_KEY_ID, HF_API_KEY_SECRET), never typed in chat or the page.
//   POST /{model path}              -> { request_id, status_url, ... }  (queued)
//   GET  status_url                 -> status queued | in_progress | completed | failed | nsfw | canceled;
//                                      completed: images[0].url (image) or video.url (video). Output URLs live 7 days, so the result is
//                                      copied into our own storage bucket (smm-assets).
// Models used: images Soul standard, video Kling 3.0 standard text-to-video; both fields are the documented ones.
// fetch and the database are handed in, so scripts/check-core.mjs tests it with a stand-in network.

const BASE = 'https://api.higgsfield.ai';
const IMAGE_PATH = 'higgsfield-ai/soul/standard';
const VIDEO_PATH = 'kling-video/v3.0/std/text-to-video';
const BUCKET = 'smm-assets';
const IMAGE_RATIOS = { '1:1': '1:1', '4:5': '3:4', '9:16': '9:16', '16:9': '16:9', '1.91:1': '16:9' }; // Soul has no 4:5 / 1.91:1: the nearest
const VIDEO_RATIOS = { '1:1': '1:1', '4:5': '1:1', '9:16': '9:16', '16:9': '16:9', '1.91:1': '16:9' };

export const isConfigured = (env = process.env) => !!(env.HF_API_KEY_ID && env.HF_API_KEY_SECRET);
const headers = (env) => ({ Authorization: `Key ${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json' });

// The request for a visual: { path, body }. Pure.
export function buildRequest(visual) {
  const avoid = visual.negative_prompt ? ` Avoid: ${visual.negative_prompt}.` : '';
  if (visual.mode === 'video') {
    return { path: VIDEO_PATH, body: { prompt: (visual.prompt + avoid).slice(0, 2500), duration: Math.min(15, Math.max(3, visual.duration_seconds || 6)), aspect_ratio: VIDEO_RATIOS[visual.aspect_ratio] || '9:16', sound: 'off' } };
  }
  return { path: IMAGE_PATH, body: { prompt: visual.prompt + avoid, aspect_ratio: IMAGE_RATIOS[visual.aspect_ratio] || '1:1', resolution: '1080p', batch_size: 1 } };
}

// → { status: 'pending', jobId, statusUrl, provider }. Throws a readable Error.
export async function submit({ post, visual, env = process.env, fetchFn = fetch }) {
  const { path, body } = buildRequest(visual);
  const res = await fetchFn(`${BASE}/${path}`, { method: 'POST', headers: { ...headers(env), 'Idempotency-Key': `smm-post-${post.id}-r${post.rounds || 0}-${(post.visual_prompt?.generation_n || 0) + 1}` }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.request_id) throw new Error(`Higgsfield: ${json.detail || json.error || json.message || `помилка ${res.status}`}`);
  return { status: 'pending', jobId: json.request_id, statusUrl: json.status_url || `${BASE}/requests/${json.request_id}/status`, provider: 'higgsfield' };
}

// → { state: 'pending' | 'ready' | 'failed', url?, error? }
export async function check({ statusUrl, kind, env = process.env, fetchFn = fetch }) {
  if (!String(statusUrl).startsWith(BASE + '/')) return { state: 'failed', error: 'Невірна адреса перевірки статусу.' };
  const res = await fetchFn(statusUrl, { headers: headers(env) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { state: 'pending' }; // a hiccup: look again next time
  if (json.status === 'completed') {
    const url = kind === 'video' ? json.video?.url : json.images?.[0]?.url;
    return url ? { state: 'ready', url } : { state: 'failed', error: 'Higgsfield завершив, але не повернув файл.' };
  }
  if (json.status === 'failed') return { state: 'failed', error: json.error ? `Higgsfield: ${typeof json.error === 'string' ? json.error : JSON.stringify(json.error)}`.slice(0, 300) : 'Генерація не вдалася.' };
  if (json.status === 'nsfw') return { state: 'failed', error: 'Higgsfield відхилив результат модерацією. Змініть промт.' };
  if (json.status === 'canceled') return { state: 'failed', error: 'Генерацію скасовано.' };
  return { state: 'pending' };
}

// Copies the finished file into our storage (the provider keeps it only 7 days). → the public URL, or the original one if the copy fails.
export async function persist({ db, url, kind, postId, fetchFn = fetch }) {
  try {
    const res = await fetchFn(url);
    if (!res.ok) return url;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const type = res.headers?.get?.('content-type') || (kind === 'video' ? 'video/mp4' : 'image/png');
    const ext = kind === 'video' ? 'mp4' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
    const path = `post-${postId}/${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) return url;
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || url;
  } catch { return url; }
}
