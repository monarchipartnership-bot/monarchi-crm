// What the screens of the Researcher's sections (Сайт, Аудиторія, Ринок і конкуренти) need from the content the agent wrote. Pure; checked in scripts/check-workflow.mjs.
// The areas are the 11 of the document (1.2). Keys are the same as in api/_lib/wf/skills/siteEngine.js.
export const SITE_AREAS = [
  ['terms', 'Ціна, доставка, повернення, оплата'], ['first_screen', 'Перший екран і оффер'], ['product_page', 'Картка товару'], ['trust', 'Довіра'],
  ['checkout', 'Оформлення замовлення'], ['mobile', 'Мобільна версія'], ['speed', 'Швидкість'], ['navigation', 'Навігація і пошук'],
  ['upsell', 'Допродажі'], ['contact', 'Зв’язок'], ['lead_capture', 'Збір контактів'],
];
export const SEV_LABEL = { high: 'Висока', medium: 'Середня', low: 'Низька' };
export const SEV_TONE = { high: 'bad', medium: 'warn', low: 'mute' };
const RANK = { bad: 0, warn: 1, unverified: 2, ok: 3, mute: 4 }; // a finding nobody confirmed yet comes after the confirmed ones

// → rows for the table of the 11 areas, worst first: { key, name, state, label, findings, comparisons, note }
export function siteAreaRows(content) {
  const c = content || {};
  const findings = c.findings || [], ok = c.ok_areas || [], notChecked = c.not_checked || [], compare = c.competitors_compare || [];
  return SITE_AREAS.map(([key, name], order) => {
    const fs = findings.filter((f) => f.area === key);
    const good = fs.filter((f) => f.verified);
    const cmp = compare.filter((x) => x.area === key);
    let state = 'mute', label = 'Не оцінено', note = '';
    if (good.some((f) => f.severity === 'high')) { state = 'bad'; label = 'Проблема'; }
    else if (good.length) { state = 'warn'; label = 'Покращити'; }
    else if (fs.length) { state = 'warn'; label = 'Не підтверджено'; }
    else if (ok.find((o) => o.area === key)) { state = 'ok'; label = 'Добре'; note = ok.find((o) => o.area === key).note; }
    else if (notChecked.find((o) => o.area === key)) { state = 'mute'; label = 'Не перевірено'; note = notChecked.find((o) => o.area === key).reason; }
    return { key, name, state, label, findings: fs, comparisons: cmp, note, order, rank: label === 'Не підтверджено' ? RANK.unverified : RANK[state] };
  }).sort((a, b) => a.rank - b.rank || a.order - b.order);
}

// the counts shown at the top of the site section
export function siteCounts(content) {
  const f = content?.findings || [];
  return { verified: f.filter((x) => x.verified).length, unverified: f.filter((x) => !x.verified).length, notChecked: (content?.not_checked || []).length };
}

export const SEGMENT_STATUS = { confirmed: ['ok', 'Підтверджено'], hypothesis: ['warn', 'Гіпотеза'], unverified: ['bad', 'Не підтверджено'] };
export const SOURCE_NAME = { brief: 'бриф', meta: 'Meta', ga4: 'GA4' };

// the competitors: the table rows of the agent grouped with their comparisons, plus the sites that could not be read
export function competitorCards(content) {
  const c = content || {};
  return (c.table || []).map((row) => ({ ...row, comparisons: (c.comparison || []).filter((x) => x.competitor === row.competitor) }));
}
export const competitorHosts = (content) => [...new Set([...(content?.competitors || []).map((x) => x.host), ...(content?.failed || []).map((x) => x.host)])];
