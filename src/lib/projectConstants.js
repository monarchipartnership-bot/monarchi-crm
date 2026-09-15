export const STATUS_LABEL = { active: 'Поточний', paused: 'На паузі', completed: 'Завершено' };
export const SERVICES = ['Google Ads', 'Meta Ads', 'TikTok Ads', 'SEO', 'AI Development', 'Web Development', 'Email Marketing', 'Content Marketing'];

export function fmtIsoDate(iso) {
  if (!iso) return null;
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
