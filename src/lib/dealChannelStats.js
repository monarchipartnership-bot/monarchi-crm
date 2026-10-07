import { useEffect, useMemo, useState } from 'react';
import { fetchAllDeals } from './api/deals';
import { UPWORK_CHANNELS } from './upworkChannels';

// Per-channel QL / Contract counts derived from the deals themselves:
//   QL       = a deal qualified (MQL or SQL) inside the period — by `qualified_at`
//   Contract = a deal that reached a won stage inside the period — by `closed_at`
// A deal belongs to a report channel block by its Source: Upwork deals go by
// their `upwork_channel` (mb/inv/dm/con/pc/gm), LinkedIn deals to the "li"
// block. Everything else is only counted in the per-source totals.
const UPWORK_KEYS = new Set(UPWORK_CHANNELS.map((c) => c.key));

function localIso(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function inRange(ts, startIso, endIso) {
  if (!ts) return false;
  const iso = localIso(ts);
  return !!iso && iso >= startIso && iso <= endIso;
}

export function blockKeyForDeal(deal) {
  if (deal.source === 'Upwork' && UPWORK_KEYS.has(deal.upwork_channel)) return deal.upwork_channel;
  if (deal.source === 'LinkedIn') return 'li';
  return null;
}

// { byBlock: { mb: { ql, co }, ..., li: { ql, co } }, bySource: [{ label, ql, co }] }
export function computeDealChannelStats(deals, startIso, endIso) {
  const byBlock = {};
  const sources = new Map();
  const bump = (map, key, field) => {
    const cur = map[key] || (map[key] = { ql: 0, co: 0 });
    cur[field] += 1;
  };
  for (const d of deals || []) {
    const isQl = (d.qualification === 'MQL' || d.qualification === 'SQL') && inRange(d.qualified_at, startIso, endIso);
    const isCo = !!d.deal_stages?.is_won && inRange(d.closed_at, startIso, endIso);
    if (!isQl && !isCo) continue;
    const field = (f) => {
      const block = blockKeyForDeal(d);
      if (block) bump(byBlock, block, f);
      const label = (d.source || '').trim() || 'Без каналу';
      const cur = sources.get(label) || { label, ql: 0, co: 0 };
      cur[f] += 1;
      sources.set(label, cur);
    };
    if (isQl) field('ql');
    if (isCo) field('co');
  }
  return { byBlock, bySource: [...sources.values()].sort((a, b) => (b.ql + b.co) - (a.ql + a.co)) };
}

// Loads all deals once and recomputes the stats whenever the period changes.
export function useDealChannelStats(startIso, endIso) {
  const [deals, setDeals] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetchAllDeals().then((rows) => { if (!cancelled) setDeals(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return useMemo(() => computeDealChannelStats(deals, startIso, endIso), [deals, startIso, endIso]);
}
