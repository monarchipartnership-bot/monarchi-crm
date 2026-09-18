import { pad2 } from './dateHelpers';

function fmtDIso(isoDateStr) {
  const [, m, d] = isoDateStr.split('-');
  return `${pad2(+d)}.${pad2(+m)}`;
}

// Merges same-named clients (case-insensitive) logged across multiple daily
// reports into one row per client, with a chronological note per day —
// "10.08: ... " joined with newlines. First occurrence's platform/leadType win.
export function aggregateDailyClients(dailyRows) {
  const order = [];
  const map = {};
  dailyRows.forEach((row) => {
    const dateLabel = fmtDIso(row.report_date);
    const clients = row.data?.clients || [];
    clients.forEach((c) => {
      const name = (c.name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!map[key]) { map[key] = { name, platform: c.platform, leadType: c.leadType, title: c.title || '', notes: [] }; order.push(key); }
      if (c.text && c.text.trim()) map[key].notes.push(`${dateLabel}: ${c.text.trim()}`);
    });
  });
  return order.map((key) => {
    const e = map[key];
    return { name: e.name, platform: e.platform, leadType: e.leadType, title: e.title, text: e.notes.join('\n'), fromDaily: true };
  });
}
