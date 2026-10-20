export const STATUS_LABEL = { active: 'Поточний', paused: 'На паузі', completed: 'Завершено' };
export const SERVICES = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'SEO', 'AI Development', 'Web Development', 'Email Marketing', 'Content Marketing'];

export function fmtIsoDate(iso) {
  if (!iso) return null;
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

// Share of the project's period that has passed, for medallion rings: 100 when finished or when the dates are not both known.
export function periodShare(p) {
  if (!p || p.status === 'completed' || !p.start_date || !p.end_date) return 100;
  const start = Date.parse(p.start_date);
  const end = Date.parse(p.end_date);
  if (!(end > start)) return 100;
  return Math.max(0, Math.min(100, Math.round(((Date.now() - start) / (end - start)) * 100)));
}
