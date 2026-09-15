import Papa from 'papaparse';

// Header text variants seen in real Meta Ads Manager / Google Ads exports.
// First match wins per column; comparison is case-insensitive/trimmed.
const COLUMN_ALIASES = {
  spend: ['Amount Spent', 'Amount spent', 'Cost', 'Spend'],
  impressions: ['Impressions'],
  reach: ['Reach'],
  clicks: ['Clicks (All)', 'Clicks'],
  purchases: ['Purchases', 'Conversions'],
  revenue: ['Purchases Conversion Value', 'Purchase Value', 'Conv. value', 'Website Purchases Conversion Value'],
};

function normHeader(h) {
  return (h || '').toString().trim().toLowerCase();
}

// Strips $, commas, % and parses as a number; returns null (not 0) when the
// cell is genuinely blank so a blank cell never masquerades as a real zero.
function parseNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[$,%]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function buildColumnMap(headers) {
  const map = {};
  Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => {
    const normAliases = aliases.map(normHeader);
    const hit = headers.find((h) => normAliases.includes(normHeader(h)));
    if (hit) map[key] = hit;
  });
  return map;
}

// Meta exports always carry a Reach column; Google's don't (Google Ads has no
// "reach" metric in a standard performance export) — cheap, reliable sniff.
function detectPlatform(headers) {
  const norm = headers.map(normHeader);
  if (norm.includes('reach')) return 'meta';
  if (norm.some((h) => h === 'cost')) return 'google';
  return 'other';
}

// Parses a Meta/Google Ads performance-export CSV (one row per day and/or
// campaign) into period totals. Sums matched columns across every row —
// summing raw counts is the correct way to combine per-day/per-campaign rows
// into one period total (unlike ratios such as CTR/ROAS, which must be
// recomputed from the summed totals afterward, never averaged row-by-row).
export function parseAdCsv(text) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  const headers = result.meta?.fields || [];
  const columnMap = buildColumnMap(headers);
  const matchedColumns = Object.keys(columnMap);

  if (!matchedColumns.length) {
    return { platform: 'other', totals: {}, matchedColumns: [], rowCount: 0, error: 'Не вдалося розпізнати жодної колонки в цьому CSV.' };
  }

  const totals = { spend: 0, impressions: 0, reach: 0, clicks: 0, purchases: 0, revenue: 0 };
  let rowCount = 0;
  result.data.forEach((row) => {
    if (!row || Object.values(row).every((v) => v === '' || v === null || v === undefined)) return;
    rowCount++;
    matchedColumns.forEach((key) => {
      const n = parseNum(row[columnMap[key]]);
      if (n !== null) totals[key] += n;
    });
  });

  return { platform: detectPlatform(headers), totals, matchedColumns, rowCount, error: null };
}

// CTR/CPC/CPM/ROAS/ROMI are always derived from the raw totals, never
// stored — this is the single source of truth both AdReportForm's live
// display and parseAdCsv's callers should use.
export function deriveRatios({ spend, impressions, clicks, revenue }) {
  const ctr = impressions ? (clicks / impressions) * 100 : null;
  const cpc = clicks ? spend / clicks : null;
  const cpm = impressions ? (spend / impressions) * 1000 : null;
  const roas = spend ? revenue / spend : null;
  const romi = spend ? ((revenue - spend) / spend) * 100 : null;
  return { ctr, cpc, cpm, roas, romi };
}
