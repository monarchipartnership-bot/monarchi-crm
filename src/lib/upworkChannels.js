import { normText } from './monthlyAggregation';

// Upwork acquisition channels, keyed like the Weekly report's CHANNELS
// (weeklyLogic.js) so a lead row's `upworkChannel` lines up with the channel
// block it belongs to. LinkedIn is its own platform, not an Upwork channel.
export const UPWORK_CHANNELS = [
  { key: 'mb', label: 'Manual Bidding' },
  { key: 'inv', label: 'Invites' },
  { key: 'dm', label: 'Direct Message' },
  { key: 'con', label: 'Consultations' },
  { key: 'pc', label: 'Project Catalog' },
  { key: 'gm', label: 'GetMany' },
];
export const UPWORK_CHANNEL_OPTIONS = UPWORK_CHANNELS.map((c) => ({ value: c.key, label: c.label }));

// A lead from Upwork must say through which Upwork channel it came.
export function needsUpworkChannel(row) {
  return row?.platform === 'Upwork' && !row?.upworkChannel;
}

// One entry per client (same normalized-name rule the reports use), so a lead
// mentioned on several days or in several weeks counts once.
function uniqueLeads(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    const key = normText(r.name || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// { mb: n, inv: n, ... } — Upwork leads per Upwork channel.
export function countLeadsByUpworkChannel(rows) {
  const counts = Object.fromEntries(UPWORK_CHANNELS.map((c) => [c.key, 0]));
  for (const r of uniqueLeads(rows)) {
    if (r.platform === 'Upwork' && r.upworkChannel in counts) counts[r.upworkChannel] += 1;
  }
  return counts;
}

// [{ label, count }] — leads per source channel, biggest first; rows without
// a channel are grouped under "Без каналу".
export function countLeadsByChannel(rows) {
  const map = new Map();
  for (const r of uniqueLeads(rows)) {
    const label = (r.channel || '').trim() || 'Без каналу';
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
