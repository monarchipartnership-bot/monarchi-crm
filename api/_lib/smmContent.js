// The content engine of Mon'Archi SMM, as pure code: what each network needs, the prompt that is sent to the
// model, how its answer is read back into posts, and when each post is scheduled. No network and no database
// here (the endpoint hands those in), so scripts/check-core.mjs can test every rule in plain Node.
import { kyivInstant } from '../../src/lib/agentSchedule.js';

export const PLATFORMS = {
  instagram: {
    label: 'Instagram', formats: ['image', 'carousel', 'reel'], defaultFormat: 'image', defaultTime: '18:00',
    rule: 'Caption up to 2200 characters, the first line is a hook that works before "more". 3 to 6 relevant hashtags in the hashtags field (not inside the caption). Always give a visual_brief: what the image, each carousel slide or the reel shows.',
  },
  facebook: {
    label: 'Facebook', formats: ['text', 'image', 'link'], defaultFormat: 'text', defaultTime: '12:00',
    rule: 'Conversational, 300 to 800 characters, one clear idea and a question or call to action at the end. 0 to 3 hashtags. A visual_brief only when the post needs an image.',
  },
  threads: {
    label: 'Threads', formats: ['text', 'image'], defaultFormat: 'text', defaultTime: '13:00',
    rule: 'Up to 500 characters, one idea, a human and direct tone, no corporate phrasing. At most 1 hashtag.',
  },
  tiktok: {
    label: 'TikTok', formats: ['video'], defaultFormat: 'video', defaultTime: '19:00',
    rule: 'The body is the caption (up to 300 characters). In visual_brief write the video: the first-second hook line shown or spoken, the 3 to 6 shots in order, and the closing line. Short, 15 to 40 seconds. 3 to 5 hashtags.',
  },
  linkedin: {
    label: 'LinkedIn', formats: ['text', 'image', 'carousel'], defaultFormat: 'text', defaultTime: '09:30',
    rule: 'Professional but human, 600 to 1300 characters, short paragraphs separated by blank lines, the first line is the hook. A takeaway the reader can use. At most 3 hashtags at the end. No emoji spam.',
  },
};
export const PLATFORM_KEYS = Object.keys(PLATFORMS);
export const LANGUAGES = { en: 'English', uk: 'Ukrainian' };
export const MAX_POSTS_PER_RUN = 12;

const pad = (n) => String(n).padStart(2, '0');
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

// What the agent may and may not do — the rules that keep a brand account safe.
const SAFETY = [
  'You write posts for the official accounts of Mon\'Archi, a digital marketing agency (paid ads, reporting, creatives, automation).',
  'Never invent facts: no client names, no results, percentages, revenue, ROAS, awards, testimonials, years of experience, team size or statistics unless they are written in the brand notes below. When a post would be stronger with a real number or case, write it without one and put a short note for the person in fact_check (what to add or verify).',
  'Never promise results, never make comparative or medical/financial claims, never mention a competitor by name, never reuse another brand\'s text.',
  'Every post must be genuinely useful or interesting to the audience (an insight, a how-to, a lesson, a behind-the-scenes angle, a question), not an advertisement for "our services". At most one post in four may be a soft call to action.',
  'No two posts may repeat the same idea, hook or opening line, across networks too. Adapt one idea to a network, do not copy it.',
];

export function buildPrompts({ brand = {}, competitors = [], platforms = [], language = 'en', focus = '', weekStart, recentTopics = [], rejections = [] }) {
  const lang = LANGUAGES[language] || LANGUAGES.en;
  const total = platforms.reduce((s, p) => s + p.count, 0);
  const brandLines = [
    ['Voice and tone', brand.voice], ['Audience', brand.audience], ['Content pillars (topics we stand for)', brand.pillars],
    ['Always', brand.dos], ['Never', brand.donts], ['Preferred formats', brand.formats], ['Facts and materials you may use', brand.materials],
  ].filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${k}: ${clip(v, 3000)}`);
  const system = [
    ...SAFETY,
    `Write every post in ${lang}.`,
    'Network rules:',
    ...platforms.map((p) => `- ${PLATFORMS[p.platform].label} (formats: ${PLATFORMS[p.platform].formats.join(', ')}): ${PLATFORMS[p.platform].rule}`),
    'Answer with ONE JSON object and nothing else: {"posts":[{"platform":"instagram|facebook|threads|tiktok|linkedin","format":"one of the formats of that network","topic":"3 to 8 words","body":"the text to publish","hashtags":"#a #b (or empty)","visual_brief":"what to shoot or design (or empty)","fact_check":"what a person must verify or add (or empty)","day":0-6,"time":"HH:MM"}]}.',
    '"day" is the day of the week to publish, 0 = Monday. Spread the posts over the week, at most two per network a day, at the usual good times for each network (Kyiv time).',
  ].join('\n');
  const user = [
    `Week starting ${weekStart} (Monday). Write exactly: ${platforms.map((p) => `${p.count} for ${PLATFORMS[p.platform].label}`).join(', ')} (${total} posts).`,
    focus ? `Focus for this week (from the team): ${clip(focus, 600)}` : '',
    brandLines.length ? `Brand profile:\n${brandLines.join('\n')}` : 'The brand profile is still empty: write careful, general-purpose expert content for a digital marketing agency and avoid any specifics about Monarchi itself.',
    competitors.length ? `Competitors we watch (to differentiate from, never to name): ${competitors.slice(0, 12).map((c) => clip(c.name, 80) + (c.notes ? ` (${clip(c.notes, 160)})` : '')).join('; ')}` : '',
    recentTopics.length ? `Topics already used recently, do not repeat them:\n${recentTopics.slice(0, 40).map((t) => '- ' + clip(t, 100)).join('\n')}` : '',
    rejections.length ? `The team rejected earlier posts for these reasons, learn from them:\n${rejections.slice(0, 10).map((r) => '- ' + clip(r, 200)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

// The model's text → a clean list of posts. Anything that is not a usable post is dropped; counts are capped per network.
export function parsePosts(text, platforms) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let data;
  try { data = JSON.parse(raw); } catch {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return [];
    try { data = JSON.parse(raw.slice(a, b + 1)); } catch { return []; }
  }
  const list = Array.isArray(data) ? data : data?.posts;
  if (!Array.isArray(list)) return [];
  const left = Object.fromEntries(platforms.map((p) => [p.platform, p.count]));
  const out = [];
  for (const p of list) {
    const platform = String(p?.platform || '').toLowerCase();
    if (!PLATFORMS[platform] || !(left[platform] > 0)) continue;
    const body = clip(p.body, 4000);
    if (body.length < 20) continue;
    const spec = PLATFORMS[platform];
    const format = spec.formats.includes(String(p.format || '').toLowerCase()) ? String(p.format).toLowerCase() : spec.defaultFormat;
    const day = Number.isInteger(Number(p.day)) && Number(p.day) >= 0 && Number(p.day) <= 6 ? Number(p.day) : null;
    const time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(p.time || '')) ? String(p.time).replace(/^(\d):/, '0$1:') : spec.defaultTime;
    left[platform] -= 1;
    out.push({ platform, format, topic: clip(p.topic, 120), body, hashtags: clip(p.hashtags, 300), visual_brief: clip(p.visual_brief, 1500), fact_check: clip(p.fact_check, 500), day, time });
  }
  return out;
}

// When each post goes out: its own day and time when valid, otherwise spread over the week in order. Kyiv clock.
export function scheduleFor(posts, weekStart) {
  return posts.map((p, i) => {
    const day = p.day ?? (i % 5);
    return { ...p, scheduled_for: kyivInstant(addDays(weekStart, day), p.time).toISOString() };
  });
}

// The coming Monday on the Kyiv calendar (today if it is Monday and the week has barely started is NOT assumed: next one).
export function nextMonday(todayYmd, weekdayMon1) {
  return addDays(todayYmd, weekdayMon1 === 1 ? 7 : 8 - weekdayMon1);
}

export function validRequest(body) {
  const errors = [];
  const platforms = (Array.isArray(body?.platforms) ? body.platforms : []).map((p) => ({ platform: String(p?.platform || '').toLowerCase(), count: Math.floor(Number(p?.count)) }))
    .filter((p) => PLATFORMS[p.platform] && p.count >= 1);
  if (!platforms.length) errors.push('Оберіть хоча б одну мережу.');
  if (new Set(platforms.map((p) => p.platform)).size !== platforms.length) errors.push('Мережа вказана двічі.');
  const total = platforms.reduce((s, p) => s + Math.min(p.count, 7), 0);
  if (total > MAX_POSTS_PER_RUN) errors.push(`За один запуск — не більше ${MAX_POSTS_PER_RUN} постів.`);
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.weekStart || '')) ? body.weekStart : null;
  if (!weekStart) errors.push('Вкажіть початок тижня.');
  return { errors, platforms: platforms.map((p) => ({ ...p, count: Math.min(p.count, 7) })), weekStart, language: LANGUAGES[body?.language] ? body.language : 'en', focus: clip(body?.focus, 600) };
}
