// Small line icons of the Knowledge Base (plain SVG strings, drawn with currentColor).
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

// one icon per category `key` (kb_categories.key, seeded by the migration); anything unknown gets a quiet circle
const CATEGORY_ICONS = {
  'about-company': svg('<path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16"/><path d="M13 9h6a1 1 0 0 1 1 1v11"/><path d="M8 8h.01M8 12h.01M8 16h.01"/>'),
  'client-journey': svg('<path d="M9 20l-5-2V6l5 2m0 12l6-2m-6 2V8m6 10l5 2V6l-5-2m0 16V6m0 0L9 8"/>'),
  access: svg('<circle cx="8" cy="15" r="4"/><path d="M10.5 12.5 20 3m-4 1 2 2m-6 2 2 2"/>'),
  channels: svg('<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M16 9a3 3 0 0 1 0 6m2-9a7 7 0 0 1 0 12"/>'),
  'landing-pages': svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01"/>'),
  metrics: svg('<path d="M4 20V10m6 10V4m6 16v-7"/>'),
  seasonality: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
};
export const catIcon = (key) => CATEGORY_ICONS[key] || svg('<circle cx="12" cy="12" r="8"/>');

export const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'),
  back: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  arrowLeft: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M12 3h5.5A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5H12"/>'),
  home: svg('<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
};
