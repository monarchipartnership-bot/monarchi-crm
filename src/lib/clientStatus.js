// Client lifecycle status — shared between ClientProfile.jsx (the pill next
// to the name) and ClientsDirectory.jsx (the "Статус" column/filter) so
// both surfaces always show the same values in the same colors. Stored as
// the literal label directly on the row (clients.status), same convention
// as contact_type/source/platform — no separate id/code column.
export const STATUSES = ['Новий', 'В роботі', 'Активний', "На зв'язку", 'Втрачений'];

export const STATUS_META = {
  'Новий': { color: '#7C3AED', tint: '#EDE7FB' },
  'В роботі': { color: '#16A34A', tint: '#DCFCE7' },
  'Активний': { color: '#0EA5E9', tint: '#E0F2FE' },
  "На зв'язку": { color: '#CA8A04', tint: '#FEF9C3' },
  'Втрачений': { color: '#DC2626', tint: '#FEE2E2' },
};
