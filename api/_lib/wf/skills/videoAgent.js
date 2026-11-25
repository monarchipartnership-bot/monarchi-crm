// The Creator's skill «animate_creatives» (Zeely item 5): short vertical videos from the pictures of ready creatives (videoEngine.js). input = { sources:['c2'], duration, resolution, quality, audio, language, motion }
// or { follow: true } to pick up videos that were still being made. The price of every video is asked BEFORE it is made (a free estimate) and must fit what is left of the cost cap of the project; a failed or
// moderated video is not charged. The finished mp4 is copied into our storage (the provider keeps it only 7 days). The videos live in content.videos of the section «Креативи (готові)»
// (an approved section receives them as a proposal of the agent, which the manager accepts).
import * as hfv from '../../hfVideo.js';
import { DEFAULT_IMAGE_LIMIT_USD, renderCreativesText } from './creativesEngine.js';
import { VIDEO_MONTHLY_MAX, normalizeVideoRequest, planVideos, renderVideosText, videosThisMonth } from './videoEngine.js';

const realVideo = { profile: hfv.profileFromEnv, buildVideoRequest: hfv.buildVideoRequest, estimate: hfv.estimate, submit: hfv.submit, check: hfv.check };
export const videoHfOf = (ctx) => (ctx.hfv === undefined ? (hfv.isConfigured() ? realVideo : null) : ctx.hfv);
const r4 = (x) => Math.round(x * 10000) / 10000;
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
const sleepOf = (ctx) => ctx.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
const asciiKey = (s) => String(s).replace(/[^\w-]+/g, '_');

// → { spent, open, limit }. Estimates first, then submits what fits, then follows the jobs until they are ready or the time of this run is over.
async function makeVideos({ videos, ctx, run, hf, now }) {
  const snap = await ctx.repo.loadSnapshot(run.project_id);
  const limit = snap.state?.cost_cap_usd != null ? Number(snap.state.cost_cap_usd) : DEFAULT_IMAGE_LIMIT_USD;
  const before = await ctx.repo.projectCost(run.project_id, monthStart(now));
  let remaining = limit - before, spent = 0;
  const open = [];
  const profile = hf.profile();
  for (const v of videos) {
    if (!['planned', 'failed'].includes(v.status) || v.job) continue;
    const request = hf.buildVideoRequest(v, profile);
    let usd;
    try { usd = await hf.estimate({ request }); } catch (e) { v.status = 'failed'; v.note = String(e.message || e).slice(0, 300); continue; }
    if (usd > remaining + 1e-9) { v.note = `Відео не вміщається в ліміт проєкту ($${limit.toFixed(2)}): лишилось $${Math.max(0, remaining).toFixed(2)}, потрібно $${usd.toFixed(2)}.`; v.status = 'planned'; open.push(`${v.id}: ${v.note}`); continue; }
    try {
      const job = await hf.submit({ request, key: `wf-${run.project_id}-${asciiKey(v.id)}-${v.month}-${(v.attempt || 0) + 1}` });
      Object.assign(v, { job: { id: job.jobId, statusUrl: job.statusUrl }, status: 'producing', estimate_usd: usd, cost_usd: r4(Number(v.cost_usd || 0) + usd), attempt: (v.attempt || 0) + 1, note: '' });
      remaining = r4(remaining - usd); spent = r4(spent + usd);
    } catch (e) { v.status = 'failed'; v.note = String(e.message || e).slice(0, 300); }
  }
  const maxWait = ctx.videoWaitMs ?? 200000, step = ctx.videoStepMs ?? 5000;
  let waited = 0;
  for (;;) {
    for (const v of videos.filter((x) => x.status === 'producing' && x.job)) {
      const r = await hf.check({ statusUrl: v.job.statusUrl });
      if (r.state === 'ready') {
        const saved = await ctx.repo.persistProjectVideo(run.project_id, { url: r.url, name: `${v.id}` });
        Object.assign(v, { status: 'ready', video_url: saved.url, path: saved.path || '', job: null, note: saved.path ? '' : 'Файл не вдалося скопіювати у сховище: посилання Higgsfield діє 7 днів.' });
      } else if (r.state === 'failed') {
        spent = r4(spent - Number(v.estimate_usd || 0)); // a failed or moderated video is not charged
        Object.assign(v, { status: 'failed', note: r.error || 'Генерація не вдалася.', cost_usd: Math.max(0, r4(Number(v.cost_usd || 0) - Number(v.estimate_usd || 0))), job: null });
      }
    }
    if (!videos.some((x) => x.status === 'producing') || waited >= maxWait) break;
    await sleepOf(ctx)(step); waited += step;
  }
  if (videos.some((x) => x.status === 'producing')) open.push('Частина відео ще генерується: натисніть «Забрати готові відео» за кілька хвилин.');
  return { spent, open, limit };
}

export async function animateCreatives({ run, ctx }) {
  const sec = (await ctx.repo.readSection(run.project_id, 'creatives'))?.version?.content;
  if (!sec?.items?.length) return { output: { made: 0 }, steps: [{ title: 'Креативів ще немає: відео робити нема з чого', status: 'info' }] };
  const hf = videoHfOf(ctx);
  if (!hf) throw new Error('Відео не налаштовано на сервері: потрібні HF_API_KEY_ID, HF_API_KEY_SECRET і HF_VIDEO_MODEL (шлях моделі з консолі Higgsfield).');
  const now = (ctx.now || (() => new Date()))();
  const videos = (sec.videos || []).map((v) => ({ ...v }));
  const follow = run.input?.follow === true;
  let added = [], skipped = [];
  if (!follow) {
    const req = normalizeVideoRequest(run.input);
    const left = VIDEO_MONTHLY_MAX - videosThisMonth(videos, now);
    if (left <= 0) return { output: { made: 0, limited: 'month' }, steps: [{ title: `Ліміт відео на місяць вичерпано: ${VIDEO_MONTHLY_MAX} з ${VIDEO_MONTHLY_MAX}`, status: 'info' }] };
    const plan = planVideos({ req, items: sec.items, videos, now });
    skipped = plan.skipped;
    const base = videos.length;
    added = plan.videos.map((v, i) => ({ id: `v${base + i + 1}`, ...v }));
    videos.push(...added);
  }
  if (!videos.some((v) => ['planned', 'producing'].includes(v.status) || (v.status === 'failed' && added.includes(v)))) return { output: { made: 0 }, steps: [{ title: 'Немає відео, які треба забрати чи доробити', status: 'info' }] };
  const made = await makeVideos({ videos, ctx, run, hf, now });
  const ready = videos.filter((v) => v.status === 'ready').length;
  const content = { ...sec, videos, open: [...(sec.open || []).filter((o) => !/відео/i.test(o)), ...made.open] };
  const body = renderCreativesText(sec.items, { branch: 'A', spent: sec.spent_usd, limit: sec.limit_usd, open: content.open }) + renderVideosText(videos);
  return {
    writes: [{ key: 'creatives', body, content, sources: [{ title: 'Готові креативи (картинки)' }] }],
    steps: [
      { title: follow ? 'Перевірено відео, що генерувались' : `Відео замовлено ${added.length}${skipped.length ? `, не вміщається в місячний ліміт ${VIDEO_MONTHLY_MAX}: ${skipped.join(', ')}` : ''}` },
      { title: `Відео готово ${ready} з ${videos.length}, витрачено $${made.spent.toFixed(2)}` },
    ],
    output: { made: added.length, ready, video_usd: made.spent, skipped: skipped.length },
    costUsd: made.spent,
  };
}
