import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import { DEFAULT_QUICK_COLORS } from '../common/ColorPickerControl';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import '../../styles/dropdownAnim.css';

const CLOSE_MS = 140;
const CHECK_ICON = '<svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>';

// The "Сервіс" field on a deal — a multi-select of colored tags shared
// across every deal (the catalog lives in `deal_service_tags`), with an
// inline "add new" row so a missing service can be added on the spot
// instead of needing a separate management screen.
export default function ServiceTagsField({ value, catalog, onToggle, onCreate }) {
  const containerRef = useRef(null);
  const popoverRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_QUICK_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open, 6, 340);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (containerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    // Same fixed-position-doesn't-track-scroll issue as Select — close
    // instead of leaving it floating in the wrong spot once the page (not
    // the tag list itself) scrolls.
    function onScroll(e) { if (!popoverRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const selected = catalog.filter((t) => value.includes(t.id));

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label || creating) return;
    setCreating(true);
    try {
      await onCreate(label, newColor);
      setNewLabel('');
      setNewColor(DEFAULT_QUICK_COLORS[(DEFAULT_QUICK_COLORS.indexOf(newColor) + 1) % DEFAULT_QUICK_COLORS.length]);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="wk-field-box wk-field-box-wide" ref={containerRef}>
      <span className="wk-field-icon" dangerouslySetInnerHTML={{ __html: FIELD_ICONS.megaphone }} />
      <div className="wk-field-body">
        <label>Сервіс</label>
        <button type="button" className="service-tags-trigger" onClick={() => setOpen((o) => !o)}>
          {selected.length ? (
            <span className="service-tags-chips">
              {selected.map((t) => (
                <span key={t.id} className="service-tag-chip" style={{ background: t.color + '1f', color: t.color }}>{t.label}</span>
              ))}
            </span>
          ) : <span className="ui-select-placeholder">Оберіть сервіси...</span>}
        </button>
      </div>
      {rendered && createPortal(
        <div
          ref={popoverRef}
          className={'service-tags-menu' + (open ? '' : ' closing') + (pos.placement === 'top' ? ' placement-top' : '')}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.width }}
        >
          <div className="service-tags-list">
            {catalog.map((t) => {
              const active = value.includes(t.id);
              return (
                <button
                  type="button" key={t.id}
                  className={'service-tags-row' + (active ? ' active' : '')}
                  onClick={() => onToggle(t.id)}
                >
                  <span className="service-tags-dot" style={{ background: t.color }} />
                  <span className="service-tags-row-label">{t.label}</span>
                  {active && <span className="service-tags-check" dangerouslySetInnerHTML={{ __html: CHECK_ICON }} />}
                </button>
              );
            })}
            {!catalog.length && <p className="ui-select-empty">Ще немає жодної мітки</p>}
          </div>
          <div className="service-tags-add">
            <div className="service-tags-add-colors">
              {DEFAULT_QUICK_COLORS.map((c) => (
                <button
                  type="button" key={c} className={'service-tags-add-swatch' + (c === newColor ? ' active' : '')}
                  style={{ background: c }} onClick={() => setNewColor(c)} aria-label={c}
                />
              ))}
            </div>
            <div className="service-tags-add-row">
              <input
                type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Нова мітка..." onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              />
              <button type="button" className="service-tags-add-btn" disabled={!newLabel.trim() || creating} onClick={handleCreate}>
                <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.plus }} />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
