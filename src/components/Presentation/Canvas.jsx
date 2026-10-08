import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import SlideView, { SLIDE_H, SLIDE_W } from './SlideView';
import FloatingToolbar from './FloatingToolbar';
import { EditorContext } from './editorContext';
import { fontsReady } from '../../lib/presentation/fonts';

// The big slide in the middle: drawn at 960x540 and scaled to the space it has.
export default function Canvas({ deck, slide, pageNo, total, editor, textInfo, cmds, sel, rootRef, onClear }) {
  const viewport = useRef(null);
  const slideBox = useRef(null);
  const [scale, setScale] = useState(1);
  const [overflow, setOverflow] = useState(false);
  const [tick, setTick] = useState(0);
  const [blockEl, setBlockEl] = useState(null);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth - 32;
      const h = el.clientHeight - 32;
      if (w > 0 && h > 0) setScale(Math.max(0.3, Math.min(w / SLIDE_W, h / SLIDE_H, 1.6)));
      setTick((t) => t + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Text that runs past the bottom of the slide is never cut off: the person is told instead.
  useEffect(() => {
    let off = false;
    const run = async () => {
      await fontsReady();
      if (off || !slideBox.current) return;
      const root = slideBox.current.querySelector('.pres-slide');
      if (!root) return;
      const r = root.getBoundingClientRect();
      const limit = r.top + (SLIDE_H - 36) * (r.height / SLIDE_H);
      const bad = [...root.querySelectorAll('.pt, .ps-table, .ps-metrics, .ps-kpis')].some((n) => n.getBoundingClientRect().bottom > limit + 1);
      setOverflow(bad);
    };
    run();
    return () => { off = true; };
  }, [deck, slide.id, scale]);

  // The block the toolbar is attached to.
  useLayoutEffect(() => {
    setBlockEl(sel ? slideBox.current?.querySelector(`[data-block="${sel.blockId.replace(/"/g, '\\"')}"]`) || null : null);
  }, [sel, deck, scale]);

  const ctx = useMemo(() => ({ ...editor, editable: true, selectedId: sel?.blockId || null }), [editor, sel]);

  return (
    <div className="pb-canvas-wrap">
      <div ref={(n) => { viewport.current = n; if (rootRef) rootRef.current = n; }} className="pb-canvas" onMouseDown={(e) => { if (!e.target.closest('[data-rich],[data-cell],[data-floating],.pb-pop')) onClear(); }}>
        <div ref={slideBox} className="pb-slidebox" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
          <div className="pb-slidescale" style={{ transform: `scale(${scale})` }}>
            <EditorContext.Provider value={ctx}>
              <SlideView slide={slide} deck={deck} pageNo={pageNo} />
            </EditorContext.Provider>
          </div>
        </div>
        {textInfo && <FloatingToolbar blockEl={blockEl} viewport={viewport.current} info={textInfo} cmds={cmds} tick={tick} />}
      </div>
      <div className="pb-canvas-bar">
        <span className="pb-bar-title"><b>Слайд</b> {pageNo || '—'} з {total}</span>
        {overflow && <span className="pb-warn" role="status">Текст виходить за межі слайда: зменште розмір шрифту або скоротіть текст</span>}
        <span className="pb-bar-hint">Натисніть текст на слайді, щоб редагувати</span>
        <span className="pb-bar-ratio">16:9</span>
      </div>
    </div>
  );
}
