// What happens to the layout when a person works on one metric row of the «Конструктор звіту» (click the metric → up / down / replace / remove). Pure code: it only says what must
// change; the builder applies it (the standard list and the order go to the draft layout, the extra columns of the cabinet are saved at once, an own formula is deleted).
//   keys       the metric rows now, in order              baseKeys   the standard list of the layout (or the report type's own)
//   extraKeys  the extra columns of the cabinet           custom     the project's own formulas [{ key, id, name }]
// → { error } | { noop } | { order?, baseMetrics?, extraKeys?, deleteCustom? }

const isColumn = (k) => String(k).startsWith('mx_');

export function planMetricChange({ action, key, toKey = null, keys = [], baseKeys = [], extraKeys = [], custom = [] }) {
  const i = keys.indexOf(key);
  if (i < 0) return { error: 'Цієї метрики немає в таблиці.' };
  if (action === 'up' || action === 'down') {
    const j = i + (action === 'up' ? -1 : 1);
    if (j < 0 || j >= keys.length) return { noop: true };
    const order = [...keys];
    [order[i], order[j]] = [order[j], order[i]];
    return { order };
  }
  const home = baseKeys.includes(key) ? 'base' : extraKeys.includes(key) ? 'extra' : custom.some((c) => c.key === key) ? 'custom' : null;
  if (!home) return { error: 'Цю метрику не можна змінити тут.' };
  if (action === 'remove') {
    if (keys.length <= 1) return { error: 'У таблиці має лишитися хоча б одна метрика.' };
    if (home === 'base') return { baseMetrics: baseKeys.filter((k) => k !== key) };
    if (home === 'extra') return { extraKeys: extraKeys.filter((k) => k !== key) };
    return { deleteCustom: custom.find((c) => c.key === key) };
  }
  if (action === 'replace') {
    if (!toKey || toKey === key) return { noop: true };
    if (keys.includes(toKey)) return { error: 'Ця метрика вже є в таблиці.' };
    if (home === 'custom') return { error: 'Власну формулу можна лише видалити; створіть іншу метрику через «+ Метрика».' };
    let base = baseKeys;
    let extras = extraKeys;
    if (home === 'base') base = base.filter((k) => k !== key); else extras = extras.filter((k) => k !== key);
    if (isColumn(toKey)) extras = [...extras, toKey]; else base = [...base, toKey];
    return {
      order: keys.map((k) => (k === key ? toKey : k)), // the new metric takes the place of the old one
      ...(base !== baseKeys ? { baseMetrics: base } : {}),
      ...(extras !== extraKeys ? { extraKeys: extras } : {}),
    };
  }
  return { error: 'Невідома дія.' };
}
