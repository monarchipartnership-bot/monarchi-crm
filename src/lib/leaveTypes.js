// Shared "type" taxonomy for leave_requests — one place for every icon,
// label and color so the picker (Account), the requests table, LeaveCard
// tags and the team calendar dots all stay visually consistent.

const PALM_ICON = '<svg viewBox="0 0 24 24"><path d="M12 21V10"/><path d="M12 10C10 6 6 5 3 7c2 3 5 4 9 3z"/><path d="M12 10c2-4 6-5 9-3-2 3-5 4-9 3z"/><path d="M12 10c-1-3-1-6 1-8"/></svg>';
const SUN_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
const STETHOSCOPE_ICON = '<svg viewBox="0 0 24 24"><path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M6 3H4.5M14 3h1.5"/><circle cx="18" cy="16" r="3"/><path d="M10 13v1a5 5 0 0 0 5 5"/></svg>';
const WALLET_ICON = '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 12h3"/><path d="M3 9h18"/></svg>';
const HOUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/></svg>';

export const LEAVE_TYPES = [
  { key: 'vacation', label: 'Відпустка', icon: PALM_ICON, color: '#16A34A', tint: '#E7F6EC' },
  { key: 'dayoff', label: 'Вихідний', icon: SUN_ICON, color: '#0D9488', tint: '#E1F5F2' },
  { key: 'sick', label: 'Лікарняний', icon: STETHOSCOPE_ICON, color: '#2563EB', tint: '#E8F0FE' },
  { key: 'paid_dayoff', label: 'Оплачуваний вихідний', icon: WALLET_ICON, color: '#CA8A04', tint: '#FDF3D9' },
  { key: 'other', label: 'Інше', icon: HOUSE_ICON, color: '#EA580C', tint: '#FDEDE3' },
];

const BY_KEY = Object.fromEntries(LEAVE_TYPES.map((t) => [t.key, t]));

// Falls back to "vacation" for any legacy/unknown value so old rows (or a
// type this list doesn't know about yet) still render something sensible.
export function leaveTypeInfo(key) {
  return BY_KEY[key] || LEAVE_TYPES[0];
}
