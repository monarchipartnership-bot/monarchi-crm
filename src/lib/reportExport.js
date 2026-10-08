import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

// Export of a report table: CSV, XLSX, and PNG / PDF of what is on screen.
// A "model" is { title, sheets: [{ name, columns: [..], rows: [[..], ..] }] }.

export function safeFileName(name) {
  return String(name || 'report').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_').slice(0, 80);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportCsv(model, filename) {
  const NL = String.fromCharCode(10);
  const parts = model.sheets.map((sh) => {
    const lines = [sh.columns, ...sh.rows].map((r) => r.map(csvCell).join(','));
    return (model.sheets.length > 1 ? csvCell(sh.name) + NL : '') + lines.join(NL);
  });
  // BOM so Excel opens Ukrainian text as UTF-8.
  download(new Blob(['﻿' + parts.join(NL + NL)], { type: 'text/csv;charset=utf-8' }), filename + '.csv');
}

export function exportXlsx(model, filename) {
  const wb = XLSX.utils.book_new();
  model.sheets.forEach((sh, i) => {
    const ws = XLSX.utils.aoa_to_sheet([sh.columns, ...sh.rows]);
    ws['!cols'] = sh.columns.map((c, ci) => ({ wch: Math.max(String(c).length, ...sh.rows.map((r) => String(r[ci] ?? '').length), 8) + 2 }));
    XLSX.utils.book_append_sheet(wb, ws, String(sh.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename + '.xlsx');
}

async function snapshot(node) {
  return toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
}

export async function exportPng(node, filename) {
  const dataUrl = await snapshot(node);
  const blob = await (await fetch(dataUrl)).blob();
  download(blob, filename + '.png');
}

// A one-page PDF as tall as the table needs (no page breaks through a row).
export async function exportPdf(node, filename) {
  const dataUrl = await snapshot(node);
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });
  const w = Math.round(img.width / 2);
  const h = Math.round(img.height / 2);
  const pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: w > h ? 'l' : 'p', hotfixes: ['px_scaling'] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, w, h);
  pdf.save(filename + '.pdf');
}
