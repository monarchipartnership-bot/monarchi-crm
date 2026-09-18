import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnimatedOpen } from '../../lib/useAnimatedOpen';
import { useFloatingPosition } from '../../lib/useFloatingPosition';
import '../../styles/dropdownAnim.css';
import '../../styles/select.css';

const CLOSE_MS = 140;
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';

// Rounded custom dropdown replacing a native <select> — same look/feel as
// the type/date pickers, for anywhere a plain OS-styled select would clash
// with the rest of the app's UI. `searchable` adds a text filter at the top
// of the menu — for long lists (e.g. the deal's Country field) where
// scrolling to find one option by eye isn't practical.
export default function Select({ value, onChange, options, placeholder, bare, className, style, searchable, disabled, side }) {
  const containerRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rendered = useAnimatedOpen(open, CLOSE_MS);
  const pos = useFloatingPosition(containerRef, open, 6, 320, 'auto', 280, side);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) { if (!containerRef.current?.contains(e.target)) setOpen(false); }
    function onKeyDown(e) { if (e.key === 'Escape') setOpen(false); }
    // The menu is portaled to <body> with `position: fixed`, computed once
    // against the trigger's on-screen spot at open time — it doesn't track
    // the trigger as the page scrolls. Left open, it would stay pinned to
    // that spot while the trigger (and the rest of the page) scrolls out
    // from under it, so it visually "detaches" instead of following the
    // field. Closing on any scroll outside the menu's own option list (that
    // one should still scroll normally) avoids that disconnect.
    function onScroll(e) { if (!menuRef.current?.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    // Attached a tick late: focusing the search input (below) can itself
    // trigger a browser-initiated scroll-into-view on open, which would
    // otherwise be seen right away as an "outside scroll" and instantly
    // close the menu it just opened.
    const t = setTimeout(() => window.addEventListener('scroll', onScroll, true), 0);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(t);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    if (searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const current = options.find((o) => o.value === value);
  const shown = searchable && query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className={'ui-select' + (bare ? ' ui-select--bare' : '') + (disabled ? ' ui-select--disabled' : '') + (className ? ' ' + className : '')} style={style} ref={containerRef}>
      <button type="button" className="ui-select-trigger" onClick={() => setOpen((o) => !o)} disabled={disabled}>
        <span className={'ui-select-current' + (current ? '' : ' ui-select-placeholder')}>
          {current?.iconClassName && <span className={'ui-select-icon ' + current.iconClassName} />}
          {current ? current.label : (placeholder || '')}
        </span>
        {!disabled && <span className="ui-select-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />}
      </button>
      {rendered && !disabled && createPortal(
        <div
          ref={menuRef}
          className={'ui-select-menu' + (open ? '' : ' closing') + (pos.placement === 'top' ? ' placement-top' : '') + (pos.placement === 'left' ? ' placement-left' : '') + (searchable ? ' ui-select-menu--searchable' : '')}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, right: pos.right, minWidth: pos.width }}
        >
          {searchable && (
            <input
              ref={searchRef} type="text" className="ui-select-search" placeholder="Пошук..."
              value={query} onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="ui-select-options">
            {shown.map((o) => (
              <button
                type="button" key={o.value}
                className={'ui-select-row' + (o.value === value ? ' active' : '')}
                onClick={() => { onChange(o.value); setOpen(false); }}
              >
                {o.iconClassName && <span className={'ui-select-icon ' + o.iconClassName} />}
                {o.label}
              </button>
            ))}
            {searchable && !shown.length && <p className="ui-select-empty">Нічого не знайдено</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
