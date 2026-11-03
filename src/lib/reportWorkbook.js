// The Excel file of a report: ONE sheet with everything, laid out like the client's own table. One block per report (a week, the month, a custom period):
// a title bar, the table (metrics down, «General advertising metrics» and the groups / campaigns across, each cell with the change against the previous
// period under the value), the text blocks to the right of it (What was done, Conclusion, Plans ...) and under it the most effective creatives as real
// pictures with their numbers. A week is a sheet with one block; a month is a sheet with the weeks one under another and the month summary last.
// The numbers and the texts come from the same functions as the client's page (clientReport.js), so the file never says anything the page does not.
// Everything the network gives (the pictures) is handed in, so scripts/check-core.mjs runs it in Node.
import { dmy, metricInfo, metricTable, monthName, prevName, reportView, viewKeys } from './clientReport.js';
import { monthKey, monthWeeks } from './projectHistory.js';
import { reportBlocks } from './reportTemplate.js';
import { monthNameIn, normLang, trFor } from './clientLang.js';

const PURPLE = 'FF661466';
const LILAC = 'FFF3E8F5';
const GREY = 'FF6B7280';
const BORDER = { style: 'thin', color: { argb: 'FFD9C7DD' } };
const ALL_BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
const TONE = { good: 'FF15803D', bad: 'FFB91C1C', neu: GREY };
const MIN_DATA_COLS = 3; // the creatives sit under the table: at least three columns for them

export const money = (v, currency = 'USD') => {
  if (v == null || v === '' || Number.isNaN(Number(v))) return null;
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(Number(v)); } catch { return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
};

// A saved report row of the project → the block of the sheet: the table, the texts, the creatives. null when the report holds no numbers.
// title / dates are the words of the block's bar; extraKeys / custom are the project's extra metric columns and formulas.
export function reportBlock({ row, title, custom = [], extraKeys = [], platformLabel = '', lang = null }) {
  // a saved report keeps its creatives as { count, items }; the client's model wants the list
  const data = { ...(row.data || {}), creatives: Array.isArray(row.data?.creatives) ? row.data.creatives : row.data?.creatives?.items || [] };
  const report = { id: row.id, type: row.period_type, start: row.period_start, end: row.period_end, toDate: Boolean(data.toDate), status: row.status, updatedAt: row.updated_at, data };
  const view = reportView(report, { kind: data.kind || 'ecom', lang: lang || undefined }); // the report's own language wins, then the one handed in
  if (!view) return null;
  const t = trFor(view.lang);
  const keys = viewKeys(view, { kind: view.kind, columns: extraKeys, custom }, { all: true }); // the team's file has every metric, nothing is hidden
  const table = metricTable(view, { keys, custom, platformLabel, showAll: true });
  const texts = reportBlocks(data).map((b) => ({ key: b.key, title: b.title, text: String(data.sections?.[b.key] || '').trim() })).filter((t) => t.text);
  const creatives = (view.creatives || []).map((c) => ({ caption: c.caption || '', imageUrl: c.imageUrl || '', metrics: c.metrics || {} }));
  const period = `${dmy(view.start)} – ${dmy(view.end)}`;
  const prev = view.prev ? ` · ${t('compared with {name}', { name: prevName(view) })}` : '';
  const now = view.toDate ? ` · ${t('to date')}` : '';
  return {
    id: row.id, kind: view.type, title, subtitle: `${period}${platformLabel ? ` · ${platformLabel}` : ''} · ${view.currency}${now}${prev}`,
    lang: view.lang, currency: view.currency, table, texts, creatives, metricLabel: (k) => metricInfo(k, custom, platformLabel, view.lang).label,
  };
}

// The title of a block in the client's words: «Week 4», «OCTOBER SUMMARY».
export const weekTitle = (n, lang = 'en') => trFor(lang)('Week {n}', { n });
export const monthSummaryTitle = (start, lang = 'en') => trFor(lang)('{month} summary', { month: monthNameIn(monthKey(start), lang) }).toUpperCase();

const valueCell = (cell, column, t = trFor('en')) => {
  const text = [{ text: cell.text, font: { bold: column.kind === 'general' || column.kind === 'sum', size: 11 } }];
  if (cell.isNew) text.push({ text: `\n${t('new')}`, font: { size: 8, color: { argb: GREY } } });
  else if (cell.change) {
    const sign = cell.change.arrow === '▲' ? '▲ +' : cell.change.arrow === '▼' ? '▼ -' : '';
    text.push({ text: `\n${sign}${cell.change.pct}`, font: { size: 8, color: { argb: TONE[cell.change.tone] || GREY } } });
  }
  return text;
};

// → a finished ExcelJS workbook. ExcelJS is handed in (the page loads it only when a file is asked for); fetchImage(url) → { buffer, extension } or null.
export async function buildWorkbook(ExcelJS, blocks, { sheetName = 'Report', fetchImage = async () => null } = {}) {
  const live = blocks.filter(Boolean);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Mon'Archi";
  const ws = wb.addWorksheet(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report', { views: [{ showGridLines: false }] });
  const groupCols = Math.max(MIN_DATA_COLS, ...live.map((b) => Math.max(0, b.table.columns.length - 1))); // the groups / campaigns beside «General»
  const textCols = Math.max(0, ...live.map((b) => b.texts.length));
  const generalCol = 3;
  const lastData = generalCol + groupCols;
  const textStart = lastData + 2;
  const lastCol = textCols ? textStart + textCols - 1 : lastData;
  ws.getColumn(1).width = 2;
  ws.getColumn(2).width = 30;
  ws.getColumn(generalCol).width = 22;
  for (let c = generalCol + 1; c <= lastData; c += 1) ws.getColumn(c).width = 18;
  if (textCols) { ws.getColumn(lastData + 1).width = 2; for (let c = textStart; c <= lastCol; c += 1) ws.getColumn(c).width = 48; }

  let r = 1;
  for (const block of live) {
    // the bar
    ws.mergeCells(r, 2, r, lastCol);
    Object.assign(ws.getCell(r, 2), { value: block.title, font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }, alignment: { vertical: 'middle', indent: 1 } });
    ws.getRow(r).height = 26;
    r += 1;
    ws.mergeCells(r, 2, r, lastCol);
    Object.assign(ws.getCell(r, 2), { value: block.subtitle, font: { size: 10, color: { argb: GREY } }, alignment: { vertical: 'middle', indent: 1 } });
    r += 1;
    // the header of the table and of the texts
    const head = r;
    const headStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: LILAC } }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: ALL_BORDERS };
    Object.assign(ws.getCell(head, 2), { value: trFor(block.lang)('Metric'), ...headStyle, alignment: { ...headStyle.alignment, horizontal: 'left' } });
    block.table.columns.forEach((col, i) => { Object.assign(ws.getCell(head, generalCol + i), { value: col.label, ...headStyle }); });
    block.texts.forEach((t, i) => { Object.assign(ws.getCell(head, textStart + i), { value: t.title, ...headStyle }); });
    ws.getRow(head).height = 34;
    r += 1;
    // the metrics
    const first = r;
    block.table.rows.forEach((row) => {
      Object.assign(ws.getCell(r, 2), { value: row.label, font: { bold: true }, alignment: { vertical: 'middle', wrapText: true }, border: ALL_BORDERS });
      row.cells.forEach((cell, i) => {
        const col = block.table.columns[i];
        const fill = cell.cls === 'best' ? 'FFDCFCE7' : cell.cls === 'worst' ? 'FFFEE2E2' : col.kind === 'sum' ? LILAC : null;
        Object.assign(ws.getCell(r, generalCol + i), { value: { richText: valueCell(cell, col, trFor(block.lang)) }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: ALL_BORDERS, ...(fill ? { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } } } : {}) });
      });
      ws.getRow(r).height = row.cells.some((c) => c.change || c.isNew) ? 32 : 20;
      r += 1;
    });
    const last = Math.max(first, r - 1);
    // the texts: one tall cell each, as high as the table
    block.texts.forEach((t, i) => {
      const c = textStart + i;
      if (last > first) ws.mergeCells(first, c, last, c);
      Object.assign(ws.getCell(first, c), { value: t.text, alignment: { vertical: 'top', wrapText: true }, border: ALL_BORDERS, font: { size: 11 } });
    });
    // the creatives
    if (block.creatives.length) {
      ws.mergeCells(r, 2, r, lastCol);
      Object.assign(ws.getCell(r, 2), { value: trFor(block.lang)('Most effective creatives'), font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: LILAC } }, alignment: { vertical: 'middle', indent: 1 } });
      ws.getRow(r).height = 22;
      r += 1;
      const imgRow = r;
      ws.getRow(imgRow).height = 94;
      ws.getRow(imgRow + 1).height = 48;
      for (let i = 0; i < block.creatives.length && generalCol + i <= lastData; i += 1) {
        const cr = block.creatives[i];
        const c = generalCol + i;
        const got = cr.imageUrl ? await fetchImage(cr.imageUrl).catch(() => null) : null;
        if (got) {
          const id = wb.addImage({ buffer: got.buffer, extension: got.extension || 'png' });
          ws.addImage(id, { tl: { col: c - 1 + 0.06, row: imgRow - 1 + 0.06 }, ext: { width: 120, height: 120 }, editAs: 'oneCell' });
        }
        const m = cr.metrics || {};
        const tw = trFor(block.lang);
        const numbers = [m.purchases != null ? `${m.purchases} ${tw('purchases')}` : null, money(m.spend, block.currency) ? `${tw('spent')} ${money(m.spend, block.currency)}` : null, m.roas != null && !Number.isNaN(Number(m.roas)) ? `ROAS ${Number(m.roas).toFixed(2)}x` : null].filter(Boolean).join(' · ');
        const cap = [`${i + 1}. ${cr.caption}`.trim(), numbers, got || !cr.imageUrl ? '' : cr.imageUrl].filter(Boolean).join('\n');
        Object.assign(ws.getCell(imgRow + 1, c), { value: cap, alignment: { vertical: 'top', wrapText: true }, font: { size: 9 }, border: ALL_BORDERS });
        Object.assign(ws.getCell(imgRow, c), { border: ALL_BORDERS });
      }
      r += 2;
    }
    r += 2; // a gap before the next block
  }
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return wb;
}

// ---------------------------------------------------------------------------------------------------------------- the browser
async function fetchImageInBrowser(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return null;
  const blob = await res.blob();
  // the pictures are drawn smaller (a creative can be a megabyte): the file stays light and Excel only takes png, jpeg and gif anyway
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return jpeg ? { buffer: await jpeg.arrayBuffer(), extension: 'jpeg' } : null;
}

// The file for the person: the workbook is built here and handed to `save(blob, filename)`.
export async function reportWorkbookBlob(blocks, { sheetName } = {}) {
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default;
  const wb = await buildWorkbook(ExcelJS, blocks, { sheetName, fetchImage: fetchImageInBrowser });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------------------------------------------------------------------------------------------------------------- from the rows of the history
const PLATFORM_EN = { meta: 'Meta', google: 'Google', tiktok: 'TikTok', all: '' }; // «all» is the sum of the platforms: no platform in the name of ROAS
export const platformEn = (p) => (p in PLATFORM_EN ? PLATFORM_EN[p] : String(p || ''));

// The words of a block's bar for a saved report: «Week 4», «OCTOBER SUMMARY», «Custom period».
export function titleOfRow(row, lang = null) {
  const lg = normLang(row.data?.template?.lang || lang);
  const t = trFor(lg);
  if (row.period_type === 'weekly') {
    const w = monthWeeks(monthKey(row.period_start)).find((x) => x.start === row.period_start);
    return w ? weekTitle(w.n, lg) : `${t('Week {n}', { n: `${dmy(row.period_start)} – ${dmy(row.period_end)}` })}`;
  }
  if (row.period_type === 'monthly') return `${monthSummaryTitle(row.period_start, lg)}${row.data?.toDate ? ` (${t('to date').toUpperCase()})` : ''}`;
  return t('Custom period');
}

export const rowBlock = (row, { custom = [], extraKeys = [], lang = null } = {}) => reportBlock({ row, title: titleOfRow(row, lang), custom, extraKeys, platformLabel: platformEn(row.platform), lang });

// The name of the one sheet: «Meta | Week 4», «Meta | October».
export function sheetNameOf(row) {
  const what = row.period_type === 'weekly' ? titleOfRow(row) : row.period_type === 'monthly' ? monthName(monthKey(row.period_start)) : 'Custom';
  return [platformEn(row.platform), what].filter(Boolean).join(' | ');
}

// A month card of the history (buildMonths) → the blocks of the sheet: the weeks in their order, then the month summary.
export function monthBlocks(month, { custom = [], extraKeysOf = () => [], lang = null } = {}) {
  const rows = [...month.weeks.filter((w) => w.row).map((w) => w.row), ...(month.monthly ? [month.monthly] : [])];
  return rows.map((row) => rowBlock(row, { custom, extraKeys: extraKeysOf(row), lang })).filter(Boolean);
}
