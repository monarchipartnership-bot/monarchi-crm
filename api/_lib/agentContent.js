// The words and the readings of the SMM content agents, as pure code (no network, no database): the user prompt each role is given,
// how its JSON answer is read back, and the rule that decides when the quality controller sends a post back.
// The system prompt = the editable instruction of the agent + the locked rules (src/lib/agents/locked.js).
import { composeSystem } from '../../src/lib/agents/locked.js';
import { kyivInstant } from '../../src/lib/agentSchedule.js';
import { brandBlock, LANGUAGES, MAX_POSTS_PER_RUN, PLATFORMS } from './smmContent.js';

const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function readJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(raw); } catch {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  }
}

const platformRule = (p) => `- ${PLATFORMS[p].label} (formats: ${PLATFORMS[p].formats.join(', ')}): ${PLATFORMS[p].rule}`;
const brandText = (brand) => {
  const lines = brandBlock(brand);
  return lines.length ? `Brand profile:\n${lines.join('\n')}` : 'The brand profile is still empty: write careful, general-purpose expert content for a digital marketing agency and avoid any specifics about Monarchi itself.';
};

// ------------------------------------------------------------------------------------------------------------ strategist
// platforms: [{ platform, count }]. research: { competitors: [lines], seo: [lines], social: [lines] }.
export function buildStrategistPrompts({ body, brand = {}, platforms = [], language = 'en', focus = '', weekStart, recentTopics = [], rejections = [], research = {} }) {
  const total = platforms.reduce((s, p) => s + p.count, 0);
  const system = composeSystem('strategist', body, { language: LANGUAGES[language] || LANGUAGES.en, platformRules: platforms.map((p) => platformRule(p.platform)) });
  const section = (title, lines, max = 8) => (lines?.length ? `${title}\n${lines.slice(0, max).map((l) => '- ' + clip(l, 900)).join('\n')}` : '');
  const user = [
    `Week starting ${weekStart} (Monday). Plan exactly: ${platforms.map((p) => `${p.count} for ${PLATFORMS[p.platform].label}`).join(', ')} (${total} posts).`,
    focus ? `Focus for this week (from the team): ${clip(focus, 600)}` : '',
    brandText(brand),
    section('What the competitor agent learned from their public pages (take a different angle; never copy, never name them):', research.competitors),
    section('What the SEO review found on our site (turn content gaps into topics when they fit the pillars):', research.seo, 6),
    section('What worked and what did not in our published posts:', research.social, 6),
    recentTopics.length ? `Topics already used recently, do not repeat them:\n${recentTopics.slice(0, 40).map((t) => '- ' + clip(t, 100)).join('\n')}` : '',
    rejections.length ? `The team rejected earlier posts for these reasons, learn from them:\n${rejections.slice(0, 10).map((r) => '- ' + clip(r, 200)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

// → { summary, posts: [{ platform, format, topic, angle, key_points, cta, needs_visual, visual_brief, seo_note, fact_check, day, time }] } or null.
export function parseStrategy(text, platforms) {
  const data = readJson(text);
  const list = Array.isArray(data) ? data : data?.posts;
  if (!Array.isArray(list)) return null;
  const left = Object.fromEntries(platforms.map((p) => [p.platform, Math.min(p.count, MAX_POSTS_PER_RUN)]));
  const posts = [];
  for (const p of list) {
    const platform = String(p?.platform || '').toLowerCase();
    if (!PLATFORMS[platform] || !(left[platform] > 0)) continue;
    const topic = clip(p.topic, 120), angle = clip(p.angle, 600);
    if (!topic && !angle) continue;
    const spec = PLATFORMS[platform];
    const format = spec.formats.includes(String(p.format || '').toLowerCase()) ? String(p.format).toLowerCase() : spec.defaultFormat;
    const day = Number.isInteger(Number(p.day)) && Number(p.day) >= 0 && Number(p.day) <= 6 ? Number(p.day) : null;
    const time = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(p.time || '')) ? String(p.time).replace(/^(\d):/, '0$1:') : spec.defaultTime;
    const visualOnly = format !== 'text' && !(platform === 'facebook' && format === 'link');
    const needs_visual = p.needs_visual === true || p.needs_visual === 'true' || (p.needs_visual == null && visualOnly);
    left[platform] -= 1;
    posts.push({
      platform, format, topic, angle, cta: clip(p.cta, 300), seo_note: clip(p.seo_note, 300), fact_check: clip(p.fact_check, 500),
      key_points: (Array.isArray(p.key_points) ? p.key_points : []).map((k) => clip(k, 300)).filter(Boolean).slice(0, 6),
      needs_visual, visual_brief: needs_visual ? clip(p.visual_brief, 1500) : '', day, time,
    });
  }
  return posts.length ? { summary: clip(data?.summary, 900), posts } : null;
}

// A planned post's schedule: its own day and time, otherwise spread over the week in order (Kyiv clock).
export function scheduleStrategy(posts, weekStart) {
  return posts.map((p, i) => ({ ...p, scheduled_for: kyivInstant(addDays(weekStart, p.day ?? (i % 5)), p.time).toISOString() }));
}

// ------------------------------------------------------------------------------------------------------------ copywriter
const briefLines = (b = {}, post = {}) => [
  `Network: ${PLATFORMS[post.platform]?.label || post.platform}, format: ${post.format}.`,
  `Topic: ${clip(post.topic, 160)}`,
  b.angle ? `Angle: ${clip(b.angle, 700)}` : '',
  b.key_points?.length ? `The text must cover:\n${b.key_points.map((k) => '- ' + clip(k, 300)).join('\n')}` : '',
  b.cta ? `Closing / call to action: ${clip(b.cta, 300)}` : '',
  b.seo_note ? `Search topic this supports: ${clip(b.seo_note, 300)}` : '',
  post.fact_check ? `Strategist's note for the person (keep it in fact_check if still relevant): ${clip(post.fact_check, 400)}` : '',
].filter(Boolean);

const feedbackBlock = (feedback) => (feedback?.length ? `A reviewer sent the previous version back. Fix exactly these points and keep what was fine:\n${feedback.map((f) => '- ' + clip(f, 400)).join('\n')}` : '');

export function buildCopyPrompts({ body, brand = {}, post, feedback = [], language = 'en', previous = '' }) {
  const system = composeSystem('copywriter', body, { language: LANGUAGES[language] || LANGUAGES.en, platformRules: PLATFORMS[post.platform] ? [platformRule(post.platform)] : [] });
  const user = [
    briefLines(post.brief, post).join('\n'),
    brandText(brand),
    previous ? `Previous version:\n${clip(previous, 3000)}` : '',
    feedbackBlock(feedback),
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

export function parseCopy(text) {
  const d = readJson(text);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const body = clip(d.body, 4000);
  if (body.length < 20) return null;
  return { body, hashtags: clip(d.hashtags, 300), fact_check: clip(d.fact_check, 500) };
}

// ------------------------------------------------------------------------------------------------------------ visual
export const ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9', '1.91:1'];
export const DEFAULT_ASPECT = { instagram: '4:5', facebook: '1:1', threads: '1:1', tiktok: '9:16', linkedin: '1:1' };

export function buildVisualPrompts({ body, styleNotes = '', brand = {}, post, feedback = [] }) {
  const system = composeSystem('visual', body);
  const b = post.brief || {};
  const user = [
    briefLines(b, post).join('\n'),
    post.visual_brief ? `The strategist's visual brief: ${clip(post.visual_brief, 1500)}` : '',
    styleNotes ? `Brand visual style (colors, mood, what we like): ${clip(styleNotes, 1500)}` : 'No brand visual style is set yet: use a restrained, modern, clean look.',
    brand.audience ? `Audience: ${clip(brand.audience, 500)}` : '',
    `Suggested aspect ratio for this network: ${DEFAULT_ASPECT[post.platform] || '1:1'}.`,
    feedbackBlock(feedback),
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

export function parseVisual(text, post = {}) {
  const d = readJson(text);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const prompt = clip(d.prompt, 2500);
  if (prompt.length < 20) return null;
  const mode = String(d.mode).toLowerCase() === 'video' ? 'video' : 'image';
  const ratio = ASPECT_RATIOS.includes(String(d.aspect_ratio)) ? String(d.aspect_ratio) : (DEFAULT_ASPECT[post.platform] || '1:1');
  const dur = Math.round(Number(d.duration_seconds) || 0);
  return {
    mode, prompt, negative_prompt: clip(d.negative_prompt, 800), aspect_ratio: ratio,
    duration_seconds: mode === 'video' ? Math.min(15, Math.max(3, dur || 6)) : 0,
    style_tags: (Array.isArray(d.style_tags) ? d.style_tags : []).map((t) => clip(t, 40)).filter(Boolean).slice(0, 8),
    alt_text: clip(d.alt_text, 300), notes: clip(d.notes, 400),
  };
}

// ------------------------------------------------------------------------------------------------------------ quality control
export function buildQcPrompts({ body, brand = {}, post, language = 'en' }) {
  const system = composeSystem('qc', body, { language: LANGUAGES[language] || LANGUAGES.en, platformRules: PLATFORMS[post.platform] ? [platformRule(post.platform)] : [] });
  const v = post.visual_prompt;
  const user = [
    `Post for ${PLATFORMS[post.platform]?.label || post.platform} (format ${post.format}), planned topic: ${clip(post.topic, 160)}.`,
    `TEXT:\n${clip(post.body, 4000)}`,
    post.hashtags ? `HASHTAGS: ${post.hashtags}` : '',
    post.needs_visual ? (v ? `VISUAL PROMPT (${v.mode}, ${v.aspect_ratio}):\n${clip(v.prompt, 1800)}\nAvoid: ${clip(v.negative_prompt, 400)}` : 'VISUAL: still missing.') : 'This post has no visual.',
    post.fact_check ? `Note the writer left for the person who publishes (information only: do NOT raise it as an issue, do not repeat it): ${clip(post.fact_check, 400)}` : '',
    brandText(brand),
    // A second look: the controller checks that its earlier points were fixed instead of inventing new demands every round.
    post.qc?.issues?.length ? `This is a re-check. In the previous round you asked for:\n${post.qc.issues.filter((i) => i.severity !== 'low').map((i) => '- ' + clip(i.comment, 300)).join('\n')}\nCheck whether these are now fixed. Raise a NEW issue only if it is high (a fact, number or claim that is not in the notes); do not raise new medium or low points about parts you did not object to before.` : '',
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

export function parseQc(text) {
  const d = readJson(text);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const sev = (s) => (['high', 'medium', 'low'].includes(String(s).toLowerCase()) ? String(s).toLowerCase() : 'medium');
  const target = (t) => (['text', 'visual', 'both'].includes(String(t).toLowerCase()) ? String(t).toLowerCase() : 'text');
  const issues = (Array.isArray(d.issues) ? d.issues : []).map((i) => ({ target: target(i?.target), severity: sev(i?.severity), comment: clip(i?.comment, 500) })).filter((i) => i.comment).slice(0, 10);
  const asked = String(d.verdict || '').toLowerCase();
  if (!['pass', 'revise'].includes(asked)) return null;
  // The rule of the role is fixed in code, not left to the model's mood: a high issue, or three medium ones, always means revise.
  const mustRevise = issues.some((i) => i.severity === 'high') || issues.filter((i) => i.severity === 'medium').length >= 3;
  return { verdict: mustRevise ? 'revise' : asked, summary: clip(d.summary, 400), issues };
}

// What happens after a review. → { action: 'to_review' | 'rework', targets: ['text'|'visual'], unresolved }
export function decideQc({ qc, rounds = 0, maxRounds = 2, hasVisual = false }) {
  if (qc.verdict === 'pass') return { action: 'to_review', targets: [], unresolved: false };
  if (rounds >= maxRounds) return { action: 'to_review', targets: [], unresolved: true };
  const t = new Set();
  qc.issues.filter((i) => i.severity !== 'low').forEach((i) => { if (i.target !== 'visual') t.add('text'); if (i.target !== 'text' && hasVisual) t.add('visual'); });
  if (!t.size) t.add('text');
  return { action: 'rework', targets: [...t], unresolved: false };
}

// The comments a rework task gets: only the issues that concern that target.
export function feedbackFor(qc, target) {
  return qc.issues.filter((i) => i.severity !== 'low' && (i.target === 'both' || i.target === target)).map((i) => i.comment);
}
