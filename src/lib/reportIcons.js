// Decorative icons for the Sales report pages (Daily/Weekly/Monthly/Annual) —
// purely visual, keyed by channel id or literal section/metric label text.
// Same minimalist stroke style as Sidebar/icons.js (viewBox 0 0 24 24, no
// fill), styled via the wrapping badge span's CSS, not an inline class.

const svg = (inner) => `<svg viewBox="0 0 24 24">${inner}</svg>`;
// Same shape as `svg`, but sets its own fixed color via inline style so it
// wins over the container's `color: var(--purple)` default through
// `stroke: currentColor` — see reportPage.css's `.kcard-icon svg` etc.
const coloredSvg = (color, inner) => `<svg viewBox="0 0 24 24" style="color:${color}">${inner}</svg>`;

// ---- Upwork sub-channels + LinkedIn (ChannelBlock/MonthlyChannelBlock title) ----
export const CHANNEL_ICONS = {
  mb: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'), // Manual Bidding — target
  inv: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'), // Invites — envelope
  dm: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>'), // Direct Message — chat
  con: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M9 14.5l2 2 4-4.5"/>'), // Consultations — calendar-check
  pc: svg('<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>'), // Project Catalog — grid
  gm: svg('<circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>'), // GetMany — share
  li: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8.2" r="1.6"/><path d="M8 11.2v6.8"/><path d="M12.5 18v-4a2 2 0 0 1 4 0v4M12.5 11.2v6.8"/>'), // LinkedIn
};

// ---- Section headers (.stitle), keyed by their exact Ukrainian/EN text ----
export const SECTION_ICONS = {
  // Real Upwork brand mark — fill is set on the inner <path> itself, not the
  // <svg> root, so it isn't affected by the container's `fill: none` rule.
  Upwork: '<svg viewBox="0 0 24 24"><path d="M18.561 13.158c-1.102 0-2.135-.467-3.074-1.227l.228-1.076.008-.042c.207-1.143.849-3.06 2.839-3.06 1.492 0 2.703 1.212 2.703 2.703-.001 1.489-1.212 2.702-2.704 2.702zm0-8.14c-2.539 0-4.51 1.649-5.31 4.366-1.22-1.834-2.148-4.036-2.687-5.892H7.828v7.112c-.002 1.406-1.141 2.546-2.547 2.548-1.405-.002-2.543-1.143-2.545-2.548V3.492H0v7.112c0 2.914 2.37 5.303 5.281 5.303 2.913 0 5.283-2.389 5.283-5.303v-1.19c.529 1.107 1.182 2.229 1.974 3.221l-1.673 7.873h2.797l1.213-5.71c1.063.679 2.285 1.109 3.686 1.109 3 0 5.439-2.452 5.439-5.45 0-3-2.439-5.439-5.439-5.439z" fill="#14A800"/></svg>',
  LinkedIn: CHANNEL_ICONS.li,
  Фінанси: svg('<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11"/><path d="M9.3 9.2c0-1.3 1.2-2.4 2.7-2.4s2.7 1 2.7 2.1c0 2.7-5.4 1.3-5.4 4 0 1.2 1.2 2.1 2.7 2.1s2.7-1 2.7-2.1"/>'),
  Клієнти: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 20a5.3 5.3 0 0 0-3-4.8"/>'),
  Задачі: svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h.01M8 12h.01M8 16h.01"/><path d="M11.5 8h5M11.5 12h5M11.5 16h5"/>'),
  Місяці: svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M7 13.5h2M11 13.5h2M15 13.5h2M7 17h2M11 17h2"/>'),
  'Річні підсумки': svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v9h9"/><path d="M12 12L6.5 17.5"/>'),
  'Тренди за місяцями': svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  'Виконано за день': svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>'),
  'Плани на завтра': svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 15l3-3 2.5 2.5L18 10"/>'),
};

// ---- Metric/ratio labels (kcard-label), matched by keyword ----
const FUNNEL = coloredSvg('#8B5CF6', '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>'); // any "X to Y" conversion metric
const METRIC_ICONS = {
  coverLetter: coloredSvg('#7C3AED', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15.5 15.8 8.7a1.4 1.4 0 0 1 2 2L11 17.5 8 18z"/>'),
  answers: coloredSvg('#7652C8', '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8"/><path d="M8 13h5"/>'),
  viewed: coloredSvg('#3B82F6', '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  calls: coloredSvg('#0891B2', '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/><path d="M15 3a6 6 0 0 1 6 6"/>'),
  qualified: coloredSvg('#16A36A', '<path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>'),
  contracts: coloredSvg('#D58A18', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 14h4"/><path d="M8 18h3"/><path d="m14.5 17.5 1.5 1.5 3-3"/>'),
  connections: svg('<path d="M9 15l6-6"/><path d="M8.4 13.6l-1.8 1.8a3 3 0 0 0 4.2 4.2l1.8-1.8"/><path d="M15.6 10.4l1.8-1.8a3 3 0 0 0-4.2-4.2l-1.8 1.8"/>'),
  leads: svg('<path d="M5 3v18"/><path d="M5 4h12l-2.5 3.5L17 11H5"/>'),
  count: svg('<path d="M5 9h14M5 15h14M10 4L8 20M16 4l-2 16"/>'),
  default: svg('<path d="M4 20V10M12 20V4M20 20v-7"/>'),
};

export function metricIcon(label) {
  if (/ to /i.test(label)) return FUNNEL;
  if (/Cover Letter/i.test(label)) return METRIC_ICONS.coverLetter;
  if (/Qualified Leads/i.test(label)) return METRIC_ICONS.qualified;
  if (/Answers/i.test(label)) return METRIC_ICONS.answers;
  if (/Viewed/i.test(label)) return METRIC_ICONS.viewed;
  if (/Calls/i.test(label)) return METRIC_ICONS.calls;
  if (/Contracts/i.test(label)) return METRIC_ICONS.contracts;
  if (/Connections/i.test(label)) return METRIC_ICONS.connections;
  if (/Leads/i.test(label)) return METRIC_ICONS.leads;
  if (/Кількість/i.test(label)) return METRIC_ICONS.count;
  return METRIC_ICONS.default;
}
