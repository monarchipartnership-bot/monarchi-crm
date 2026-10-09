// Builds a presentation from a saved project report. A pure function (no interface,
// no network): the "Презентація" page uses it, and so will the AI agent. Every figure
// comes from computeMetric() over the report's numbers, so the deck can never show a
// number the report does not.
import { METRIC_SETS, computeMetric, deltaPct, metricMeta } from '../reportMetrics.js';
import { visibleKeys } from '../periodReport.js';
import { text, listText } from './textModel.js';
import { paginateBlocks } from './textFit.js';
import { emptyDeck, labels, periodLabel, platformName, uid } from './deckModel.js';

// How much fits on one slide (the editor still warns when a manual edit overflows).
export const PER_PAGE = { metricslist: 12, kpigrid: 6, tableRows: 8, tableCols: 4, dynamics: 8, listItems: 8 };

// Splits into the fewest pages that fit `n` per page, as even as possible (12 rows with 9 per page → 6 + 6, not 9 + 3).
const chunk = (arr, n) => {
  const pages = Math.max(1, Math.ceil(arr.length / n));
  const size = Math.ceil(arr.length / pages);
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export function fmtValue(value, format, currency, lang = 'en') {
  if (value == null || !Number.isFinite(value)) return '—';
  const loc = lang === 'uk' ? 'uk-UA' : 'en-US';
  if (format === 'money') {
    // Whole amounts from 100 up (cents add noise to a client slide), cents below that (CPC, CPM).
    const digits = Math.abs(value) >= 100 ? 0 : 2;
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value); } catch { /* fall through */ }
  }
  const n = value.toLocaleString(loc, { maximumFractionDigits: 2 });
  if (format === 'percent') return n + '%';
  if (format === 'ratio') return n + 'x';
  return n;
}

export function fmtDelta(delta, lang = 'en') {
  if (delta == null) return '—';
  const n = Math.abs(delta).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { maximumFractionDigits: 1 });
  if (Math.abs(delta) < 0.05) return '0%';
  return `${delta > 0 ? '+' : '−'}${n}%`;
}

const metricText = (key, base, custom, currency, lang) => {
  const m = metricMeta(key, custom);
  return fmtValue(base ? computeMetric(key, base, custom) : null, m.format, currency, lang);
};

// "- item" / "1. item" lines of the report text → list items; blank lines separate paragraphs.
function splitList(str) {
  return String(str || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// Report texts are split into slides by the height they really take (see textFit.js), not by length.
const stripMarker = (l) => String(l).replace(/^\s*(?:[-–•*]|\d+[.)])\s+/, '').trim();

export function paginateLines(lines, style) {
  return paginateBlocks('list', lines.map(stripMarker).filter(Boolean), style, PER_PAGE.listItems);
}

export function paginateParagraphs(str, style) {
  const paras = String(str || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return paginateBlocks('paragraph', paras, style);
}

const withPart = (title, i, total, L) => title + L.part(i + 1, total);

// project: { name, business_type }, report: a project_reports row, custom: the project's custom metrics.
export function buildDeckFromReport({ project, report, platform, style = 'brand-pulse', lang = 'en', custom = [], client }) {
  const rd = report.data || {};
  const kind = rd.kind || 'ecom';
  const L = labels(lang);
  const plat = rd.platforms?.[platform];
  const currency = plat?.currency || 'USD';
  const periodType = report.period_type;
  const periodText = periodLabel(periodType, report.period_start, report.period_end, lang);
  const prevTotal = rd.previous?.platforms?.[platform]?.total || null;
  const cur = plat?.total || null;
  const keys = visibleKeys(METRIC_SETS[kind], custom);

  const deck = emptyDeck({
    projectId: report.project_id, reportId: report.id, periodType, periodStart: report.period_start, periodEnd: report.period_end,
    platform, style, lang, kind, currency, client: client || project?.name || '', period: periodText,
  });
  const slides = [];
  const toc = [];

  slides.push({ id: uid(), type: 'title', data: { title1: text(platformName(platform)), title2: text(L.reportTitle) } });
  const agendaSlot = { id: uid(), type: 'agenda', data: { heading: text(L.agenda), items: listText(['-'], 'number') } };
  slides.push(agendaSlot);

  // Key metrics (+ change vs the previous period under each value)
  if (cur) {
    toc.push(L.keyMetrics);
    const items = keys.map((k) => {
      const m = metricMeta(k, custom);
      const d = prevTotal ? deltaPct(computeMetric(k, cur, custom), computeMetric(k, prevTotal, custom)) : null;
      return { label: lang === 'uk' ? m.label : m.en, value: metricText(k, cur, custom, currency, lang), delta: prevTotal ? fmtDelta(d, lang) : '' };
    });
    const pages = chunk(items, PER_PAGE.metricslist);
    pages.forEach((page, i) => slides.push({ id: uid(), type: 'metricslist', data: { heading: text(withPart(L.keyMetrics, i, pages.length, L)), items: page } }));

    const kpiKeys = (kind === 'leadgen' ? ['spend', 'leads', 'cpl', 'ctr'] : ['spend', 'revenue', 'roas', 'purchases', 'aov', 'cpp']).filter((k) => keys.includes(k));
    toc.push(L.kpi);
    slides.push({
      id: uid(), type: 'kpigrid',
      data: {
        heading: text(L.kpi),
        cards: kpiKeys.map((k) => {
          const m = metricMeta(k, custom);
          const d = prevTotal ? deltaPct(computeMetric(k, cur, custom), computeMetric(k, prevTotal, custom)) : null;
          return { label: lang === 'uk' ? m.label : m.en, value: metricText(k, cur, custom, currency, lang), delta: prevTotal ? fmtDelta(d, lang) : '' };
        }),
      },
    });
  }

  // Tables with metrics in rows and groups / campaigns in columns (the managers' sheet layout)
  const tableKeys = keys;
  const colTable = (title, columns) => {
    const rowChunks = chunk(tableKeys, PER_PAGE.tableRows);
    const colChunks = chunk(columns, PER_PAGE.tableCols);
    const total = rowChunks.length * colChunks.length;
    let n = 0;
    colChunks.forEach((cols) => rowChunks.forEach((rows) => {
      slides.push({
        id: uid(), type: 'campaignTable',
        data: {
          heading: text(withPart(title, n, total, L)), corner: L.metric, columns: cols.map((c) => c.name),
          rows: rows.map((k) => {
            const m = metricMeta(k, custom);
            return { label: lang === 'uk' ? m.label : m.en, cells: cols.map((c) => metricText(k, c.base, custom, currency, lang)) };
          }),
        },
      });
      n += 1;
    }));
  };
  if (plat?.groups?.length && rd.options?.groups !== false) {
    toc.push(L.byGroups);
    colTable(L.byGroups, plat.groups.map((g) => ({ name: g.name === 'Інше' ? L.other : g.name, base: g })));
  }
  const picked = (rd.selection || []).filter((s) => s.startsWith(platform + '|')).map((s) => s.slice(platform.length + 1));
  const campaigns = (plat?.campaigns || []).filter((c) => picked.includes(c.name)).sort((a, b) => (b.spend || 0) - (a.spend || 0));
  if (campaigns.length) {
    toc.push(L.byCampaigns);
    colTable(L.byCampaigns, campaigns.map((c) => ({ name: c.name, base: c })));
  }

  // Change versus the previous period
  if (cur && prevTotal) {
    toc.push(L.dynamics);
    const rows = keys.map((k) => {
      const m = metricMeta(k, custom);
      const a = computeMetric(k, cur, custom);
      const b = computeMetric(k, prevTotal, custom);
      return { label: lang === 'uk' ? m.label : m.en, prev: metricText(k, prevTotal, custom, currency, lang), change: fmtDelta(deltaPct(a, b), lang), cur: metricText(k, cur, custom, currency, lang) };
    });
    const pages = chunk(rows, PER_PAGE.dynamics);
    pages.forEach((page, i) => slides.push({ id: uid(), type: 'dynamicsTable', data: { heading: text(withPart(L.dynamics, i, pages.length, L)), headers: [L.metric, L.previous, L.change, L.current], rows: page } }));
  }

  // Texts of the report
  const sec = rd.sections || {};
  const addList = (title, str) => {
    const pages = paginateLines(splitList(str), style);
    if (!pages.length) return;
    toc.push(title);
    pages.forEach((page, i) => slides.push({ id: uid(), type: 'bullets', data: { heading: text(withPart(title, i, pages.length, L)), list: listText(page, 'bullet') } }));
  };
  addList(L.whatWasDone, sec.whatWasDone);
  const concl = paginateParagraphs(sec.conclusion, style);
  if (concl.length) {
    toc.push(L.conclusion);
    concl.forEach((page, i) => slides.push({ id: uid(), type: 'paragraph', data: { heading: text(withPart(L.conclusion, i, concl.length, L)), body: { paras: page.map((p) => ({ runs: [{ t: p }] })) } } }));
  }
  addList(L.plans, sec.plans);

  agendaSlot.data.items = listText(toc.length ? toc : [L.keyMetrics], 'number');
  slides.push({ id: uid(), type: 'closing', data: { heading: text(L.thanks), body: text(L.thanksBody) } });

  deck.slides = slides;
  return deck;
}
