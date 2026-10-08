import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import SlideView, { COVERS, SLIDE_H, SLIDE_W } from '../../components/Presentation/SlideView';
import { fontsReady } from './fonts';
import { visibleSlides } from './deckModel';

// requestAnimationFrame never fires in a background tab, so a timer backs it up (the export must not hang).
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 120); });

async function decodeImages(urls) {
  await Promise.all(urls.map(async (u) => {
    const img = new Image();
    img.src = u;
    try { await img.decode(); } catch { /* a broken image just stays missing */ }
  }));
}

// Draws every visible slide at its real size (960x540) outside the screen, with fonts and
// pictures loaded, so a PDF / PPTX is made from the same slides the editor shows.
// Returns { host, slides: [element], cleanup }.
export async function renderForExport(deck, { bgOnly = false } = {}) {
  const slides = visibleSlides(deck);
  const host = document.createElement('div');
  host.className = 'pres-exporting' + (bgOnly ? ' pres-bgonly' : '');
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${SLIDE_W}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => {
    root.render(slides.map((s, i) => (
      <div key={s.id} className="pres-export-slide" style={{ width: SLIDE_W, height: SLIDE_H }}>
        <SlideView slide={s} deck={deck} pageNo={i + 1} />
      </div>
    )));
  });
  await fontsReady();
  await decodeImages(Object.values(COVERS));
  await nextFrame();
  await nextFrame();
  return {
    host,
    slides: [...host.querySelectorAll('.pres-slide')],
    models: slides,
    cleanup: () => { root.unmount(); host.remove(); },
  };
}
