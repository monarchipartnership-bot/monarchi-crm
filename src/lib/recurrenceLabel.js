const WEEKDAY_SHORT = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

// Human-readable description of a task's recurrence_rule — shared between
// TaskBadges (tooltip on the compact recurring icon) and TaskDetailModal
// (the "Повторення" field in the full view).
export function recurrenceLabel(rule) {
  if (!rule) return '';
  if (rule.type === 'daily') return 'Повторюється щодня';
  if (rule.type === 'monthly') return `Повторюється щомісяця${rule.dayOfMonth ? ` (${rule.dayOfMonth} число)` : ''}`;
  if (rule.type === 'weekly') {
    const days = (rule.weekdays || []).map((d) => WEEKDAY_SHORT[d]).join(', ');
    return `Повторюється по днях: ${days || '—'}`;
  }
  return '';
}
