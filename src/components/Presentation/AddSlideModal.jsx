import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SlideView from './SlideView';
import ActionIcon from '../common/ActionIcon';
import { slideTitle } from './Filmstrip';
import { CATEGORIES, SLIDE_TYPES, STYLES, platformName, sampleSlide, typeInfo } from '../../lib/presentation/deckModel';
import { text } from '../../lib/presentation/textModel';

const STRUCTURE = {
  title: [['T', 'Назва звіту', 'Редагований текст'], ['T', 'Клієнт і період', 'Спільні поля презентації']],
  agenda: [['T', 'Заголовок', 'Редагований текст'], ['≡', 'Розділи', 'Нумерований список']],
  section: [['T', 'Заголовок', 'Редагований текст'], ['≡', 'Короткий текст', 'Редагований текстовий блок']],
  closing: [['T', 'Заголовок', 'Редагований текст'], ['≡', 'Контакти або підпис', 'Редагований текстовий блок']],
  metricslist: [['T', 'Заголовок', 'Редагований текст'], ['#', 'Показники', 'Назва й значення, можна додавати рядки']],
  kpigrid: [['T', 'Заголовок', 'Редагований текст'], ['#', 'Картки', 'Назва й значення, можна додавати картки']],
  campaignTable: [['T', 'Заголовок', 'Редагований текст'], ['▦', 'Таблиця', 'Показники в рядках, кампанії в стовпцях']],
  dynamicsTable: [['T', 'Заголовок', 'Редагований текст'], ['▦', 'Таблиця', '4 стовпці: показник, було, зміна, стало']],
  table: [['T', 'Заголовок', 'Редагований текст'], ['▦', 'Таблиця', 'Свої стовпці й рядки']],
  bullets: [['T', 'Заголовок', 'Редагований текст'], ['≡', 'Список', 'Маркований список']],
  paragraph: [['T', 'Заголовок', 'Редагований текст'], ['≡', 'Основний текст', 'Редагований текстовий блок']],
};

const PREVIEW_SCALE = 0.2;

function Preview({ type, deck, scale }) {
  const slide = useMemo(() => sampleSlide(type, deck.meta.lang), [type, deck.meta.lang]);
  const fake = useMemo(() => ({ ...deck, meta: { ...deck.meta, client: text(''), period: text('') } }), [deck]);
  return (
    <div style={{ width: 960 * scale, height: 540 * scale, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: 960, height: 540 }}>
        <SlideView slide={slide} deck={fake} pageNo={0} />
      </div>
    </div>
  );
}

// "Додати готовий слайд": the 11 layouts in the style and platform of the presentation.
// Choosing a card only selects it; the button inserts a live, empty layout after the chosen slide.
export default function AddSlideModal({ deck, afterId, onAdd, onClose, openerRef }) {
  const [cat, setCat] = useState('all');
  const [type, setType] = useState('paragraph');
  const [after, setAfter] = useState(afterId || deck.slides[deck.slides.length - 1]?.id);
  const box = useRef(null);
  const list = SLIDE_TYPES.filter((t) => cat === 'all' || t.cat === cat);
  const info = typeInfo(type);
  const style = STYLES.find((s) => s.id === deck.meta.style);

  useEffect(() => {
    const prev = document.activeElement;
    box.current?.querySelector('button.pb-modal-first')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll('button:not([disabled]), select, [tabindex="0"]')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = '';
      (openerRef?.current || prev)?.focus?.();
    };
  }, [onClose, openerRef]);

  return createPortal(
    <div className="pb-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="pb-modal" role="dialog" aria-modal="true" aria-labelledby="pb-modal-title">
        <header className="pb-modal-head">
          <h2 id="pb-modal-title">Додати готовий слайд</h2>
          <button type="button" className="pb-modal-close pb-iconbtn pb-modal-first" onClick={onClose} aria-label="Закрити" title="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="pb-modal-filters">
          <div className="pb-tabs" role="tablist">
            {CATEGORIES.map((c) => <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
          <div className="pb-ctx" role="note">
            <ActionIcon name="info" size={18} />
            <span>Стиль і платформа поточної презентації: <b>{style?.name}</b> · <b>{platformName(deck.meta.platform)}</b></span>
          </div>
        </div>
        <div className="pb-modal-body">
          <div className="pb-gallery" role="listbox" aria-label="Готові слайди">
            {list.map((t) => (
              <button key={t.id} type="button" role="option" aria-selected={type === t.id} className={'pb-card' + (type === t.id ? ' on' : '')} onClick={() => setType(t.id)} onDoubleClick={() => onAdd(t.id, after)}>
                <Preview type={t.id} deck={deck} scale={PREVIEW_SCALE} />
                <span className="pb-card-name">{t.name}</span>
              </button>
            ))}
          </div>
          <aside className="pb-modal-side">
            <h3>Попередній перегляд</h3>
            <div className="pb-side-view"><Preview type={type} deck={deck} scale={0.27} /></div>
            <h4>{info.name}</h4>
            <p>{info.desc}</p>
            <h3>Структура слайда</h3>
            <ul className="pb-struct">
              {(STRUCTURE[type] || []).map(([ic, name, desc]) => (
                <li key={name}><span className="pb-struct-ic">{ic}</span><span><b>{name}</b><small>{desc}</small></span></li>
              ))}
            </ul>
          </aside>
        </div>
        <footer className="pb-modal-foot">
          <label htmlFor="pb-after">Додати після слайда</label>
          <select id="pb-after" className="pb-native" value={after} onChange={(e) => setAfter(e.target.value)}>
            {deck.slides.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {slideTitle(s)}</option>)}
          </select>
          <span className="pb-spacer" />
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
          <button type="button" className="btn btn-p" onClick={() => onAdd(type, after)}><ActionIcon name="create" size={18} /> Додати слайд</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
