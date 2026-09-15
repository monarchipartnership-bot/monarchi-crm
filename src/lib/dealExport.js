import Papa from 'papaparse';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { htmlToPlainText } from './sanitizeHtml';

// Shared row data for CSV/XLSX so the two formats never drift apart.
export function buildDealExportRows(deal, dealNotes, tasks) {
  return [
    { 'Поле': 'Титул', 'Значення': deal.title || deal.clients?.company || deal.clients?.name || '' },
    { 'Поле': 'Клієнт', 'Значення': deal.clients?.name || '' },
    { 'Поле': 'Компанія', 'Значення': deal.clients?.company || '' },
    { 'Поле': 'Pipeline', 'Значення': deal.pipelines?.name || '' },
    { 'Поле': 'Стадія', 'Значення': deal.deal_stages?.label || '' },
    { 'Поле': 'Сума', 'Значення': deal.amount ?? '' },
    { 'Поле': 'Валюта', 'Значення': deal.currency || '' },
    { 'Поле': 'Джерело', 'Значення': deal.source || '' },
    { 'Поле': 'Менеджер', 'Значення': deal.manager || '' },
    { 'Поле': 'Дата заведення', 'Значення': deal.created_at ? new Date(deal.created_at).toLocaleDateString('uk-UA') : '' },
    { 'Поле': 'Очікуване закриття', 'Значення': deal.expected_close_date || '' },
    { 'Поле': 'Chat link', 'Значення': deal.chat_link || '' },
    { 'Поле': 'Вебсайт', 'Значення': deal.website || '' },
    { 'Поле': 'Нотатки', 'Значення': (dealNotes || []).map((n) => htmlToPlainText(n.text)).join(' | ') },
    { 'Поле': 'Активності', 'Значення': (tasks || []).map((t) => (t.text || '').split('\n')[0]).join(' | ') },
  ];
}

function dealFilename(deal, ext) {
  const base = (deal.title || deal.clients?.company || deal.clients?.name || 'Угода')
    .replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9 _-]/g, '').trim() || 'Угода';
  return `${base} ${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function exportDealCSV(deal, rows) {
  const csv = Papa.unparse(rows);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = dealFilename(deal, 'csv');
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportDealXLSX(deal, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Угода');
  XLSX.writeFile(wb, dealFilename(deal, 'xlsx'));
}

// Unlike the report pages' exportJPEG, this does NOT hide buttons via a
// "capturing" class first — display:none-ing elements inside the very
// subtree html2canvas is about to walk makes it hang indefinitely on this
// page (reproduced directly: with the class toggle it never resolves, with
// it removed it resolves in well under a second). Capturing the page as-is,
// buttons included, is the reliable trade-off.
//
// Also uses a plain timeout rather than requestAnimationFrame to let React
// commit before the snapshot — rAF is paused by browsers for backgrounded/
// unfocused tabs, which would silently stall an export the user kicked off
// and then alt-tabbed away from.
async function captureCanvas(el) {
  await new Promise((r) => setTimeout(r, 50));
  if (document.fonts?.ready) await document.fonts.ready;
  return html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
}

export async function exportDealPNG(el, deal) {
  if (!el) return;
  try {
    const canvas = await captureCanvas(el);
    const link = document.createElement('a');
    link.download = dealFilename(deal, 'png');
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('Не вдалося створити зображення: ' + err.message);
  }
}

export async function exportDealPDF(el, deal) {
  if (!el) return;
  try {
    const canvas = await captureCanvas(el);
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
      unit: 'px', format: [canvas.width, canvas.height], compress: true,
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
    pdf.save(dealFilename(deal, 'pdf'));
  } catch (err) {
    alert('Не вдалося створити PDF: ' + err.message);
  }
}
