import { supabase } from '../supabaseClient';
import { authedPost } from '../adAccounts';

// Mon'Archi SMM (migration 20261016000000_smm.sql): brand profile, competitors, the content plan / approval queue.
// Reads return empty (and warn) when the tables are not there yet, so the page still opens and says what is missing.

export const NETWORKS = {
  instagram: { label: 'Instagram', short: 'IG', color: '#C13584', formats: { image: 'Зображення', carousel: 'Карусель', reel: 'Reels' } },
  facebook: { label: 'Facebook', short: 'FB', color: '#1877F2', formats: { text: 'Текст', image: 'Зображення', link: 'Посилання' } },
  threads: { label: 'Threads', short: 'TH', color: '#21113F', formats: { text: 'Текст', image: 'Зображення' } },
  tiktok: { label: 'TikTok', short: 'TT', color: '#0F9CA8', formats: { video: 'Відео' } },
  linkedin: { label: 'LinkedIn', short: 'IN', color: '#0A66C2', formats: { text: 'Текст', image: 'Зображення', carousel: 'Карусель' } },
};
export const NETWORK_KEYS = Object.keys(NETWORKS);

export const STATUSES = {
  planned: { label: 'У плані', color: '#6B5B8C' },
  producing: { label: 'У виробництві', color: '#2B63C4' },
  qc: { label: 'На контролі якості', color: '#0F9CA8' },
  draft: { label: 'Чернетка', color: '#807394' },
  needs_review: { label: 'На перевірці', color: '#B7791F' },
  approved: { label: 'Схвалено', color: '#2B63C4' },
  published: { label: 'Опубліковано', color: '#1E9E5D' },
  rejected: { label: 'Відхилено', color: '#C2185B' },
};

export const BRAND_FIELDS = [
  { key: 'voice', label: 'Голос і тон', hint: 'Як звучить Monarchi: прямий, спокійний, експертний? Що ми ніколи не скажемо?' },
  { key: 'audience', label: 'Аудиторія', hint: 'Для кого ми пишемо: власники e-commerce, маркетологи, агенції…' },
  { key: 'pillars', label: 'Рубрики (теми, за які ми стоїмо)', hint: 'Наприклад: реклама Meta/Google, звітність, креативи, автоматизація…' },
  { key: 'dos', label: 'Завжди', hint: 'Правила, яких агент має дотримуватись у кожному пості.' },
  { key: 'donts', label: 'Ніколи', hint: 'Заборонені теми, слова, обіцянки, згадки.' },
  { key: 'formats', label: 'Формати', hint: 'Які формати робимо: карусель, Reels, текстові пости…' },
  { key: 'materials', max: 20000, label: 'Факти й матеріали', hint: 'Усе, що агент може використовувати як факти: послуги, кейси, цифри, цитати. Чого тут немає, того він не вигадає.' },
];

const warn = (what, error) => console.warn(`${what} failed`, error);
const nowIso = () => new Date().toISOString();

export async function fetchBrand() {
  const { data, error } = await supabase.from('smm_brand').select('*').eq('id', 1).maybeSingle();
  if (error) { warn('fetchBrand', error); return { brand: null, missing: true }; }
  return { brand: data, missing: false };
}
export async function saveBrand(fields, email) {
  const { data, error } = await supabase.from('smm_brand').upsert({ id: 1, ...fields, updated_by: email || null, updated_at: nowIso() }).select().single();
  if (error) throw error;
  return data;
}

export async function fetchCompetitors() {
  const { data, error } = await supabase.from('smm_competitors').select('*').order('created_at', { ascending: true });
  if (error) { warn('fetchCompetitors', error); return []; }
  return data ?? [];
}
export async function saveCompetitor(row, email) {
  const fields = { name: row.name.trim(), website: (row.website || '').trim(), socials: (row.socials || '').trim(), notes: (row.notes || '').trim() };
  if (row.id) {
    const { data, error } = await supabase.from('smm_competitors').update(fields).eq('id', row.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('smm_competitors').insert({ ...fields, created_by: email || null }).select().single();
  if (error) throw error;
  return data;
}
export async function deleteCompetitor(id) {
  const { error } = await supabase.from('smm_competitors').delete().eq('id', id);
  if (error) throw error;
}

// All posts that matter on screen: everything not yet closed plus the last 200 by date.
export async function fetchPosts() {
  const { data, error } = await supabase.from('smm_posts').select('*').order('scheduled_for', { ascending: true, nullsFirst: false }).limit(500);
  if (error) { warn('fetchPosts', error); return { posts: [], missing: true }; }
  return { posts: data ?? [], missing: false };
}

const POST_FIELDS = ['platform', 'format', 'topic', 'body', 'hashtags', 'visual_brief', 'fact_check', 'scheduled_for', 'status'];
export async function savePost(row, email) {
  const fields = Object.fromEntries(POST_FIELDS.filter((k) => k in row).map((k) => [k, row[k]]));
  if (row.id) {
    const { data, error } = await supabase.from('smm_posts').update({ ...fields, updated_at: nowIso() }).eq('id', row.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('smm_posts').insert({ status: 'draft', source: 'manual', created_by: email || null, ...fields }).select().single();
  if (error) throw error;
  return data;
}
export async function deletePost(id) {
  const { error } = await supabase.from('smm_posts').delete().eq('id', id);
  if (error) throw error;
}

// The approval step: approve, reject (with a reason), send back to review, or mark as published (by hand, optional link).
export async function reviewPost(id, action, { note, url, email } = {}) {
  const base = { reviewed_by: email || null, reviewed_at: nowIso(), updated_at: nowIso() };
  const patch = {
    approve: { status: 'approved', review_note: null, ...base },
    reject: { status: 'rejected', review_note: note || null, ...base },
    reopen: { status: 'needs_review', review_note: null, ...base },
    publish: { status: 'published', published_url: url || null, published_at: nowIso(), ...base },
  }[action];
  if (!patch) throw new Error('unknown action ' + action);
  const { data, error } = await supabase.from('smm_posts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// The content strategist + copywriter (api/smm-generate.js). Takes up to ~a minute.
export function generatePlan({ platforms, weekStart, language, focus }) {
  return authedPost('/api/smm-generate', { platforms, weekStart, language, focus });
}

// What the competitor agent learned (api/smm-competitors-run.js): the newest report of each competitor, failed runs included.
export async function fetchCompetitorReports() {
  const { data, error } = await supabase.from('smm_competitor_reports').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) { warn('fetchCompetitorReports', error); return {}; }
  const latest = {};
  (data || []).forEach((r) => { if (!latest[r.competitor_id]) latest[r.competitor_id] = r; });
  return latest;
}

// Reads the public site of one competitor (or of all that have one). Takes up to a minute or two.
export function runCompetitorAgent(competitorId) {
  return authedPost('/api/smm-competitors-run', competitorId ? { competitorId } : {});
}

// The weekly autopilot of the content team (migration 20261018000000_smm_settings.sql): one row, switched off by default.
export const AUTOPILOT_DEFAULTS = { enabled: false, weekday: 5, time: '12:00', language: 'en', counts: { linkedin: 3, instagram: 2, threads: 2, facebook: 0, tiktok: 0 }, refresh_competitors: true, notify_emails: [] };
export async function fetchSettings() {
  const { data, error } = await supabase.from('smm_settings').select('*').eq('id', 1).maybeSingle();
  if (error) { warn('fetchSettings', error); return null; }
  return data;
}
export async function saveSettings(patch, email) {
  const { data, error } = await supabase.from('smm_settings').update({ ...patch, updated_by: email || null, updated_at: nowIso() }).eq('id', 1).select().single();
  if (error) throw error;
  return data;
}

// The SEO agent (api/smm-seo-audit.js): the newest audits of the public site, and a run (about a minute).
export async function fetchSiteAudits(limit = 10) {
  const { data, error } = await supabase.from('smm_site_audits').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { warn('fetchSiteAudits', error); return []; }
  return data ?? [];
}
// The website analyst (GA4 + Search Console): its newest reports. The table is created by migration 20261032000000.
export async function fetchSiteStats(limit = 6) {
  const { data, error } = await supabase.from('smm_site_stats').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { warn('fetchSiteStats', error); return []; }
  return data ?? [];
}
export function runSeoAudit(url) {
  return authedPost('/api/smm-seo-audit', url ? { url } : {});
}
