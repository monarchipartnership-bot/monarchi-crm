export const SEASON_LABEL = { winter: 'Зима', spring: 'Весна', summer: 'Літо', autumn: 'Осінь' };

export const SEASON_ICON = {
  winter: '<svg viewBox="0 0 24 24"><path d="M12 2v20M5 6.5l14 11M5 17.5l14-11M2.2 12h19.6"/></svg>',
  spring: '<svg viewBox="0 0 24 24"><path d="M12 21V11M12 11C12 6 8 3 4 3c0 6 3 9 8 8zM12 11c0-4.5 3.2-7.5 7.5-7.5C19.5 8.5 17 11.5 12 11z"/></svg>',
  summer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  autumn: '<svg viewBox="0 0 24 24"><path d="M12 2c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9z"/><path d="M12 16v6"/></svg>',
};

export function seasonOf(m) {
  if (m === 12 || m === 1 || m === 2) return 'winter';
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  return 'autumn';
}
