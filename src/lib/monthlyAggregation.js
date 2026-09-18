// Monthly Report aggregation: merges repeating/evolving clients & tasks from
// a month's weekly_reports rows into single chronological records. Rule-based
// (no AI) — ported 1:1 from monthly.html.

const UA_STOPWORDS = {
  'та': 1, 'і': 1, 'й': 1, 'в': 1, 'у': 1, 'на': 1, 'для': 1, 'з': 1, 'із': 1, 'до': 1, 'по': 1, 'що': 1, 'це': 1, 'та й': 1,
  'the': 1, 'and': 1, 'for': 1, 'with': 1, 'to': 1, 'of': 1, 'a': 1, 'an': 1, 'in': 1, 'on': 1,
};

export function normText(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/["“”'.,!?;:()\-–—]/g, '');
}

function sigWords(s) {
  return normText(s).split(' ').filter((w) => w.length >= 3 && !UA_STOPWORDS[w]);
}

export function textSimilarity(a, b) {
  const na = normText(a), nb = normText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length > 4 && nb.length > 4 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) return 0.85;
  const wa = sigWords(a), wb = sigWords(b);
  if (!wa.length || !wb.length) return 0;
  const setB = {};
  wb.forEach((w) => { setB[w] = 1; });
  let inter = 0;
  wa.forEach((w) => { if (setB[w]) inter++; });
  const unionSet = {};
  wa.concat(wb).forEach((w) => { unionSet[w] = 1; });
  const union = Object.keys(unionSet).length;
  return union ? inter / union : 0;
}

export function groupBySimilarity(entries, threshold = 0.55) {
  const groups = [];
  entries.forEach((e) => {
    if (!String(e.text || '').trim()) return;
    let best = null, bestScore = 0;
    groups.forEach((g) => {
      let score = 0;
      g.forEach((m) => { score = Math.max(score, textSimilarity(e.text, m.text)); });
      if (score > bestScore) { bestScore = score; best = g; }
    });
    if (best && bestScore >= threshold) best.push(e);
    else groups.push([e]);
  });
  groups.forEach((g) => g.sort((a, b) => a.weekIndex - b.weekIndex));
  return groups;
}

export function composeChronology(entries) {
  const runs = [];
  entries.forEach((e) => {
    const last = runs[runs.length - 1];
    if (last && normText(last.text) === normText(e.text) && e.weekIndex === last.to + 1) last.to = e.weekIndex;
    else runs.push({ from: e.weekIndex, to: e.weekIndex, text: e.text });
  });
  if (runs.length === 1 && runs[0].from === runs[0].to) return runs[0].text;
  return runs.map((r) => {
    const label = r.from === r.to ? `Тиждень ${r.from}` : `Тижні ${r.from}–${r.to}`;
    return `${label}: ${r.text}`;
  }).join(' → ');
}

// t_plan/t_done from every week's tasks, merged by fuzzy text similarity into
// one chronological entry per recurring/evolving task.
export function aggregateTasksFromWeeks(rows, section) {
  const entries = [];
  rows.forEach((row) => {
    const d = row.data || {};
    const wi = row.week_index;
    ((d.tasks && d.tasks[section]) || []).forEach((it) => {
      if (it?.text?.trim()) entries.push({ weekIndex: wi, text: it.text });
    });
  });
  return groupBySimilarity(entries).map(composeChronology).filter(Boolean);
}

// Clients from every week, merged by exact normalized name into one record
// with a chronological note per week that mentioned them.
export function aggregateClientsFromWeeks(rows) {
  const byKey = {};
  const order = [];
  rows.forEach((row) => {
    const d = row.data || {};
    const wi = row.week_index;
    (d.clients || []).forEach((c) => {
      const key = normText(c.name || c.text || '');
      if (!key) return;
      if (!byKey[key]) { byKey[key] = []; order.push(key); }
      byKey[key].push({ weekIndex: wi, text: c.text || '', platform: c.platform, leadType: c.leadType, name: c.name, title: c.title || '' });
    });
  });
  return order.map((key) => {
    const list = byKey[key].slice().sort((a, b) => a.weekIndex - b.weekIndex);
    const last = list[list.length - 1];
    const combinedText = composeChronology(list.map((x) => ({ weekIndex: x.weekIndex, text: x.text }))) || '';
    return { name: last.name || '', platform: last.platform, leadType: last.leadType, title: last.title, text: combinedText };
  });
}

function pluralUA(n, one, few, many) {
  const m = Math.abs(n) % 100, n1 = m % 10;
  if (m > 10 && m < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

// Builds a Ukrainian-language draft summary sentence from task completion
// rate + client lead-type breakdown (rule-based, no AI) — for the "✨
// Згенерувати підсумок" button.
export function buildMonthSummary({ doneCount, planCount, clients, monthName, year }) {
  const rate = planCount ? Math.round((doneCount / planCount) * 100) : null;
  const byLead = {};
  clients.forEach((c) => { const k = c.leadType || '—'; byLead[k] = (byLead[k] || 0) + 1; });
  const leadBits = Object.keys(byLead).map((k) => `${byLead[k]} ${k.toLowerCase()}`);

  const parts = [];
  parts.push(
    `За ${monthName} ${year} виконано ${doneCount} ${pluralUA(doneCount, 'задачу', 'задачі', 'задач')}` +
    (planCount ? ` із ${planCount} запланован${planCount === 1 ? 'ої' : 'их'}` : '') +
    (rate !== null ? ` (${rate}%).` : '.')
  );
  if (clients.length) {
    parts.push(
      `Велась робота з ${clients.length} ${pluralUA(clients.length, 'клієнтом', 'клієнтами', 'клієнтами')}` +
      (leadBits.length ? `: ${leadBits.join(', ')}.` : '.')
    );
  } else {
    parts.push('Активної роботи з клієнтами за місяць не зафіксовано.');
  }
  return parts.join(' ');
}

export function fmtCount(v) {
  if (v === null || v === undefined || isNaN(v)) return '0';
  const r = Math.round(v * 100) / 100;
  return Math.abs(r - Math.round(r)) < 0.005 ? String(Math.round(r)) : r.toFixed(2);
}
