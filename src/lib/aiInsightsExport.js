import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

// Downloads for the Ads Insights Analyst's table/chart messages — same
// four formats and the same underlying libs as src/lib/dealExport.js,
// just fed from a chat message's `visual` payload instead of a deal.

function filename(title, ext) {
  const base = (title || 'Звіт').replace(/[^a-zA-Zа-яА-ЯіїєґІЇЄҐ0-9 _-]/g, '').trim() || 'Звіт';
  return `${base} ${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function tableToRows({ columns, rows }) {
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
}

export function exportTableCSV({ title, columns, rows }) {
  const csv = Papa.unparse(tableToRows({ columns, rows }));
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename(title, 'csv');
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportTableXLSX({ title, columns, rows }) {
  const ws = XLSX.utils.json_to_sheet(tableToRows({ columns, rows }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Дані');
  XLSX.writeFile(wb, filename(title, 'xlsx'));
}

export function exportChartPNG(chartInstance, title) {
  if (!chartInstance) return;
  const link = document.createElement('a');
  link.download = filename(title, 'png');
  link.href = chartInstance.toBase64Image();
  link.click();
}

export function exportChartPDF(chartInstance, title) {
  if (!chartInstance) return;
  try {
    const canvas = chartInstance.canvas;
    const pdf = new jsPDF({
      orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
      unit: 'px', format: [canvas.width, canvas.height], compress: true,
    });
    pdf.addImage(chartInstance.toBase64Image('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename(title, 'pdf'));
  } catch (err) {
    alert('Не вдалося створити PDF: ' + err.message);
  }
}
