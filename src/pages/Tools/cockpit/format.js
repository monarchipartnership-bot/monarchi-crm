// Small formatting helpers of the project cockpit (pure functions).

// «щойно», «4 хв тому», «3 год тому», «вчора», then the date 28.10
export function fmtAgo(iso, now = new Date()) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(t)) return '';
  const min = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} год тому`;
  const d = Math.round(h / 24);
  if (d === 1) return 'вчора';
  const dt = new Date(t);
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// the day of the update for the table of requests: «сьогодні» or the date
export function fmtDay(iso, now = new Date()) {
  const t = iso ? new Date(iso) : null;
  if (!t || Number.isNaN(t.getTime())) return '';
  if (t.toDateString() === now.toDateString()) return 'сьогодні';
  return `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export const fmtUsd = (n) => `$${(Number(n) || 0).toFixed(2)}`;

// «MD» from «Mellow Diamond»
export function initials(name = '') {
  const w = String(name).trim().split(/[\s-]+/).filter(Boolean);
  if (!w.length) return '·';
  return (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
}

export const TONE_LABEL = { ok: 'усе гаразд', attention: 'чекає на вас', problem: 'потрібна увага' };

// a line about the results of a request: «6 креативів · 2 на перегляд»
export function creativesLine(c) {
  if (!c || !c.total) return 'ще немає креативів';
  const parts = [`${c.total} ${plural(c.total, 'креатив', 'креативи', 'креативів')}`];
  if (c.review) parts.push(`${c.review} на перегляд`);
  if (c.failed) parts.push(`${c.failed} ${plural(c.failed, 'помилка', 'помилки', 'помилок')}`);
  return parts.join(' · ');
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
