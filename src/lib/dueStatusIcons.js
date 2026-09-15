// Icons for the due-status badge (deriveDueStatus) — same minimalist
// stroke style as taskFieldIcons.js. The overdue "!" dot is a zero-length
// path segment, which with round linecaps (see .due-badge svg in CSS)
// renders as a small round dot without needing a filled shape.

export const DUE_STATUS_ICONS = {
  overdue: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 9.5v4.2"/><path d="M12 16.6v.1"/></svg>',
  due_today: '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.6L21 10l-5.2 4.3L17.4 21 12 17.3 6.6 21l1.6-6.7L3 10l6.4-1.4z"/></svg>',
  upcoming: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  no_date: '<svg viewBox="0 0 24 24"><path d="M3 8h13a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2z"/><path d="M3 8V6a2 2 0 0 1 2-2h9"/><path d="M13 12h6"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6"/></svg>',
  cancelled: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>',
};
