import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import PdfDocument from '../components/ClientReport/PdfDocument';
import { reportView } from './clientReport';
import { trFor } from './clientLang';
import { platformInfo } from './adAccounts';
import { safeFileName } from './reportExport';

// The PDF of a saved report (owner's picks 2026-11-18, decision 59): every figure of the report on dark A4 pages. The pages are drawn out of sight by PdfDocument, each is
// photographed (so charts, fonts and the heat map look exactly like the page of the client) and put into one PDF; a landscape page keeps its own size.
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function settle(host) {
  if (document.fonts?.ready) await document.fonts.ready;
  const imgs = [...host.querySelectorAll('img')];
  imgs.forEach((img) => { img.loading = 'eager'; }); // the sheets sit far outside the screen: a lazy picture would never start loading
  const waited = Promise.all(imgs.map((img) => (img.complete ? null : new Promise((res) => { img.onload = res; img.onerror = res; }))));
  await Promise.race([waited, new Promise((res) => setTimeout(res, 15000))]); // a picture that does not come is left out, the PDF is still made
  await frame();
}

// A row of the history (period_type / period_start / data …) → the view the pages are drawn from.
export function pdfViewOf(row, lang) {
  const data = { ...(row.data || {}), creatives: row.data?.creatives?.items || [] };
  const view = reportView({ id: row.id, type: row.period_type, start: row.period_start, end: row.period_end, toDate: Boolean(row.data?.toDate), status: row.status, updatedAt: row.updated_at, data }, { kind: row.data?.kind || 'ecom', lang });
  if (!view) return null;
  const all = Array.isArray(row.data?.template?.blocks) ? row.data.template.blocks : null;
  // the team's download keeps every text block, also those the client is not shown
  return { ...view, blocks: all ? all.map((b) => ({ key: b.key, title: b.title, client: b.client !== false })).concat(view.blocks.filter((b) => !all.some((x) => x.key === b.key))) : view.blocks };
}

export async function exportReportPdf(row, { projectName, custom = [], extraKeys = [], lang = null }) {
  const view = pdfViewOf(row, lang);
  if (!view) throw new Error('У цьому звіті немає цифр.');
  const platformLabel = row.platform === 'all' ? trFor(view.lang)('All platforms') : platformInfo(row.platform).label;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;pointer-events:none;';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(PdfDocument, { view, projectName, platformLabel, custom, columns: extraKeys, kind: view.kind })));
    await settle(host);
    let pages = [...host.querySelectorAll('[data-pdf-page]')];
    // an optional page with nothing on it (a report without a funnel or without creatives and notes) is dropped
    pages = pages.filter((p) => {
      if (p.hasAttribute('data-pdf-optional') && !p.querySelector('.rf, .cra, .pdf-notes')) { p.remove(); return false; }
      return true;
    });
    // short creatives and short notes share one page (a sheet is 1123 px high, 64 px of it is the footer); otherwise each keeps its own
    const cre = pages.find((p) => p.getAttribute('data-pdf-kind') === 'creatives');
    const nts = pages.find((p) => p.getAttribute('data-pdf-kind') === 'notes');
    if (cre && nts) {
      const body = (p) => [...p.children].filter((c) => !c.classList.contains('pdf-ft'));
      const bottom = (p) => { const l = body(p).pop(); return l.offsetTop + l.offsetHeight; };
      const notesNodes = body(nts).slice(1); // without the header band
      const notesH = bottom(nts) - notesNodes[0].offsetTop;
      if (bottom(cre) + 16 + notesH <= 1123 - 64) {
        const foot = cre.querySelector('.pdf-ft');
        notesNodes.forEach((n) => cre.insertBefore(n.cloneNode(true), foot));
        const title = cre.querySelector('.pdf-hdr .nm b');
        if (title && cre.getAttribute('data-pdf-merged-title')) title.textContent = cre.getAttribute('data-pdf-merged-title');
        nts.remove();
        pages = pages.filter((p) => p !== nts);
      }
    }
    pages.forEach((p, i) => p.querySelectorAll('.pdf-pn').forEach((n) => { n.textContent = n.getAttribute('data-t').replace('{n}', i + 1).replace('{N}', pages.length); }));
    // the letter of the logo is cut out with `fill: var(--card)`; a photographed copy loses the variable and paints the disc white, so the colour is written in
    host.querySelectorAll('.logo svg g[style]').forEach((g) => { g.style.fill = '#1c0722'; });
    await frame();
    let pdf = null;
    for (let i = 0; i < pages.length; i += 1) {
      const el = pages[i];
      const w = el.offsetWidth;
      const h = Math.max(el.offsetHeight, el.scrollHeight); // a page with more content than a sheet holds grows (the PDF page grows with it)
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await toJpeg(el, { pixelRatio: 2, quality: 0.93, backgroundColor: '#17051c', cacheBust: true, width: w, height: h, imagePlaceholder: GIF });
      const orient = w > h ? 'l' : 'p';
      if (!pdf) pdf = new jsPDF({ unit: 'px', format: [w, h], orientation: orient, hotfixes: ['px_scaling'] });
      else pdf.addPage([w, h], orient);
      pdf.addImage(dataUrl, 'JPEG', 0, 0, w, h);
    }
    pdf.save(safeFileName(`${projectName}_${row.period_type}_${row.period_start}_${row.platform}`) + '.pdf');
  } finally {
    root.unmount();
    host.remove();
  }
}
