import { memo, useEffect, useRef, useState } from 'react';
import SlideView from './SlideView';
import ActionIcon from '../common/ActionIcon';
import { Popover } from './TextControls';
import { plain } from '../../lib/presentation/textModel';
import { typeInfo } from '../../lib/presentation/deckModel';

export const THUMB_W = 160;

// A readable name for a slide (its heading, else its type).
export function slideTitle(slide) {
  const d = slide.data || {};
  const head = plain(d.heading || d.title1 || d.title2);
  return head.trim() || typeInfo(slide.type).name;
}

const Thumb = memo(function Thumb({ slide, deck, pageNo }) {
  return (
    <div className="pb-thumb-view" aria-hidden="true">
      <div style={{ transform: `scale(${THUMB_W / 960})`, transformOrigin: '0 0', width: 960, height: 540 }}>
        <SlideView slide={slide} deck={deck} pageNo={pageNo} />
      </div>
    </div>
  );
}, (a, b) => a.slide === b.slide && a.deck.meta === b.deck.meta && a.pageNo === b.pageNo);

export default function Filmstrip({ deck, activeId, onSelect, onMove, onToggleHidden, onDuplicate, onRemove, onReorder }) {
  const strip = useRef(null);
  const [menu, setMenu] = useState(null); // { id, anchor }
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const slides = deck.slides;
  // Page number of every slide among the visible ones (a hidden slide has none).
  const pageNos = slides.map((s, i) => (s.hidden ? 0 : slides.slice(0, i + 1).filter((x) => !x.hidden).length));

  // Keep the active slide in view.
  useEffect(() => {
    // Scroll only the strip itself: scrollIntoView would also scroll the whole page behind the top bar.
    const box = strip.current;
    const el = box?.querySelector(`[data-slide="${activeId}"]`);
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft) box.scrollTo({ left: left - 8, behavior: 'smooth' });
    else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left + el.offsetWidth - box.clientWidth + 8, behavior: 'smooth' });
  }, [activeId, slides.length]);

  function onWheel(e) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && strip.current) { strip.current.scrollLeft += e.deltaY; }
  }

  function onKey(e) {
    const i = slides.findIndex((s) => s.id === activeId);
    if (e.key === 'ArrowRight' && i < slides.length - 1) { e.preventDefault(); onSelect(slides[i + 1].id); }
    if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); onSelect(slides[i - 1].id); }
  }

  const scrollBy = (d) => strip.current?.scrollBy({ left: d * 340, behavior: 'smooth' });

  return (
    <div className="pb-film" data-editor-only="true">
      <button type="button" className="pb-film-arrow" aria-label="Попередні слайди" onClick={() => scrollBy(-1)}><ActionIcon name="back" size={18} /></button>
      <div className="pb-film-strip" ref={strip} onWheel={onWheel} onKeyDown={onKey} role="listbox" aria-label="Слайди презентації" tabIndex={0}>
        {slides.map((s, i) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id} data-slide={s.id} role="option" aria-selected={active}
              className={'pb-thumb' + (active ? ' on' : '') + (s.hidden ? ' hidden' : '') + (overId === s.id && dragId !== s.id ? ' over' : '')}
              draggable onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); setOverId(s.id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== s.id) onReorder(dragId, i); setDragId(null); setOverId(null); }}
            >
              <button type="button" className="pb-thumb-btn" onClick={() => onSelect(s.id)} aria-label={`Слайд ${i + 1}: ${slideTitle(s)}${s.hidden ? ' (прихований)' : ''}`}>
                <Thumb slide={s} deck={deck} pageNo={pageNos[i]} />
                <span className="pb-thumb-num">{i + 1}</span>
                {s.hidden && <span className="pb-thumb-eye" title="Прихований: не потрапляє в експорт"><ActionIcon name="visibility" size={14} /></span>}
              </button>
              <div className="pb-thumb-foot">
                <span className="pb-thumb-name">{slideTitle(s)}</span>
                <button type="button" className="pb-thumb-menu" aria-label={`Дії зі слайдом ${i + 1}`} aria-haspopup="menu" onClick={(e) => setMenu({ id: s.id, anchor: { current: e.currentTarget } })}>⋮</button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="pb-film-arrow next" aria-label="Наступні слайди" onClick={() => scrollBy(1)}><ActionIcon name="back" size={18} /></button>
      {menu && (() => {
        const i = slides.findIndex((s) => s.id === menu.id);
        const s = slides[i];
        if (!s) return null;
        const close = () => setMenu(null);
        const act = (fn) => () => { fn(); close(); };
        return (
          <Popover anchor={menu.anchor} onClose={close} width={210}>
            <div className="pb-menu" role="menu">
              <button type="button" role="menuitem" onClick={act(() => onToggleHidden(s.id))}><ActionIcon name="visibility" size={16} /> {s.hidden ? 'Показати слайд' : 'Приховати слайд'}</button>
              <button type="button" role="menuitem" onClick={act(() => onDuplicate(s.id))}><ActionIcon name="copy" size={16} /> Дублювати</button>
              <button type="button" role="menuitem" disabled={i === 0} onClick={act(() => onMove(s.id, i - 1))}><ActionIcon name="reorder" size={16} /> Перемістити ліворуч</button>
              <button type="button" role="menuitem" disabled={i === slides.length - 1} onClick={act(() => onMove(s.id, i + 1))}><ActionIcon name="reorder" size={16} /> Перемістити праворуч</button>
              <button type="button" role="menuitem" className="danger" disabled={slides.length <= 1} onClick={act(() => onRemove(s.id))}><ActionIcon name="delete" size={16} /> Видалити</button>
            </div>
          </Popover>
        );
      })()}
    </div>
  );
}
