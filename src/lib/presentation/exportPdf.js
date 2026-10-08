import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { renderForExport } from './exportCommon.jsx';
import { SLIDE_H, SLIDE_W } from '../../components/Presentation/SlideView';

const OPTS = { width: SLIDE_W, height: SLIDE_H, pixelRatio: 2, quality: 0.93, cacheBust: false, backgroundColor: '#270827' };

// One PDF page per visible slide, in deck order. Pages are pictures of the slides (the text
// is not selectable), taken from the same drawing the editor uses, without any editor chrome.
export async function exportPdf(deck, fileBase, { returnBlob = false } = {}) {
  const out = await renderForExport(deck);
  try {
    if (!out.slides.length) throw new Error('У презентації немає видимих слайдів.');
    // The first capture warms up font and image embedding; its result is thrown away.
    await toJpeg(out.slides[0], OPTS).catch(() => null);
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_W, SLIDE_H], hotfixes: ['px_scaling'] });
    for (let i = 0; i < out.slides.length; i += 1) {
      const data = await toJpeg(out.slides[i], OPTS);
      if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
      pdf.addImage(data, 'JPEG', 0, 0, SLIDE_W, SLIDE_H, undefined, 'FAST');
    }
    if (returnBlob) return pdf.output('blob');
    pdf.save(`${fileBase}.pdf`);
    return null;
  } finally {
    out.cleanup();
  }
}
